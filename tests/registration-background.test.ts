import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ listeners: [] as any[], removed: [] as any[], saved: {} as Record<string, unknown>, local: {} as Record<string, unknown>, busy: false, run: vi.fn(), writes: vi.fn(), broadcasts: vi.fn(), remove: vi.fn(), send: vi.fn(), dispose: vi.fn(), create: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: {
  runtime: { sendMessage: async (v: unknown) => { mock.broadcasts(v); }, id: 'fixture-id', getURL: (p: string) => `chrome-extension://fixture-id${p}`, onMessage: { addListener: (fn: any) => mock.listeners.push(fn) } },
  storage: { local: { get: async (key: string) => key === 'registrationStatus' ? mock.saved : mock.local, set: async (v: unknown) => { mock.writes(v); }, remove: async (key: string) => { mock.remove(key); } } },
  permissions: { contains: async () => true }, windows: { get: async () => ({ id: 1 }) },
  tabs: { onRemoved: { addListener: (fn: any) => mock.removed.push(fn) }, query: async () => [{ id: 1 }], sendMessage: (...args: any[]) => mock.send(...args), create: (...args: any[]) => mock.create(...args), get: async () => ({ url: 'https://arena.ai/' }), update: async () => ({}) },
} }));
vi.mock('../utils/registration/mailbox', () => ({ OutlookMailbox: class { dispose() { mock.dispose(); } } }));
vi.mock('../utils/registration/workflow', () => ({ registerOne: (...args: any[]) => mock.run(...args) }));
import { installRegistration } from '../utils/registration/background';
const sender = { id: 'fixture-id', url: 'chrome-extension://fixture-id/sidepanel.html' };
const start = { type: 'registration:start', windowId: 1, account: 'test@outlook.com----unused-secret----12345678-1234-1234-1234-123456789abc----PRIVATE_SENTINEL' };
function send(request: unknown, from: unknown = sender): Promise<any> {
  return new Promise(resolve => { const handled = mock.listeners[0](request, from, resolve); if (handled !== true) resolve(undefined); });
}
beforeEach(() => {
  mock.listeners.length = mock.removed.length = 0; mock.saved = {}; mock.local = { registrationPassword: 'FixtureSetup9!' }; mock.busy = false;
  mock.broadcasts.mockReset(); mock.remove.mockReset(); mock.writes.mockReset(); mock.dispose.mockReset(); mock.send.mockReset(); mock.create.mockReset().mockResolvedValue({ id: 2 }); mock.run.mockReset();
  mock.send.mockImplementation(async (_id, req) => req.type === 'state:get' ? { ok: true, data: { running: mock.busy, manual: false } } : { ok: true, data: { stage: 'email', blocker: '' } });
  mock.run.mockImplementation(async (ports, email, _password, _name, signal) => {
    await ports.page('read', { email });
    await new Promise((_, reject) => { if (signal.aborted) reject(new Error('stopped')); else signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true }); });
  });
});
describe('registration background ownership and lifecycle', () => {
  it('rejects page/content senders and other extensions from starting privileged work', async () => {
    installRegistration();
    expect((await send(start, { ...sender, url: 'https://arena.ai/', tab: { id: 1 } })).ok).toBe(false);
    expect(await send(start, { ...sender, id: 'other-extension' })).toBeUndefined();
    expect(mock.run).not.toHaveBeenCalled();
  });
  it('admits only one job, exposes only busy to content, and clears mailbox state on stop', async () => {
    installRegistration(); expect(await send(start)).toMatchObject({ ok: true, accepted: true });
    await vi.waitFor(() => expect(mock.run).toHaveBeenCalledTimes(1));
    expect((await send(start)).ok).toBe(false);
    expect(await send({ type: 'registration:busy' }, { ...sender, url: 'https://arena.ai/', tab: { id: 1 } })).toEqual({ ok: true, running: true });
    await send({ type: 'registration:stop' }); await vi.waitFor(() => expect(mock.dispose).toHaveBeenCalledTimes(1));
    expect((await send({ type: 'registration:state' })).data.running).toBe(false);
    expect(JSON.stringify(mock.writes.mock.calls)).not.toMatch(/PRIVATE_SENTINEL|unused-secret|refreshToken|clientId/);
    expect(JSON.stringify(mock.send.mock.calls)).not.toMatch(/PRIVATE_SENTINEL|unused-secret|refreshToken|clientId/);
  });
  it('does not acknowledge acceptance when registration settings reject startup', async () => {
    mock.local.registrationPassword = 'short'; installRegistration();
    expect(await send(start)).toMatchObject({ ok: true, accepted: false, data: { running: false, stage: 'error' } });
    expect(mock.run).not.toHaveBeenCalled();
  });
  it('closes ownership on registration tab removal', async () => {
    installRegistration(); await send(start); await vi.waitFor(() => expect(mock.create).toHaveBeenCalledTimes(1));
    mock.removed[0](2); await vi.waitFor(() => expect(mock.dispose).toHaveBeenCalledTimes(1));
    expect((await send({ type: 'registration:state' })).data.stage).toBe('stopped');
  });
  it('does not resume an interrupted task or load its credentials', async () => {
    mock.saved.registrationStatus = { running: true, stage: 'mail', message: 'waiting', tabId: 5 }; installRegistration();
    const state = (await send({ type: 'registration:state' })).data;
    expect(state).toMatchObject({ running: false, stage: 'interrupted', tabId: 5 }); expect(mock.run).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled();
  });
  it('refuses registration when a draw task is already running', async () => {
    mock.busy = true; installRegistration(); await send(start);
    await vi.waitFor(() => expect(mock.dispose).toHaveBeenCalledTimes(1));
    expect(mock.run).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled();
    expect((await send({ type: 'registration:state' })).data.message).toContain('先停止');
  });
  it('saves only a verified successful result with the actual task password and keeps broadcasts clean', async () => {
    mock.local.registrationPassword = 'TaskFixture9!'; mock.run.mockResolvedValue(undefined); installRegistration();
    await send(start); await vi.waitFor(() => expect(mock.dispose).toHaveBeenCalledTimes(1));
    mock.local.registrationPassword = 'ChangedLater9!';
    const result = (await send({ type: 'registration:result' })).data;
    expect(result).toMatchObject({ email: 'test@outlook.com', password: 'TaskFixture9!', completedAt: expect.any(Number) });
    expect(mock.writes).toHaveBeenCalledWith({ registrationLastResult: result });
    expect(JSON.stringify(mock.broadcasts.mock.calls)).not.toMatch(/TaskFixture9|PRIVATE_SENTINEL|refreshToken/);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_SENTINEL|unused-secret|clientId/);
    await send({ type: 'registration:clearResult' }); expect(mock.remove).toHaveBeenCalledWith('registrationLastResult');
    expect((await send({ type: 'registration:result' })).data).toBeNull();
  });
  it('restores a prior successful result, but never fabricates a result for a failed attempt', async () => {
    mock.local.registrationLastResult = { email: 'prior@outlook.com', password: 'PriorFixture9!', completedAt: 123 };
    mock.run.mockRejectedValue(new Error('failure')); installRegistration(); await send(start);
    await vi.waitFor(() => expect(mock.dispose).toHaveBeenCalledTimes(1));
    expect((await send({ type: 'registration:result' })).data).toEqual(mock.local.registrationLastResult);
    expect(mock.writes.mock.calls.some(([v]) => v.registrationLastResult)).toBe(false);
  });
  it('never exposes the result to Arena content senders', async () => {
    installRegistration(); expect((await send({ type: 'registration:result' }, { ...sender, url: 'https://arena.ai/', tab: { id: 1 } })).ok).toBe(false);
  });

});
