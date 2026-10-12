import { describe, expect, it, vi } from 'vitest';
import { Runner, type PageApi } from '../utils/runner';
import { normalizeSettings, DEFAULT_PROMPT } from '../utils/settings';
import type { PageView, RoundRecord, TurnProbe } from '../utils/types';

const ROOT = 'https://arena.ai/work';
const CHAT = 'https://arena.ai/work/0f8fad5b-d9cb-469f-a165-70867728950e';

/** 一个最小的「假 Arena 页面」：模拟新对话 → 填写 → 发送 → 回答完成 → 探针给出官方型号。 */
function fakeArena(opts: { resolved?: string | null; family?: string } = {}) {
  let url = ROOT;
  let draft = '';
  let conversation = false;
  let answerTicks = -1;
  const actions: string[] = [];
  const promptActions: Array<{ name: string; prompt: string }> = [];
  const renamed: string[] = [];
  const api: PageApi = {
    async read(): Promise<PageView> {
      if (answerTicks > 0) answerTicks--;
      const done = answerTicks === 0;
      return {
        url, allowed: true, main: true, conversation, promptConfirmed: conversation,
        generating: answerTicks > 0, activity: false, failed: false, response: done,
        responseSignature: done ? 'sig' : '', progressSignature: String(answerTicks),
        completionConfirmed: done, draft, editor: true, blocker: '', termsPending: false,
        sendReady: !!draft, newLinks: 1, canExpand: false,
      };
    },
    async action(name, prompt) {
      actions.push(name);
      promptActions.push({ name, prompt });
      if (name === 'new') { url = ROOT; conversation = false; draft = ''; answerTicks = -1; }
      if (name === 'fill') draft = prompt;
      if (name === 'send') { draft = ''; conversation = true; url = CHAT; answerTicks = 3; }
    },
    clickChoice: async () => false,
    probe: async () => ({ api: true, runId: 'run-1' }),
    beginTurn: async () => ({ ok: true }),
    async snapshotTurn(turnId): Promise<TurnProbe> {
      const done = answerTicks === 0;
      if (opts.resolved !== undefined && done) {
        return opts.resolved
          ? { api: true, turnId, mode: 'RESOLVED', arenaName: opts.resolved, providerName: 'prov', captureBound: true, routeMatched: true, familyConflict: false }
          : { api: true, turnId, mode: 'RESOLVED', captureBound: true, routeMatched: true, familyConflict: false };
      }
      if (opts.family && done) {
        return { api: true, turnId, mode: 'INFERRED', family: opts.family, captureBound: true, routeMatched: true, familyConflict: false };
      }
      return { api: true, turnId, mode: null, captureBound: true, routeMatched: true, familyConflict: false };
    },
    endTurn: async () => undefined,
    async renameConversation(_t, title) { renamed.push(title); },
    stamp: async () => '10-09 10:00',
  };
  return { api, actions, promptActions, renamed };
}

async function run(api: PageApi, settings = normalizeSettings({ limit: 2, roundPauseSeconds: 0 })) {
  let clock = 0;
  const rounds: RoundRecord[] = [];
  const messages: string[] = [];
  const runner = new Runner(api, {
    say: (_p, m) => messages.push(m),
    isActive: () => true,
    onModel: () => undefined,
    onRound: (r) => rounds.push(r),
    now: () => clock,
    uuid: () => 'turn-' + rounds.length,
  }, settings);
  for (let i = 0; i < 500; i++) {
    clock += 900;
    const stop = await runner.tick();
    if (stop) return { stop, rounds, messages };
  }
  throw new Error('runner did not stop');
}

