import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const code = readFileSync(new URL('../public/injected/fingerprint-observer.js', import.meta.url), 'utf8');
function fixture() {
  let latest = 'initial', draft = 'next question', serial = 0;
  let page = { url: 'https://arena.ai/work/chat', responseSignature: 'old-answer' };
  let snapshot = { captureBound: true, routeMatched: true, mode: 'INFERRED', family: 'openai', familyConflict: false, evidenceCount: 2 };
  const listeners: Record<string, (e: any) => void> = {};
  const bus: { activeTurnId: string | null } = { activeTurnId: null };
  const probe = {
    bus,
    beginTurnInfo: vi.fn((id: string) => { if (bus.activeTurnId) return { ok: false }; bus.activeTurnId = id; return { ok: true }; }),
    endTurn: vi.fn((id: string) => { if (bus.activeTurnId === id) bus.activeTurnId = null; }),
    snapshotTurn: vi.fn(id => ({ api: true, turnId: id, ...snapshot })),
  };
  const window: any = { __MODEL_PROBE__: probe, __arenaFingerprintBridge: { latestPrompt: () => latest, read: () => page } };
  const document = { addEventListener: (name: string, f: any) => { listeners[name] = f; }, querySelectorAll: () => [{ getClientRects: () => [1], get innerText() { return draft; } }] };
  runInNewContext(code, { window, document, location: { hostname: 'arena.ai' }, crypto: { randomUUID: () => String(++serial) } });
  const click = () => listeners.click!({ target: { closest: () => ({ disabled: false, getAttribute: () => 'Send message' }) } });
  return { setSnapshot: (s: Partial<typeof snapshot>) => { snapshot = { ...snapshot, ...s }; }, setPage: (p: Partial<typeof page>) => { page = { ...page, ...p }; }, observer: window.__arenaFingerprintObserver, probe, bus, click, latest: (x: string) => { latest = x; }, draft: (x: string) => { draft = x; } };
}
describe('passive capture ownership', () => {
  it('captures before Send without sending a request and only accepts the matching latest prompt', () => {
    const f = fixture();
    f.click(); expect(f.probe.beginTurnInfo).toHaveBeenCalledOnce();
    expect(f.observer.context(false).bootstrap).toBe(true);
    f.latest('next question'); expect(f.observer.context(false).turnId).toBe('manual-1');
  });
  it('does not steal automatic captures and accepts explicit completion handoff', () => {
    const f = fixture(); f.bus.activeTurnId = 'automatic'; f.click();
    expect(f.probe.beginTurnInfo).not.toHaveBeenCalled();
    expect(f.observer.retain('automatic')).toBe(true);
    expect(f.observer.context(false).turnId).toBe('automatic');
    f.observer.release(); expect(f.bus.activeTurnId).toBeNull();
  });
  it('locks the same capture for all three programmatic submissions', () => {
    const f = fixture(); f.click(); f.latest('next question'); f.observer.context(true);
    for (let i = 0; i < 3; i++) f.click();
    expect(f.probe.beginTurnInfo).toHaveBeenCalledOnce();
    expect(() => f.observer.context(true)).toThrow('正在进行');
    f.observer.release(); expect(f.bus.activeTurnId).toBeNull();
  });
  it('returns the latest bound capture after completion so inspection can be repeated', () => {
    const f = fixture(); f.click(); f.latest('next question'); f.observer.context(true);
    f.latest('challenge 3'); f.observer.unclaim();
    expect(f.observer.context(false).prompt).toBe('challenge 3');
    expect(f.bus.activeTurnId).toBe('manual-1');
    f.observer.release(); expect(f.bus.activeTurnId).toBeNull();
  });
  it('new manual submission invalidates the old captured turn', () => {
    const f = fixture(); f.click(); f.latest('next question');
    f.draft('third question'); f.click();
    expect(f.bus.activeTurnId).toBe('manual-2'); expect(f.probe.endTurn).toHaveBeenCalledWith('manual-1');
    expect(f.observer.context(false).bootstrap).toBe(true);
  });
});
describe('existing-conversation capture bootstrap', () => {
  it('preflights historical DOM without opening a capture and starts only on claim', () => {
    const f = fixture(); f.setSnapshot({ mode: 'UNKNOWN', evidenceCount: 0 });
    const first = f.observer.context(false);
    expect(first).toMatchObject({ bootstrap: true, snapshot: null, prompt: 'initial' });
    expect(f.observer.context(false).turnId).toBe(first.turnId);
    expect(f.probe.beginTurnInfo).not.toHaveBeenCalled();
    const claimed = f.observer.context(true);
    expect(claimed.turnId).toBe(first.turnId);
    expect(claimed.bootstrap).toBe(true);
    expect(claimed.snapshot.evidenceCount).toBe(0);
    expect(f.probe.beginTurnInfo).toHaveBeenCalledOnce();
    f.click(); expect(f.probe.beginTurnInfo).toHaveBeenCalledOnce();
    expect(() => f.observer.context(true)).toThrow('正在进行');
  });
  it.each(['prompt', 'signature', 'route'])('invalidates confirmation when %s changes', kind => {
    const f = fixture(); const first = f.observer.context(false);
    if (kind === 'prompt') f.latest('different user question');
    if (kind === 'signature') f.setPage({ responseSignature: 'new-answer' });
    if (kind === 'route') f.setPage({ url: 'https://arena.ai/work/other' });
    expect(f.observer.context(false).turnId).not.toBe(first.turnId);
    expect(f.probe.beginTurnInfo).not.toHaveBeenCalled();
  });
  it('does not steal an automatic task, even for historical pages', () => {
    const f = fixture(); f.bus.activeTurnId = 'automatic';
    expect(() => f.observer.context(false)).toThrow('停止当前任务');
    expect(f.probe.beginTurnInfo).not.toHaveBeenCalled();
  });
  it('reports missing DOM prompt separately and never starts a capture', () => {
    const f = fixture(); f.latest('');
    expect(() => f.observer.context(false)).toThrow('用户消息');
    expect(f.probe.beginTurnInfo).not.toHaveBeenCalled();
  });
});
