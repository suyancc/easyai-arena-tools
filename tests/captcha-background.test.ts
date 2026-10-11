import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ listeners: [] as any[], storageListeners: [] as any[], data: {} as Record<string, any>, solve: vi.fn(), send: vi.fn(), closed: [] as any[], updated: [] as any[] }));
vi.mock('wxt/browser', () => ({ browser: {
  runtime: { id: 'fixture', getURL: (p: string) => `chrome-extension://fixture${p}`, onMessage: { addListener: (fn: any) => mock.listeners.push(fn) } },
  storage: { local: { get: async () => ({ ...mock.data }), set: async (v: any) => { Object.assign(mock.data, v); } }, onChanged: { addListener: (fn: any) => mock.storageListeners.push(fn) } },
  permissions: { contains: async () => true },
  tabs: { get: async () => ({ url: 'https://arena.ai/work/fixture?private=query' }), sendMessage: (...args: any[]) => mock.send(...args), onRemoved: { addListener: (fn: any) => mock.closed.push(fn) }, onUpdated: { addListener: (fn: any) => mock.updated.push(fn) } },
} }));
vi.mock('../utils/captcha/api', async importOriginal => {
  const actual = await importOriginal<any>();
  return { ...actual, TwoCaptcha: class { solve(...args: any[]) { return mock.solve(...args); } dispose() {} } };
});
import { installCaptcha } from '../utils/captcha/background';
const sender = { id: 'fixture', tab: { id: 7 }, frameId: 0, url: 'https://arena.ai/work/fixture' };
const req = { type: 'captcha:detected', document: 'document-fixture', challenge: { id: 'widget-1', key: 'fixture-site-key', enterprise: false, invisible: false, domain: 'google.com' } };
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
function send(value = req, from = sender) { mock.listeners[0](value, from, () => {}); }
beforeEach(() => {
  mock.listeners.length = mock.storageListeners.length = mock.closed.length = mock.updated.length = 0;
  mock.data = { captchaEnabled: true, captchaApiKey: 'a'.repeat(32) }; mock.solve.mockReset().mockResolvedValue('fixture-solution');
  mock.send.mockReset().mockImplementation(async (_id, r) => r.type === 'captcha:current' ? { current: true } : r.type === 'captcha:apply' ? { applied: true } : {});
  installCaptcha();
});
it('is opt-in and never creates a task when disabled', async () => { mock.data.captchaEnabled = false; send(); await flush(); expect(mock.solve).not.toHaveBeenCalled(); });
it('requires an Arena top-frame sender rather than arbitrary websites or frames', async () => {
  send(req, { ...sender, url: 'https://evil.test/' }); send(req, { ...sender, frameId: 2 }); await flush(); expect(mock.solve).not.toHaveBeenCalled();
});
it('deduplicates repeated detections and strips querystrings before service use', async () => {
  send(); send(); await flush(); send(); await flush(); expect(mock.solve).toHaveBeenCalledTimes(1);
  expect(mock.solve.mock.calls[0]![1]).toBe('https://arena.ai/work/fixture');
  expect(JSON.stringify(mock.send.mock.calls)).not.toContain('a'.repeat(32)); expect(mock.data.captchaSpendGuard).toHaveLength(1);
});
it('respects the persisted limit before starting a paid request', async () => {
  mock.data.captchaSpendGuard = [1, 2, 3].map(n => ({ tab: 7, id: `old-${n}`, at: Date.now() })); send(); await flush();
  expect(mock.solve).not.toHaveBeenCalled(); expect(mock.data.captchaLastStatus).toContain('限额');
});
it('does not retry a failed/unknown submission', async () => {
  mock.solve.mockRejectedValue(new Error('private error')); send(); await flush(); send(); await flush();
  expect(mock.solve).toHaveBeenCalledTimes(1); expect(mock.data.captchaLastStatus).not.toContain('private error');
});
it('stops in-flight work when the user disables automatic verification', async () => {
  mock.solve.mockImplementation(async (_c, _url, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('stopped')))));
  send(); await flush(); expect(mock.solve).toHaveBeenCalledTimes(1);
  mock.storageListeners[0]({ captchaEnabled: { newValue: false } }, 'local'); await flush();
  expect(mock.data.captchaLastStatus).toContain('停止'); expect(mock.send.mock.calls.some(([, r]) => r.type === 'captcha:apply')).toBe(false);
});
