import { describe, expect, it, vi } from 'vitest';
import { OutlookMailbox, OUTLOOK_MESSAGES_URL, serviceCallback } from '../utils/registration/mailbox';
import { MAIL_ORIGINS, RegistrationError } from '../utils/registration/contracts';
const email = 'fixture@outlook.com', clientId = '12345678-1234-1234-1234-123456789abc';
const now = Date.parse('2026-10-11T10:00:00Z');
const link = 'https://arena.ai/nextjs-api/callback/email?token=fixture&type=email&signup_intent_id=fixture-intent';
const account = () => ({ email, clientId, refreshToken: 'PRIVATE_FIXTURE' });
const mail = (id = 'new', at = now) => ({ id, subject: 'Confirm Your Signup', from: 'Arena <team@everify.arena.ai>', to: email, received_at: new Date(at).toISOString(), text: `Verify Email\n[${link}]`, html: `<a href="${link.replaceAll('&', '&amp;')}">Verify</a>`, otp: '' });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const signal = () => new AbortController().signal;
describe('selected HTTPS Outlook mailbox service', () => {
  it('calls fetch without binding the mailbox object as its receiver', async () => {
    let receiver: unknown = 'not-called';
    const fetcher: typeof fetch = function (this: unknown) { receiver = this; return Promise.resolve(json({ messages: [] })); };
    await new OutlookMailbox(account(), fetcher).prepare(signal());
    expect(receiver).toBeUndefined();
  });
  it('posts only to the fixed endpoint with the documented JSON account and no browser cookies', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ messages: [] }));
    await new OutlookMailbox(account(), fetcher).prepare(signal());
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(OUTLOOK_MESSAGES_URL); expect(MAIL_ORIGINS).toEqual(['https://tools.oai9.com/*']);
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(init.body)).toEqual({ account: `${email}----none----${clientId}----PRIVATE_FIXTURE` });
    expect(init.headers.Referer).toBeUndefined(); expect(init.headers.Authorization).toBeUndefined();
  });
  it('preflights old IDs and extracts a new callback preserving signup_intent_id', async () => {
    const input = account();
    const fetcher = vi.fn().mockResolvedValueOnce(json({ messages: [mail('old')] })).mockResolvedValueOnce(json({ messages: [mail('old')] })).mockResolvedValueOnce(json({ messages: [mail('old'), mail()] }));
    const box = new OutlookMailbox(input, fetcher); await box.prepare(signal());
    expect(await box.callback(now, signal())).toBeNull(); expect(await box.callback(now, signal())).toBe(link);
    expect(fetcher.mock.calls.every(([url]) => url === OUTLOOK_MESSAGES_URL)).toBe(true);
    box.dispose(); expect(input.refreshToken).toBe(''); await expect(box.callback(now, signal())).rejects.toThrow('预检');
  });
  it('parses text-only bracketed links without rendering HTML or following images', () => {
    expect(serviceCallback({ messages: [{ ...mail(), html: '<img src="https://untrusted.test/tracker">' }] }, email, now, new Set())).toBe(link);
  });
  it('filters exact recipient, invalid date, old timestamp and baseline IDs', () => {
    const rows = [{ ...mail('wrong'), to: 'other@outlook.com' }, { ...mail('partial'), to: `x${email}` }, mail('before', now - 1000), mail('old'), { ...mail('invalid'), received_at: 'invalid' }];
    expect(serviceCallback({ messages: rows }, email, now, new Set(['old']))).toBeNull();
    expect(serviceCallback({ messages: [{ ...mail(), to: `Fixture <${email.toUpperCase()}>` }] }, email, now, new Set())).toBe(link);
  });
  it('selects newest matching mail regardless of service result order', () => {
    const newer = { ...mail('newer', now + 1000), html: '', text: link.replace('token=fixture', 'token=newer-fixture') };
    expect(serviceCallback({ messages: [newer, mail()] }, email, now, new Set())).toBe(newer.text);
  });
  it('does not use subject/otp or offsite/reset links', () => {
    for (const text of ['', link.replace('arena.ai/', 'arena.ai.evil.test/'), link.replace('type=email', 'type=reset')]) {
      expect(serviceCallback({ messages: [{ ...mail(), html: '', text, subject: link, otp: link }] }, email, now, new Set())).toBeNull();
    }
  });
  it.each([null, {}, { messages: 'wrong' }, { messages: [], success: false }, { messages: [], error: 'PRIVATE_FIXTURE' }, { messages: [{ ...mail(), id: null }] }])('rejects malformed or error response without echoing its contents', async value => {
    const fetcher = vi.fn().mockResolvedValue(json(value));
    await expect(new OutlookMailbox(account(), fetcher).prepare(signal())).rejects.toThrow(RegistrationError);
  });
  it.each([400, 401, 429, 500])('stops on HTTP %s without fallback or retry', async status => {
    const fetcher = vi.fn().mockResolvedValue(json({ error: 'PRIVATE_FIXTURE' }, status));
    await expect(new OutlookMailbox(account(), fetcher).prepare(signal())).rejects.not.toThrow('PRIVATE_FIXTURE'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('redacts transport errors', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('PRIVATE_FIXTURE'));
    await expect(new OutlookMailbox(account(), fetcher).prepare(signal())).rejects.not.toThrow('PRIVATE_FIXTURE'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounds streamed response size and row count', async () => {
    for (const response of [new Response('x'.repeat(2097153)), json({ messages: Array.from({ length: 1001 }, () => mail()) })]) {
      await expect(new OutlookMailbox(account(), vi.fn().mockResolvedValue(response)).prepare(signal())).rejects.toThrow(RegistrationError);
    }
  });
  it('does not contact the service after cancellation', async () => {
    const c = new AbortController(); c.abort(); const fetcher = vi.fn();
    await expect(new OutlookMailbox(account(), fetcher).prepare(c.signal)).rejects.toThrow('停止'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('propagates in-flight cancellation to fetch', async () => {
    const c = new AbortController(); let observed: AbortSignal | undefined;
    const fetcher = vi.fn(async (_url: any, init: any) => new Promise<Response>((_resolve, reject) => { observed = init.signal; init.signal.addEventListener('abort', () => reject(new Error('aborted'))); }));
    const task = new OutlookMailbox(account(), fetcher).prepare(c.signal); c.abort();
    await expect(task).rejects.toThrow('停止'); expect(observed?.aborted).toBe(true);
  });
  it('distinguishes immediate fetch rejection from timeout and redacts native error details', async () => {
    const box = new OutlookMailbox(account(), vi.fn().mockRejectedValue(new TypeError('PRIVATE_FIXTURE')));
    try { await box.prepare(signal()); throw new Error('expected failure'); }
    catch (error) { expect(String(error)).toContain('MAIL_FETCH'); expect(String(error)).toContain('HTTP 未建立'); expect(String(error)).not.toContain('PRIVATE_FIXTURE'); }
  });
  it.each([['text/html', '<html>PRIVATE_FIXTURE</html>', 'HTML'], ['application/json', '', 'JSON']])('identifies invalid JSON for %s without displaying response body', async (mime, body, label) => {
    const box = new OutlookMailbox(account(), vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': mime } })));
    try { await box.prepare(signal()); throw new Error('expected failure'); }
    catch (error) { expect(String(error)).toContain('MAIL_JSON'); expect(String(error)).toContain(`HTTP 200 / ${label}`); expect(String(error)).not.toContain('PRIVATE_FIXTURE'); }
  });
  it('identifies response stream failure separately from request failure', async () => {
    const body = new ReadableStream({ start(c) { c.error(new Error('PRIVATE_FIXTURE')); } });
    await expect(new OutlookMailbox(account(), vi.fn().mockResolvedValue(new Response(body))).prepare(signal())).rejects.toThrow('MAIL_READ');
  });
  it('identifies invalid UTF-8 separately from malformed JSON', async () => {
    await expect(new OutlookMailbox(account(), vi.fn().mockResolvedValue(new Response(new Uint8Array([255, 255])))).prepare(signal())).rejects.toThrow('MAIL_UTF8');
  });
  it('reports the actual local deadline as MAIL_TIMEOUT, not a generic fetch error', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async (_url: any, init: any) => new Promise<Response>((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('PRIVATE_FIXTURE')))));
      const task = new OutlookMailbox(account(), fetcher).prepare(signal());
      const assertion = expect(task).rejects.toThrow('MAIL_TIMEOUT');
      await vi.advanceTimersByTimeAsync(15001); await assertion; expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

});
