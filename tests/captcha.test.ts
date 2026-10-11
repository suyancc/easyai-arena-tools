import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaptchaError, TwoCaptcha, challenge, taskFor, validKey } from '../utils/captcha/api';
const c = { id: 'widget-1', key: 'fixture-site-key', enterprise: false, invisible: false, domain: 'google.com' as const };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
describe('2Captcha protocol boundaries', () => {
  it('validates key and challenge without accepting arbitrary task types', () => {
    expect(validKey('a'.repeat(32))).toBe(true); expect(validKey('invalid')).toBe(false);
    expect(challenge(c)).toEqual(c); expect(challenge({ ...c, domain: 'evil.test' })).toBeNull(); expect(challenge({ ...c, key: '<script>' })).toBeNull();
  });
  it('selects v2/Enterprise task and strips account/token-bearing URL query/hash', () => {
    expect(taskFor(c, 'https://arena.ai/auth/set-password?token=PRIVATE#secret')).toMatchObject({ type: 'RecaptchaV2TaskProxyless', websiteURL: 'https://arena.ai/auth/set-password' });
    expect(taskFor({ ...c, enterprise: true, s: 'fixture-s' }, 'https://arena.ai/')).toMatchObject({ type: 'RecaptchaV2EnterpriseTaskProxyless', enterprisePayload: { s: 'fixture-s' } });
    expect(() => taskFor(c, 'https://evil.test/')).toThrow();
  });
  it('uses detached native-compatible fetch, JSON POST, no cookies or redirects', async () => {
    let receiver: unknown, captured: RequestInit | undefined;
    const api = new TwoCaptcha('a'.repeat(32), function (this: unknown, _url, init) { receiver = this; captured = init; return Promise.resolve(json({ errorId: 0, balance: 1.25 })); });
    expect(await api.balance(new AbortController().signal)).toBe(1.25); expect(receiver).toBeUndefined();
    expect(captured).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error' });
  });
  it('creates once and polls every five seconds for a ready token', async () => {
    vi.useFakeTimers(); const fetcher = vi.fn().mockResolvedValueOnce(json({ errorId: 0, taskId: 123 })).mockResolvedValueOnce(json({ errorId: 0, status: 'processing' })).mockResolvedValueOnce(json({ errorId: 0, status: 'ready', solution: { gRecaptchaResponse: 'fixture-token' } }));
    const task = new TwoCaptcha('a'.repeat(32), fetcher).solve(c, 'https://arena.ai/', new AbortController().signal, async () => true, () => {});
    await vi.advanceTimersByTimeAsync(10001); expect(await task).toBe('fixture-token');
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['https://api.2captcha.com/createTask', 'https://api.2captcha.com/getTaskResult', 'https://api.2captcha.com/getTaskResult']);
  });
  it('does not create tasks for an already completed or replaced challenge', async () => {
    const fetcher = vi.fn(); expect(await new TwoCaptcha('a'.repeat(32), fetcher).solve(c, 'https://arena.ai/', new AbortController().signal, async () => false, () => {})).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not retry uncertain createTask failures or expose raw errors', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('PRIVATE_KEY'));
    await expect(new TwoCaptcha('a'.repeat(32), fetcher).solve(c, 'https://arena.ai/', new AbortController().signal, async () => true, () => {})).rejects.not.toThrow('PRIVATE_KEY'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('returns safe API error codes, never provider descriptions', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ errorId: 1, errorCode: 'ERROR_ZERO_BALANCE', errorDescription: 'PRIVATE_KEY' }));
    await expect(new TwoCaptcha('a'.repeat(32), fetcher).balance(new AbortController().signal)).rejects.toThrow('ERROR_ZERO_BALANCE');
  });
  it('cancels during polling without a second paid task', async () => {
    vi.useFakeTimers(); const control = new AbortController(); const fetcher = vi.fn().mockResolvedValue(json({ errorId: 0, taskId: 123 }));
    const task = new TwoCaptcha('a'.repeat(32), fetcher).solve(c, 'https://arena.ai/', control.signal, async () => true, () => {});
    const assertion = expect(task).rejects.toThrow('停止'); await vi.advanceTimersByTimeAsync(100); control.abort(); await assertion; expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('caps response bytes', async () => {
    await expect(new TwoCaptcha('a'.repeat(32), vi.fn().mockResolvedValue(new Response('x'.repeat(524289)))).balance(new AbortController().signal)).rejects.toThrow(CaptchaError);
  });
});
