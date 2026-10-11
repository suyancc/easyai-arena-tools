import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const code = readFileSync(new URL('../public/injected/arena-rpc.js', import.meta.url), 'utf8');
function fixture() {
  const page = { main: true, generating: false, blocker: null as string | null, draft: '', response: true, failed: false, responseSignature: 'answer-1' };
  const network = { complete: true, failed: false, signature: 'answer-1' };
  let visible = true, count = 1, inLog = false;
  const buttons = Array.from({ length: 3 }, () => ({ tagName: 'BUTTON', textContent: '계속 작업하기', disabled: false, getAttribute: () => null, getClientRects: () => visible ? [1] : [], click: vi.fn() }));
  const card = { children: buttons, getClientRects: () => visible ? [1] : [], closest: () => inLog ? {} : null };
  const composer = { querySelectorAll: () => [card] };
  const close = { getClientRects: () => visible ? [1] : [], closest: (selector: string) => selector.startsWith('[role=') ? inLog ? {} : null : composer };
  const otherClose = { ...close, closest: (selector: string) => selector.startsWith('[role=') ? null : { querySelectorAll: () => [card] } };
  const window: any = { addEventListener: () => {}, __arenaCompanion: { read: () => page }, __arenaFingerprintNetwork: { current: () => network } };
  runInNewContext(code, { window, document: { querySelectorAll: () => count === 2 ? [close, otherClose] : count ? [close] : [] }, location: { hostname: 'arena.ai', origin: 'https://arena.ai', pathname: '/work/chat' }, getComputedStyle: () => ({ visibility: 'visible' }) });
  return { inspect: window.__arenaChoice.inspect, click: window.__arenaChoice.click, buttons, page, network, hide: () => { visible = false; }, count: (n: number) => { count = n; }, log: () => { inLog = true; } };
}
describe('composer reply choice', () => {
  it('clicks only the third button and never repeats it for the same answer', () => {
    const f = fixture(); expect(f.click()).toBe('clicked');
    expect(f.buttons[0]!.click).not.toHaveBeenCalled(); expect(f.buttons[1]!.click).not.toHaveBeenCalled();
    expect(f.buttons[2]!.click).toHaveBeenCalledOnce(); expect(f.click()).toBe('pending');
    f.network.signature = 'answer-2'; expect(f.click()).toBe('clicked'); expect(f.buttons[2]!.click).toHaveBeenCalledTimes(2);
  });
  it.each(['generating', 'draft', 'blocked', 'networkPending', 'disabled'] as const)('waits on %s', kind => {
    const f = fixture();
    if (kind === 'generating') f.page.generating = true;
    if (kind === 'draft') f.page.draft = 'user draft';
    if (kind === 'blocked') f.page.blocker = 'captcha';
    if (kind === 'networkPending') f.network.complete = false;
    if (kind === 'disabled') f.buttons[2]!.disabled = true;
    expect(f.click()).toBe('pending'); expect(f.buttons[2]!.click).not.toHaveBeenCalled();
  });
  it('rejects changed routes or signatures', () => {
    const f = fixture(); expect(f.click({ expectedRoute: 'https://arena.ai/work/other' })).toBe('blocked');
    expect(f.click({ expectedSignature: 'old-answer' })).toBe('blocked'); expect(f.buttons[2]!.click).not.toHaveBeenCalled();
  });
  it('ignores hidden cards and cards in the conversation log', () => {
    const a = fixture(); a.hide(); expect(a.click()).toBe('none');
    const b = fixture(); b.log(); expect(b.click()).toBe('none');
  });
  it('rejects ambiguous cards or a changed number of options', () => {
    const a = fixture(); a.count(2); expect(a.click()).toBe('blocked');
    const b = fixture(); b.buttons.pop(); expect(b.click()).toBe('blocked');
  });
  it('does not retry a click with an uncertain result', () => {
    const f = fixture(); f.buttons[2]!.click.mockImplementation(() => { throw new Error('uncertain'); });
    expect(() => f.click()).toThrow('uncertain'); expect(f.click()).toBe('pending'); expect(f.buttons[2]!.click).toHaveBeenCalledOnce();
  });
  it('rejects unrelated third-button meanings instead of relying only on position', () => {
    const f = fixture(); f.buttons[2]!.textContent = 'Delete conversation';
    expect(f.click()).toBe('blocked'); expect(f.buttons[2]!.click).not.toHaveBeenCalled();
  });
  it('exposes a text-free review diagnostic without requiring any editor', () => {
    const f = fixture(); expect(f.inspect()).toEqual({ status: 'ready', panelCount: 1 });
    expect(f.click()).toBe('clicked');
  });

  it('performs no clicks when scripts are merely loaded on refresh', () => {
    const f = fixture(); for (const b of f.buttons) expect(b.click).not.toHaveBeenCalled();
  });

});
