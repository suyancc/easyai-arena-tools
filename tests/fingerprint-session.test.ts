import { FingerprintFault } from '../utils/fingerprint/errors';
import { describe, expect, it, vi } from 'vitest';
import { FingerprintSession, type FingerprintPageApi } from '../utils/fingerprint/session';
import { eligible, stable } from '../utils/fingerprint/identity';
import type { FingerprintService, Outcome } from '../utils/fingerprint/types';
import type { PageView, TurnProbe } from '../utils/types';
const CHAT = 'https://arena.ai/work/0f8fad5b-d9cb-469f-a165-70867728950e';
const identity = { turnId: 'turn', target: 'openai' as const, everyTurn: false, provider: null, arena: null };
const candidate: Outcome = { kind: 'candidate', candidate: { family: 'openai', modelId: 'gpt-test', displayName: 'GPT Test' } };
function harness(overrides: Partial<FingerprintService> = {}) {
  let clock = 0, active = true;
  let p: PageView = { url: CHAT, allowed: true, main: true, conversation: true, promptConfirmed: true, response: true, generating: false, activity: false, failed: false, responseSignature: 'sig0', completionConfirmed: true, draft: '', editor: true, sendReady: true, newLinks: 1, canExpand: false, termsPending: false };
  let snap: TurnProbe = { api: true, turnId: 'turn', mode: 'INFERRED', family: 'openai', captureBound: true, routeMatched: true, familyConflict: false, evidenceCount: 1 };
  const actions: string[] = [], prompts: string[] = [], messages: string[] = [];
  const service: FingerprintService = { prepare: vi.fn(async () => {}), score: vi.fn(async () => candidate), ...overrides };
  const page: FingerprintPageApi = {
    read: vi.fn(async () => p), snapshot: vi.fn(async () => snap),
    readAnswer: vi.fn(async () => ({ text: '1 '.repeat(292), oversize: false })),
    action: vi.fn(async (action, opts) => {
      actions.push(action);
      if (action === 'fill') p = { ...p, draft: opts.prompt };
      else { prompts.push(opts.prompt); p = { ...p, draft: '', responseSignature: `sig${prompts.length}` }; }
    }),
  };
  const session = new FingerprintSession(page, service, { now: () => clock, active: () => active, say: s => messages.push(s) }, identity, CHAT, 'initial', 'sig0', 60_000,
    [292, 293, 294].map(n => ({ expectedCount: n, prompt: `challenge ${n}` })));
  const tick = async () => { clock += 900; return session.tick(p); };
  const finish = async () => { for (let i = 0; i < 40; i++) { const r = await tick(); if (r.kind !== 'pending') return r; } throw new Error('not complete'); };
  return { session, page, service, actions, prompts, messages, tick, finish,
    pageSet: (patch: Partial<PageView>) => { p = { ...p, ...patch }; },
    snapshotSet: (patch: Partial<TurnProbe>) => { snap = { ...snap, ...patch }; },
    cancel: () => { active = false; session.cancel(); }, jump: (ms: number) => { clock += ms; } };
}
describe('fingerprint gate', () => {
  const s: TurnProbe = { api: true, turnId: 'turn', mode: 'INFERRED', family: 'openai', captureBound: true, routeMatched: true, familyConflict: false };
  it('requires current-turn bound identity and a selected family', () => {
    expect(eligible(s, 'turn', ['openai'], false)).toBe(true);
    for (const patch of [{ turnId: 'old' }, { captureBound: false }, { routeMatched: false }, { familyConflict: true }, { mode: 'RESOLVED' }]) expect(eligible({ ...s, ...patch }, 'turn', ['openai'], false)).toBe(false);
    expect(eligible(s, 'turn', [], false)).toBe(false);
    expect(eligible({ ...s, family: null as unknown as string, mode: 'UNKNOWN', evidenceCount: 0 }, 'turn', [], true)).toBe(false);
    expect(eligible({ ...s, family: undefined, mode: 'UNKNOWN', evidenceCount: 1 }, 'turn', [], true)).toBe(true);
  });
  it('rejects visible identity changes while allowing different run IDs', () => {
    expect(stable({ ...s, runId: 'new-request' }, identity)).toBe(true);
    expect(stable({ ...s, providerName: 'changed' }, identity)).toBe(false);
    expect(stable({ ...s, family: 'google' }, identity)).toBe(false);
  });
});
describe('three-challenge session', () => {
  it('sends exactly three, scores once, clears samples and preserves inferred label', async () => {
    const h = harness(); const result = await h.finish();
    expect(h.actions).toEqual(['fill', 'send', 'fill', 'send', 'fill', 'send']);
    expect(h.prompts).toEqual(['challenge 292', 'challenge 293', 'challenge 294']);
    expect(h.service.score).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ kind: 'done', model: 'GPT Test（指纹推测）' });
    await h.tick(); expect(h.actions).toHaveLength(6);
    expect(JSON.stringify(h.messages)).not.toContain('1 1 1 1');
  });
  it('validates assets before any action and does not retry failed prepare', async () => {
    const h = harness({ prepare: async () => { throw new Error('invalid data'); } });
    expect((await h.finish()).kind).toBe('stop'); expect(h.actions).toEqual([]);
    await h.tick(); expect(h.actions).toEqual([]);
  });
  it('an official result arriving during failed preparation still takes precedence', async () => {
    const h = harness();
    h.service.prepare = async () => { h.snapshotSet({ mode: 'RESOLVED', arenaName: 'official-during-error' }); throw new Error('background gone'); };
    expect(await h.tick()).toMatchObject({ kind: 'done', model: 'official-during-error' });
    expect(h.actions).toHaveLength(0);
  });
  it('an uncertain operation after a route change stops instead of advancing the draw', async () => {
    const h = harness(); await h.tick();
    h.page.action = async () => { h.pageSet({ url: 'https://arena.ai/work' }); throw new Error('lost reply'); };
    expect((await h.tick()).kind).toBe('stop');
  });
  it('does not repeat uncertain sends, even with simultaneous ticks', async () => {
    const h = harness(); await h.tick(); await h.tick();
    h.page.action = vi.fn(async () => { throw new Error('reply lost after click'); });
    const results = await Promise.all([h.tick(), h.tick()]);
    expect(h.page.action).toHaveBeenCalledTimes(1);
    expect(results.some(x => x.kind === 'done')).toBe(true);
    await h.tick(); expect(h.page.action).toHaveBeenCalledTimes(1);
  });
  it('honors official results immediately and discards remaining samples', async () => {
    const h = harness(); await h.tick(); await h.tick(); await h.tick();
    h.snapshotSet({ mode: 'RESOLVED', arenaName: 'official-model' });
    expect(await h.tick()).toMatchObject({ kind: 'done', model: 'official-model' });
    expect(h.prompts).toHaveLength(1); expect(h.service.score).not.toHaveBeenCalled();
  });
  it('stops on route changes, identity changes and foreign drafts', async () => {
    const a = harness(); a.pageSet({ url: 'https://arena.ai/work' }); expect((await a.tick()).kind).toBe('stop');
    const b = harness(); b.snapshotSet({ family: 'google' }); expect((await b.tick()).kind).toBe('done'); expect(b.actions).toHaveLength(0);
    const c = harness(); await c.tick(); c.pageSet({ draft: 'user draft' }); expect((await c.tick()).kind).toBe('done'); expect(c.actions).toHaveLength(0);
  });
  it('continues all three invalid samples without retry', async () => {
    const h = harness({ score: async a => ({ kind: 'insufficient', validAnswers: a.filter(x => x.text).length }) });
    h.page.readAnswer = async () => ({ text: null, oversize: true });
    expect(await h.finish()).toMatchObject({ kind: 'done', note: expect.stringContaining('0/3') });
    expect(h.prompts).toHaveLength(3);
  });
  it('times out stalled answers but excludes human verification wait', async () => {
    const h = harness(); await h.tick(); await h.tick(); await h.tick();
    h.pageSet({ generating: true, response: false }); await h.tick();
    h.jump(120_000); h.session.shiftTime(120_000);
    expect((await h.tick()).kind).toBe('pending');
    h.jump(61_000); expect((await h.tick()).kind).toBe('done');
  });
  it.each(['cancel', 'route', 'official', 'family'] as const)('rechecks %s after asynchronous scoring', async mode => {
    let resolve!: (o: Outcome) => void, started!: () => void;
    const scoringStarted = new Promise<void>(r => { started = r; });
    const h = harness({ score: () => { started(); return new Promise(r => { resolve = r; }); } });
    const running = h.finish();
    await scoringStarted;
    if (mode === 'cancel') h.cancel();
    if (mode === 'route') h.pageSet({ url: 'https://arena.ai/work' });
    if (mode === 'official') h.snapshotSet({ mode: 'RESOLVED', arenaName: 'official-late' });
    if (mode === 'family') h.snapshotSet({ family: 'google' });
    resolve(candidate);
    if (mode === 'cancel') await expect(running).rejects.toThrow('not complete');
    else {
      const result = await running;
      if (mode === 'route') expect(result.kind).toBe('stop');
      if (mode === 'official') expect(result).toMatchObject({ model: 'official-late' });
      if (mode === 'family') expect(result).toMatchObject({ model: 'Gemini 家族（推测）' });
    }
  });
});


describe('preparation failures retain safe diagnostic codes', () => {
  it.each(['FP_BUSY', 'FP_CHANNEL', 'FP_REQUEST', 'FP_DATA_READ', 'FP_TIMEOUT'] as const)('does not mislabel %s as missing data or send any challenge', async code => {
    const h = harness({ prepare: async () => { throw new FingerprintFault(code); } });
    const result = await h.finish();
    expect(result).toMatchObject({ kind: 'stop', reason: expect.stringContaining(`[${code}]`) });
    expect(h.actions).toEqual([]);
  });
  it('never exposes arbitrary exception text or user payloads', async () => {
    const h = harness({ prepare: async () => { throw new Error('PRIVATE_TOKEN_AND_ANSWER'); } });
    const result = await h.finish();
    expect(JSON.stringify(result)).not.toContain('PRIVATE_TOKEN');
    expect(result).toMatchObject({ kind: 'stop', reason: expect.stringContaining('[FP_UNKNOWN]') });
  });
});
