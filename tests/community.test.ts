import { afterEach, expect, it, vi } from 'vitest';
import { bindCommunityCopy } from '../entrypoints/sidepanel/community';
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
function fixture(write: (text: string) => Promise<void>) {
  const button = {} as HTMLButtonElement, status = { textContent: '复制' } as HTMLElement;
  bindCommunityCopy(button, status, write);
  return { button, status, click: () => button.onclick!.call(button, {} as PointerEvent) };
}
it('copies the exact group number only on user action and restores the label', async () => {
  vi.useFakeTimers(); const write = vi.fn().mockResolvedValue(undefined), f = fixture(write);
  expect(write).not.toHaveBeenCalled(); await f.click();
  expect(write).toHaveBeenCalledWith('1053996918'); expect(f.status.textContent).toBe('已复制');
  await vi.advanceTimersByTimeAsync(2000); expect(f.status.textContent).toBe('复制');
});
it('does not claim success when clipboard access is denied', async () => {
  vi.useFakeTimers(); const f = fixture(vi.fn().mockRejectedValue(new Error('denied')));
  await f.click(); expect(f.status.textContent).toBe('请手动复制');
});