describe('Runner', () => {
  it('draws rounds until the limit with the official model name', async () => {
    const page = fakeArena({ resolved: 'gpt-6-sol-high' });
    const { stop, rounds } = await run(page.api);
    expect(rounds.map((r) => r.model)).toEqual(['gpt-6-sol-high', 'gpt-6-sol-high']);
    expect(stop).toContain('已完成 2/2 轮');
    expect(page.renamed[0]).toBe('gpt-6-sol-high');
    expect(page.actions.filter((a) => a === 'send')).toHaveLength(2);
  });

  it('uses a fresh random ten-letter filename for each prompt send', async () => {
    let randomCalls = 0;
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => (randomCalls++ < 10 ? 0 : 0.05));
    try {
      const page = fakeArena({ resolved: 'gpt-6-sol-high' });
      await run(page.api);
      const filled = page.promptActions.filter(action => action.name === 'fill').map(action => action.prompt);
      const sent = page.promptActions.filter(action => action.name === 'send').map(action => action.prompt);
      expect(filled).toEqual([
        DEFAULT_PROMPT.replace('nonexistent.txt', 'aaaaaaaaaa.txt'),
        DEFAULT_PROMPT.replace('nonexistent.txt', 'bbbbbbbbbb.txt'),
      ]);
      expect(sent).toEqual(filled);
      expect(randomCalls).toBe(20);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('stops when the target model is hit', async () => {
    const page = fakeArena({ resolved: 'claude-opus-5-max' });
    const { stop, rounds } = await run(page.api, normalizeSettings({ limit: 10, roundPauseSeconds: 0, targetKeywords: 'opus-5' }));
    expect(rounds).toHaveLength(1);
    expect(rounds[0]!.hit).toBe(true);
    expect(stop).toContain('抽到目标模型');
  });

  it('falls back to the family guess when no official name arrives', async () => {
    const page = fakeArena({ family: 'anthropic' });
    const { rounds } = await run(page.api, normalizeSettings({ limit: 1, familyWaitSeconds: 3 }));
    expect(rounds[0]!.model).toBe('Claude 家族（推测）');
  });

  it('skips renaming when disabled', async () => {
    const page = fakeArena({ resolved: 'gemini-3.8-pro' });
    await run(page.api, normalizeSettings({ limit: 1, autoRename: false }));
    expect(page.renamed).toHaveLength(0);
  });

  it('never re-sends when the page reports a failure', async () => {
    const page = fakeArena({ resolved: 'x' });
    const failing: PageApi = {
      ...page.api,
      async read(prompt) {
        const v = await page.api.read(prompt);
        return v.conversation ? { ...v, failed: true } : v;
      },
    };
    const { stop } = await run(failing);
    expect(stop).toContain('本轮作废');
    expect(page.actions.filter((a) => a === 'send')).toHaveLength(1);
  });
});

// Integration contract: original draw loop + separately injected fingerprint subsystem.
import type { FingerprintPorts } from '../utils/runner';
import type { Answer } from '../utils/fingerprint/types';
function fingerprintArena(family = 'openai', initialSignature = 'net:input:answer:hash:1') {
  const base = fakeArena({ family });
  let fpDraft = '', signature = initialSignature, roundSends = 0, lastTurn = '';
  const sent: string[] = [], samples: number[] = [], notes: string[] = [];
  const action = base.api.action;
  base.api.action = async (...args) => {
    if (args[0] === 'new') { fpDraft = ''; signature = initialSignature; roundSends = 0; }
    await action(...args);
  };
  const snapshot = base.api.snapshotTurn;
  base.api.snapshotTurn = async id => { lastTurn = id; return snapshot(id); };
  const ports: FingerprintPorts = {
    page: {
      read: async prompt => ({ ...await base.api.read(prompt), draft: fpDraft, responseSignature: signature }),
      snapshot: id => base.api.snapshotTurn(id),
      action: async (name, opts) => {
        expect(opts.expectedResponseSignature).toBe(signature);
        if (name === 'fill') fpDraft = opts.prompt;
        else { sent.push(opts.prompt); roundSends++; fpDraft = ''; signature = `fp-${roundSends}`; }
      },
      readAnswer: async () => ({ text: '1 '.repeat(292), oversize: false }),
    },
    service: {
      prepare: async () => {},
      score: async (a: Answer[]) => { samples.push(a.length); return { kind: 'candidate', candidate: { family: 'openai', displayName: 'GPT Test', modelId: 'gpt-test' } }; },
    },
  };
  async function execute(everyTurn: boolean, limit = 2) {
    const rounds: RoundRecord[] = [];
    let clock = 0;
    const settings = normalizeSettings({ fingerprintFamilies: ['openai'], fingerprintEveryTurn: everyTurn, limit, roundPauseSeconds: 0 });
    const runner = new Runner(base.api, {
      now: () => clock, uuid: () => `turn-${rounds.length}`, isActive: () => true, onModel: () => {},
      say: (_phase, text) => notes.push(text), onRound: r => rounds.push(r),
    }, settings, '', true, ports);
    for (let i = 0; i < 200; i++) { clock += 900; const stop = await runner.tick(); if (stop) return { rounds, stop }; }
    throw new Error('fingerprint runner did not stop');
  }
  return { ...base, execute, ports, sent, samples, notes, turn: () => lastTurn };
}
describe('Runner fingerprint integration', () => {
  it('counts three challenges as one round and reuses candidate in selected-family mode', async () => {
    const h = fingerprintArena(); const { rounds } = await h.execute(false);
    expect(rounds).toHaveLength(2); expect(h.sent).toHaveLength(3); expect(h.samples).toEqual([3]);
    expect(rounds.every(r => r.model === 'GPT Test（指纹推测）')).toBe(true);
    expect(rounds[1]!.note).toContain('非本轮重新评分');
    expect(h.renamed[0]).toBe('GPT Test');
  });
  it('every-turn mode runs three fresh requests each round', async () => {
    const h = fingerprintArena(); const { rounds } = await h.execute(true);
    expect(rounds).toHaveLength(2); expect(h.sent).toHaveLength(6); expect(h.samples).toEqual([3, 3]);
  });
  it('stops without renaming or advancing to another round when preparation fails', async () => {
    const h = fingerprintArena(); h.ports.service.prepare = async () => { throw new Error('service unavailable'); };
    const { rounds, stop } = await h.execute(true, 2);
    expect(rounds).toHaveLength(0); expect(h.sent).toHaveLength(0); expect(h.renamed).toHaveLength(0);
    expect(stop).toContain('GPT 家族'); expect(stop).toContain('已停止任务');
    expect(h.actions.filter(a => a === 'send')).toHaveLength(1);
  });
});


describe('tool-call family survives optional refinement', () => {
  it.each(['grok', 'qwen/glm', 'glm', 'deepseek'])('preserves %s when optional refinement preparation fails', async family => {
    const h = fingerprintArena(family);
    h.ports.service.prepare = async () => { throw new Error('blocked'); };
    const { rounds, stop } = await h.execute(true, 2);
    expect(rounds).toHaveLength(0); expect(h.renamed).toHaveLength(0); expect(h.sent).toHaveLength(0);
    expect(stop).toContain('此前工具调用家族判断'); expect(stop).not.toContain('模型家族未知');
  });
  it.each(['openai', 'claude', 'gemini', 'grok', 'qwen/glm', 'deepseek'])('vendor-only draw handles %s without offline scoring', async family => {
    const page = fakeArena({ family });
    const { rounds } = await run(page.api, normalizeSettings({ limit: 1, familyWaitSeconds: 3, fingerprintEveryTurn: false, fingerprintFamilies: [] }));
    expect(rounds).toHaveLength(1); expect(rounds[0]!.model).not.toBe('模型家族未知');
    expect(page.actions.filter(a => a === 'send')).toHaveLength(1);
    expect(page.renamed[0]).not.toContain(' · ');
  });
});


describe('DOM draw reader → network fingerprint reader handoff', () => {
  it('uses the network anchor, sends three questions per round, never reuses a candidate in every-turn mode', async () => {
    const h = fingerprintArena('openai', 'net:first-input:first-answer:network-hash:1');
    const { rounds, stop } = await h.execute(true, 2);
    expect(rounds).toHaveLength(2); expect(h.sent).toHaveLength(6); expect(h.samples).toEqual([3, 3]);
    expect(stop).toContain('已完成'); expect(h.notes.join(' ')).not.toContain('上一条回答无法确认');
  });
  it('waits for the network anchor rather than preparing against a DOM signature', async () => {
    const h = fingerprintArena(); const read = h.ports.page.read; let reads = 0;
    h.ports.page.read = async prompt => { const p = await read(prompt); return ++reads <= 3 ? { ...p, response: false, responseSignature: null } : p; };
    const { rounds } = await h.execute(true, 1);
    expect(rounds).toHaveLength(1); expect(h.sent).toHaveLength(3);
    expect(h.notes.some(n => n.includes('网络完成状态'))).toBe(true);
  });
  it('stops without any challenge when the network answer cannot be confirmed', async () => {
    const h = fingerprintArena(); const read = h.ports.page.read;
    h.ports.page.read = async prompt => ({ ...await read(prompt), promptConfirmed: false });
    const { rounds, stop } = await h.execute(true, 2);
    expect(rounds).toHaveLength(0); expect(h.sent).toHaveLength(0); expect(h.renamed).toHaveLength(0);
    expect(stop).toContain('指纹读取通道确认');
  });
  it('does not bypass a user draft at the handoff', async () => {
    const h = fingerprintArena(); const read = h.ports.page.read;
    h.ports.page.read = async prompt => ({ ...await read(prompt), draft: 'user draft' });
    const { stop } = await h.execute(true, 1);
    expect(h.sent).toHaveLength(0); expect(stop).toContain('保留草稿');
  });
});
