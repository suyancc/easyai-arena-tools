import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
const code = readFileSync(new URL('../public/injected/review-auto.js', import.meta.url), 'utf8');
function fixture(options: { loading?: boolean; complete?: boolean } = {}) {
  vi.useFakeTimers();
  const events: Record<string, () => void> = {}, domEvents: Record<string, () => void> = {};
  const state = { complete: options.complete ?? true, failed: false, signature: 'answer-1', lastError: 'NETWORK_OBSERVE' };
  const clicked = new Set(); let mutation!: (records: any[]) => void;
  const observe = vi.fn(), disconnect = vi.fn();
  const choice = { inspect: vi.fn(() => ({ status: 'ready', panelCount: 1 })), click: vi.fn(() => { if (clicked.has(state.signature)) return 'pending'; clicked.add(state.signature); return 'clicked'; }) };
  const window: any = { addEventListener: (name: string, fn: () => void) => { events[name] = fn; }, __arenaChoice: choice, __arenaFingerprintNetwork: { current: () => state }, fetch: vi.fn() };
  const document = { documentElement: {}, readyState: options.loading ? 'loading' : 'complete', visibilityState: 'visible', addEventListener: (name: string, fn: () => void) => { domEvents[name] = fn; } };
  const location = { hostname: 'arena.ai', origin: 'https://arena.ai', pathname: '/work/0f8fad5b-d9cb-469f-a165-70867728950e' };
  class MutationObserver { constructor(fn: typeof mutation) { mutation = fn; } observe = observe; disconnect = disconnect; }
  runInNewContext(code, { window, document, location, MutationObserver, setTimeout, clearTimeout });
  const appearance = () => mutation([{ target: { nodeType: 1, closest: () => null }, addedNodes: [{ nodeType: 1, matches: () => true }] }]);
  return { window, document, location, events, domEvents, state, choice, appearance, observe, disconnect, mutation: (r: any[]) => mutation(r), diagnostics: () => window.__arenaReviewAuto.diagnostics() };
}
afterEach(() => vi.useRealTimers());
describe('idle review auto trigger', () => {
  it('clicks after refresh without any running task or editor, despite a historical network warning', async () => {
    const f = fixture(); expect(f.choice.click).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(f.choice.click).toHaveBeenCalledOnce(); expect(f.diagnostics()).toMatchObject({ status: 'clicked', checks: 1, clicks: 1 });
    expect(f.window.fetch).not.toHaveBeenCalled();
  });
  it('waits for initial DOM readiness', async () => {
    const f = fixture({ loading: true }); await vi.advanceTimersByTimeAsync(1000); expect(f.choice.click).not.toHaveBeenCalled();
    f.domEvents.DOMContentLoaded!(); await vi.advanceTimersByTimeAsync(150); expect(f.choice.click).toHaveBeenCalledOnce();
  });
  it('wakes on network readiness without polling', async () => {
    const f = fixture({ complete: false }); await vi.advanceTimersByTimeAsync(150);
    expect(f.diagnostics().status).toBe('waiting-network'); expect(f.choice.click).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60000); expect(f.diagnostics().checks).toBe(1);
    f.state.complete = true; f.events['arena:fingerprint-state']!(); await vi.advanceTimersByTimeAsync(150);
    expect(f.choice.click).toHaveBeenCalledOnce();
  });
  it('handles late panel insertion and coalesces a mutation burst', async () => {
    const f = fixture(); f.choice.inspect.mockReturnValue({ status: 'none', panelCount: 0 }); await vi.advanceTimersByTimeAsync(150);
    f.choice.inspect.mockReturnValue({ status: 'ready', panelCount: 1 });
    for (let i = 0; i < 100; i++) f.appearance();
    expect(vi.getTimerCount()).toBe(1); await vi.advanceTimersByTimeAsync(150); expect(f.choice.click).toHaveBeenCalledOnce();
    f.state.signature = 'answer-2'; f.appearance(); await vi.advanceTimersByTimeAsync(150); expect(f.diagnostics().clicks).toBe(2);
  });
  it('ignores unrelated streamed text mutations', async () => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(150);
    for (let i = 0; i < 100; i++) f.mutation([{ target: { nodeType: 1, closest: () => null }, addedNodes: [{ nodeType: 3 }] }]);
    await vi.advanceTimersByTimeAsync(1000); expect(f.diagnostics().checks).toBe(1);
  });
  it('does not click in hidden tabs or outside supported conversation routes', async () => {
    const f = fixture(); f.document.visibilityState = 'hidden'; await vi.advanceTimersByTimeAsync(150); expect(f.choice.click).not.toHaveBeenCalled();
    f.document.visibilityState = 'visible'; f.location.pathname = '/work'; f.domEvents.visibilitychange!(); await vi.advanceTimersByTimeAsync(150); expect(f.choice.click).not.toHaveBeenCalled();
  });
  it('honors ambiguous/disabled panels and callback safety checks', async () => {
    const f = fixture(); f.choice.inspect.mockReturnValue({ status: 'blocked', panelCount: 2 }); await vi.advanceTimersByTimeAsync(150); expect(f.choice.click).not.toHaveBeenCalled();
    f.choice.inspect.mockReturnValue({ status: 'ready', panelCount: 1 }); f.choice.click.mockReturnValue('pending'); f.appearance(); await vi.advanceTimersByTimeAsync(150);
    expect(f.diagnostics()).toMatchObject({ status: 'pending', clicks: 0 });
  });
  it('does not schedule repeated retries on exceptions and disconnects on pagehide', async () => {
    const f = fixture(); f.choice.click.mockImplementation(() => { throw new Error('uncertain'); }); await vi.advanceTimersByTimeAsync(150);
    expect(f.diagnostics().status).toBe('error'); expect(vi.getTimerCount()).toBe(0);
    f.appearance(); f.events.pagehide!(); expect(vi.getTimerCount()).toBe(0); expect(f.disconnect).toHaveBeenCalled();
  });
});
