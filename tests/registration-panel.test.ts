import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ send: vi.fn(), listeners: [] as any[], permission: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: {
  runtime: { id: 'fixture', sendMessage: (...args: any[]) => mock.send(...args), onMessage: { addListener: (fn: any) => mock.listeners.push(fn) } },
  permissions: { request: (...args: any[]) => mock.permission(...args) }, windows: { getCurrent: async () => ({ id: 1 }) },
  storage: { local: { get: async () => ({}), set: async () => {} } },
} }));
import { installRegistrationPanel } from '../entrypoints/sidepanel/registration';
const idle = { running: false, stage: 'idle', message: 'idle', tabId: null };
const running = { running: true, stage: 'mailbox', message: 'checking mailbox', tabId: null };
const credential = 'fixture@outlook.com----none----12345678-1234-1234-1234-123456789abc----fixture-only';
let elements: Record<string, any>;
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
beforeEach(async () => {
  vi.useFakeTimers(); mock.send.mockReset(); mock.permission.mockReset().mockResolvedValue(true); mock.listeners.length = 0;
  elements = {};
  vi.stubGlobal('document', { body: { classList: { add() {}, remove() {} } }, getElementById: (id: string) => elements[id] ??= { value: '', hidden: false, disabled: false, textContent: '', focus() {}, classList: { toggle() {} } } });
  vi.stubGlobal('window', { addEventListener() {} });
  mock.send.mockResolvedValue({ ok: true, data: idle });
  installRegistrationPanel({ beforeOpen() {}, canStart: () => true, running() {} }); await flush();
  elements['registration-account'].value = credential;
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('retains input while waiting and clears only after explicit acceptance', async () => {
  let answer!: (value: unknown) => void;
  mock.send.mockImplementation(() => new Promise(resolve => { answer = resolve; }));
  const task = elements['registration-start'].onclick(); await flush();
  expect(elements['registration-account'].value).toBe(credential);
  expect(elements['registration-status'].textContent).toContain('等待接收确认');
  expect(elements['registration-start'].textContent).toBe('正在启动…');
  answer({ ok: true, accepted: true, data: running }); await task;
  expect(elements['registration-account'].value).toBe(''); expect(elements['registration-status'].textContent).toBe(running.message);
});
it('retains input and a visible definite rejection reason', async () => {
  mock.send.mockResolvedValue({ ok: false, error: '只允许指定面板' });
  await elements['registration-start'].onclick();
  expect(elements['registration-account'].value).toBe(credential); expect(elements['registration-status'].textContent).toBe('只允许指定面板');
  expect(elements['registration-start'].disabled).toBe(false);
});
it('does not clear input on backend startup failure', async () => {
  mock.send.mockResolvedValue({ ok: true, accepted: false, data: { ...idle, stage: 'error', message: '密码设置无效' } });
  await elements['registration-start'].onclick(); expect(elements['registration-account'].value).toBe(credential);
  expect(elements['registration-status'].textContent).toBe('密码设置无效');
});
it('times out visibly without resending and requires cancellation before another start', async () => {
  mock.send.mockImplementation(() => new Promise(() => {}));
  const task = elements['registration-start'].onclick(); await flush(); await vi.advanceTimersByTimeAsync(10001); await task;
  expect(elements['registration-account'].value).toBe(credential); expect(elements['registration-status'].textContent).toContain('启动结果未确认');
  expect(elements['registration-start'].disabled).toBe(true); expect(elements['registration-stop'].hidden).toBe(false);
  const count = mock.send.mock.calls.length; await elements['registration-start'].onclick(); expect(mock.send).toHaveBeenCalledTimes(count);
  mock.send.mockResolvedValue({ ok: true, data: { ...idle, stage: 'stopped', message: 'stopped' } });
  await elements['registration-stop'].onclick(); expect(elements['registration-start'].disabled).toBe(false);
});
it('does not let a stale refresh overwrite a startup rejection', async () => {
  let refresh!: (value: unknown) => void;
  mock.send.mockImplementation((req: any) => req.type === 'registration:state' ? new Promise(resolve => { refresh = resolve; }) : Promise.resolve({ ok: false, error: '启动失败' }));
  elements['registration-toggle'].onclick(); await flush(); await elements['registration-start'].onclick();
  refresh({ ok: true, data: idle }); await flush(); expect(elements['registration-status'].textContent).toBe('启动失败');
});
it('does not replace a newer broadcast with an older start acknowledgement', async () => {
  let answer!: (value: unknown) => void;
  mock.send.mockImplementation(() => new Promise(resolve => { answer = resolve; }));
  const task = elements['registration-start'].onclick(); await flush();
  mock.listeners[0]({ type: 'registration:changed', data: { ...running, message: 'newer progress' } }, { id: 'fixture' });
  answer({ ok: true, accepted: true, data: running }); await task;
  expect(elements['registration-status'].textContent).toBe('newer progress'); expect(elements['registration-account'].value).toBe('');
});
