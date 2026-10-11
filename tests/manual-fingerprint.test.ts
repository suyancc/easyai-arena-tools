import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { inspectManual, runManualFingerprint, type ManualContext, type ManualPorts } from '../utils/fingerprint/manual';
import type { PageView, TurnProbe } from '../utils/types';
import { modelPresentation, quotaPresentation, compactStatus } from '../entrypoints/sidepanel/presentation';
const CHAT = 'https://arena.ai/work/0f8fad5b-d9cb-469f-a165-70867728950e';
function fixture() {
  let clock = 0, active = true, sent = 0;
  let page: PageView = { url: CHAT, allowed: true, main: true, conversation: true, promptConfirmed: true, response: true, generating: false, activity: false, failed: false, responseSignature: 'initial', completionConfirmed: true, draft: '', editor: true, sendReady: true, newLinks: 1, canExpand: false, termsPending: false };
  let snapshot: TurnProbe = { api: true, turnId: 'turn', captureBound: true, routeMatched: true, mode: 'INFERRED', family: 'openai', familyConflict: false, evidenceCount: 2 };
  const context = (): ManualContext => ({ turnId: 'turn', prompt: 'last user question', page, snapshot });
  const ports: ManualPorts = {
    context: vi.fn(async () => context()), release: vi.fn(async () => {}), sleep: vi.fn(async n => { clock += n; if (clock > 200_000) throw new Error('loop did not finish'); }),
    page: {
      read: vi.fn(async () => page), snapshot: vi.fn(async () => snapshot),
      action: vi.fn(async (action, args) => { if (action === 'fill') page = { ...page, draft: args.prompt }; else page = { ...page, draft: '', responseSignature: `answer-${++sent}` }; }),
      readAnswer: vi.fn(async () => ({ text: '1 '.repeat(292), oversize: false })),
    },
    service: { prepare: vi.fn(async () => {}), score: vi.fn(async () => ({ kind: 'candidate' as const, candidate: { family: 'openai' as const, modelId: 'example', displayName: 'Example' } })) },
  };
  const host = { active: () => active, now: () => clock, say: vi.fn() };
  return { ports, host, context, setSnapshot: (s: Partial<TurnProbe>) => { snapshot = { ...snapshot, ...s }; }, setPage: (p: Partial<PageView>) => { page = { ...page, ...p }; }, stop: () => { active = false; }, sends: () => sent };
}
describe('manual fingerprint', () => {
  it('rejects missing current evidence, busy pages and drafts before any send', () => {
    const f = fixture(); f.setSnapshot({ evidenceCount: 0, mode: 'UNKNOWN' });
    expect(() => inspectManual(f.context())).toThrow('证据不足');
    f.setSnapshot({ mode: 'INFERRED' }); f.setPage({ generating: true }); expect(() => inspectManual(f.context())).toThrow('等待');
    f.setPage({ generating: false, draft: 'user work' }); expect(() => inspectManual(f.context())).toThrow('草稿');
    expect(f.ports.page.action).not.toHaveBeenCalled();
  });
  it('shows a bound official identity without even preparing the scorer', async () => {
    const f = fixture(); f.setSnapshot({ mode: 'RESOLVED', arenaName: 'official-example' });
    expect(await runManualFingerprint(f.ports, f.host, 'turn', 60000)).toMatchObject({ kind: 'done', model: 'official-example' });
    expect(f.ports.service.prepare).not.toHaveBeenCalled(); expect(f.sends()).toBe(0);
    expect(f.ports.release).toHaveBeenCalledOnce();
  });
  it('adds exactly three follow-ups and no initial prompt or new conversation', async () => {
    const f = fixture();
    expect(await runManualFingerprint(f.ports, f.host, 'turn', 60000)).toMatchObject({ kind: 'done', model: 'Example（指纹推测）' });
    expect(f.sends()).toBe(3); expect(f.ports.page.action).toHaveBeenCalledTimes(6);
    expect(f.ports.service.score).toHaveBeenCalledOnce(); expect(f.ports.release).toHaveBeenCalledOnce();
  });
  it('rejects changed turns after the confirmation dialog', async () => {
    const f = fixture();
    await expect(runManualFingerprint(f.ports, f.host, 'previous-turn', 60000)).rejects.toThrow('回合已变化');
    expect(f.sends()).toBe(0); expect(f.ports.release).toHaveBeenCalledOnce();
  });
  it('cleans ownership on claim timeout, stop and page-read failure', async () => {
    const a = fixture(); a.ports.context = async () => { throw new Error('RPC timeout'); };
    await expect(runManualFingerprint(a.ports, a.host, 'turn', 60000)).rejects.toThrow('timeout'); expect(a.ports.release).toHaveBeenCalledOnce();
    const b = fixture(); b.ports.sleep = async () => { b.stop(); };
    expect((await runManualFingerprint(b.ports, b.host, 'turn', 60000)).kind).toBe('pending'); expect(b.ports.release).toHaveBeenCalledOnce(); expect(b.sends()).toBe(0);
    const c = fixture(); c.ports.page.read = async () => { throw new Error('page disappeared'); };
    await expect(runManualFingerprint(c.ports, c.host, 'turn', 60000)).rejects.toThrow(); expect(c.ports.release).toHaveBeenCalledOnce();
  });
  it('stops on navigation and never advances to another conversation', async () => {
    const f = fixture(); f.ports.sleep = async () => { f.setPage({ url: 'https://arena.ai/work' }); };
    expect((await runManualFingerprint(f.ports, f.host, 'turn', 60000)).kind).toBe('stop'); expect(f.sends()).toBe(0);
  });
});
describe('compact presentation', () => {
  it('never presents unknown quota as zero and flags stale values', () => {
    expect(quotaPresentation(null)).toMatchObject({ value: null, label: '—' });
    expect(quotaPresentation({ pulse: 0, error: null } as any).label).toBe('0%');
    expect(quotaPresentation({ pulse: 78, error: 'failed' } as any)).toMatchObject({ label: '78%', stale: true });
  });
  it('retains uncertainty in a separate badge and does not label unknown official', () => {
    expect(modelPresentation('X（指纹推测）')).toMatchObject({ name: 'X', kind: '推测' });
    expect(modelPresentation('未识别（官方型号暂不可见）').kind).toBe('');
    expect(modelPresentation('模型家族未知').kind).toBe('');
    expect(modelPresentation('official-model').kind).toBe('官方');
  });
  it('condenses progress without erasing errors', () => {
    expect(compactStatus('第 3/20 轮：指纹挑战 2/3：已发送，等待回答…')).toBe('探测 2/3 · 等待回答');
    expect(compactStatus('会话已切换，探测停止')).toContain('会话已切换');
  });
});
function bootstrapFixture() {
  const f = fixture();
  f.setSnapshot({ mode: 'UNKNOWN', family: null, evidenceCount: 0 });
  f.ports.context = vi.fn(async () => ({ ...f.context(), bootstrap: true }));
  const originalAction = f.ports.page.action;
  f.ports.page.action = vi.fn(async (action, args) => {
    await originalAction(action, args);
    if (action === 'send') f.setSnapshot({ mode: 'INFERRED', family: 'openai', evidenceCount: f.sends() });
  });
  return f;
}
describe('historical conversation starts with challenge 1', () => {
  it('allows a ready historical answer only with an explicit bootstrap flag', () => {
    const f = fixture();
    expect(inspectManual({ ...f.context(), snapshot: null, bootstrap: true }).official).toBeNull();
    expect(() => inspectManual({ ...f.context(), snapshot: null })).toThrow('证据不足');
  });
  it('captures the three challenges without an extra initial question', async () => {
    const f = bootstrapFixture();
    expect(await runManualFingerprint(f.ports, f.host, 'turn', 60000)).toMatchObject({ kind: 'done', model: 'Example（指纹推测）' });
    expect(f.sends()).toBe(3);
    expect(f.ports.page.action).toHaveBeenCalledTimes(6);
    expect(f.ports.service.score).toHaveBeenCalledWith(expect.any(Array), 'openai');
    expect(f.ports.release).toHaveBeenCalledOnce();
  });
  it('stops after question 1 if no new network evidence was captured', async () => {
    const f = bootstrapFixture(); const original = f.ports.page.action;
    f.ports.page.action = async (action, args) => { await original(action, args); f.setSnapshot({ mode: 'UNKNOWN', family: null, evidenceCount: 0 }); };
    expect(await runManualFingerprint(f.ports, f.host, 'turn', 60000)).toMatchObject({ kind: 'stop', reason: expect.stringContaining('第一题已完成') });
    expect(f.sends()).toBe(1); expect(f.ports.service.score).not.toHaveBeenCalled();
  });
  it('accepts official identity only from the newly captured first answer', async () => {
    const f = bootstrapFixture(); const original = f.ports.page.action;
    f.ports.page.action = async (action, args) => { await original(action, args); if (action === 'send') f.setSnapshot({ mode: 'RESOLVED', arenaName: 'official-new' }); };
    expect(await runManualFingerprint(f.ports, f.host, 'turn', 60000)).toMatchObject({ kind: 'done', model: 'official-new' });
    expect(f.sends()).toBe(1); expect(f.ports.service.score).not.toHaveBeenCalled();
  });
  it.each(['draft', 'generating', 'route', 'binding', 'contaminated'])('rejects unsafe %s before sending', async kind => {
    const f = bootstrapFixture();
    if (kind === 'draft') f.setPage({ draft: 'my draft' });
    if (kind === 'generating') f.setPage({ generating: true });
    if (kind === 'route') f.setPage({ url: 'https://arena.ai/work' });
    if (kind === 'binding') f.setSnapshot({ routeMatched: false });
    if (kind === 'contaminated') f.setSnapshot({ mode: 'RESOLVED', evidenceCount: 2, arenaName: 'old' });
    await expect(runManualFingerprint(f.ports, f.host, 'turn', 60000)).rejects.toThrow();
    expect(f.sends()).toBe(0); expect(f.ports.release).toHaveBeenCalledOnce();
  });
  it('does not send after the confirmation token changes or cancellation', async () => {
    const a = bootstrapFixture();
    await expect(runManualFingerprint(a.ports, a.host, 'old-token', 60000)).rejects.toThrow('回合已变化');
    expect(a.sends()).toBe(0);
    const b = bootstrapFixture(); b.ports.sleep = async () => { b.stop(); };
    expect((await runManualFingerprint(b.ports, b.host, 'turn', 60000)).kind).toBe('pending');
    expect(b.sends()).toBe(0); expect(b.ports.release).toHaveBeenCalledOnce();
  });
  it('retains identity stability checks after the first answer', async () => {
    const f = bootstrapFixture(); const original = f.ports.page.action;
    f.ports.page.action = async (action, args) => { await original(action, args); if (f.sends() === 2) f.setSnapshot({ familyConflict: true }); };
    expect(await runManualFingerprint(f.ports, f.host, 'turn', 60000)).toMatchObject({ kind: 'done', note: expect.stringContaining('已中止') });
    expect(f.sends()).toBe(2); expect(f.ports.service.score).not.toHaveBeenCalled();
  });
});

describe('bootstrap with real observer and session', () => {
  it('preflights a loaded historical page and completes three challenges across the capture boundary', async () => {
    const f = bootstrapFixture(); let latest = 'last user question';
    const bus: { activeTurnId: string | null } = { activeTurnId: null };
    const probe = {
      bus,
      beginTurnInfo: vi.fn((id: string) => { bus.activeTurnId = id; return { ok: true }; }),
      endTurn: vi.fn(() => { bus.activeTurnId = null; }),
      snapshotTurn: (id: string) => ({ ...f.context().snapshot!, turnId: id }),
    };
    const window: any = { __MODEL_PROBE__: probe, __arenaFingerprintBridge: { latestPrompt: () => latest, read: () => f.context().page } };
    runInNewContext(readFileSync(new URL('../public/injected/fingerprint-observer.js', import.meta.url), 'utf8'), {
      window, document: { addEventListener: () => {} }, location: { hostname: 'arena.ai' }, crypto: { randomUUID: () => 'integration' },
    });
    f.ports.context = async claim => window.__arenaFingerprintObserver.context(claim);
    f.ports.release = async () => window.__arenaFingerprintObserver.unclaim();
    f.ports.page.snapshot = async id => probe.snapshotTurn(id);
    const action = f.ports.page.action;
    f.ports.page.action = async (name, args) => { await action(name, args); if (name === 'send') latest = args.prompt; };
    const check = inspectManual(await f.ports.context(false));
    expect(check.turnId).toBe('manual-integration');
    expect(probe.beginTurnInfo).not.toHaveBeenCalled();
    expect(await runManualFingerprint(f.ports, f.host, check.turnId, 60000)).toMatchObject({ kind: 'done', model: 'Example（指纹推测）' });
    expect(f.sends()).toBe(3);
    expect(probe.beginTurnInfo).toHaveBeenCalledOnce();
    expect((await f.ports.context(false)).bootstrap).toBe(false);
  });
  it('accepts turn-scoped SSE family evidence even when metadata evidenceCount is zero', async () => {
    const f = bootstrapFixture(); const action = f.ports.page.action;
    f.ports.page.action = async (name, args) => { await action(name, args); if (name === 'send') f.setSnapshot({ evidenceCount: 0, familySource: 'sse-fingerprint' }); };
    expect(await runManualFingerprint(f.ports, f.host, 'turn', 60000)).toMatchObject({ kind: 'done', model: 'Example（指纹推测）' });
    expect(f.sends()).toBe(3);
  });
  it('finishes all three challenges even for a non-GPT-Claude-Gemini family', async () => {
    const f = bootstrapFixture(); const action = f.ports.page.action;
    f.ports.page.action = async (name, args) => { await action(name, args); if (name === 'send') f.setSnapshot({ family: 'qwen' }); };
    expect(await runManualFingerprint(f.ports, f.host, 'turn', 60000)).toMatchObject({ kind: 'done', model: 'Example（指纹推测）' });
    expect(f.sends()).toBe(3); expect(f.ports.service.score).toHaveBeenCalledOnce();
  });
});

describe('reply choice in manual fingerprint lifecycle', () => {
  it('handles the existing reply card and all three challenge reply cards', async () => {
    const f = fixture(); const clicked = new Set<string>();
    f.ports.page.choice = vi.fn(async (_prompt, _route, signature) => {
      if (clicked.has(signature)) return 'none';
      clicked.add(signature); return 'clicked';
    });
    expect(await runManualFingerprint(f.ports, f.host, 'turn', 60000)).toMatchObject({ kind: 'done', model: 'Example（指纹推测）' });
    expect([...clicked]).toEqual(['initial', 'answer-1', 'answer-2', 'answer-3']);
    expect(f.sends()).toBe(3);
  });
  it('waits for a clicked card to close instead of sending or clicking repeatedly', async () => {
    const f = fixture(); let calls = 0;
    f.ports.page.choice = async () => ++calls === 1 ? 'clicked' : 'pending';
    expect(await runManualFingerprint(f.ports, f.host, 'turn', 60000)).toMatchObject({ kind: 'stop', reason: expect.stringContaining('卡片未关闭') });
    expect(f.sends()).toBe(0);
  });
  it('stops on ambiguous review cards', async () => {
    const f = fixture(); f.ports.page.choice = async () => 'blocked';
    expect(await runManualFingerprint(f.ports, f.host, 'turn', 60000)).toMatchObject({ kind: 'stop', reason: expect.stringContaining('避免误点') });
    expect(f.sends()).toBe(0);
  });
});
describe('review panel temporarily replaces the editor', () => {
  it('allows preflight when the verified Continue working review is present', () => {
    const f = fixture(); f.setPage({ editor: false, reviewChoiceReady: true });
    expect(inspectManual(f.context()).official).toBeNull();
  });
  it('still rejects missing editors without a verified review', () => {
    const f = fixture(); f.setPage({ editor: false, reviewChoiceReady: false });
    expect(() => inspectManual(f.context())).toThrow('输入框');
  });
  it('opens the editor through the review before any challenge is filled', async () => {
    const f = fixture(); f.setPage({ editor: false, reviewChoiceReady: true }); let clicked = false;
    f.ports.page.choice = async () => { if (clicked) return 'none'; clicked = true; f.setPage({ editor: true, reviewChoiceReady: false }); return 'clicked'; };
    expect(await runManualFingerprint(f.ports, f.host, 'turn', 60000)).toMatchObject({ kind: 'done', model: 'Example（指纹推测）' });
    expect(clicked).toBe(true); expect(f.sends()).toBe(3);
  });
});
