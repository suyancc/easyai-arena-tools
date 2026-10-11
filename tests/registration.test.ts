import { describe, expect, it, vi } from 'vitest';
import { RegistrationError, findCallback, mailboxCallback, parseAccount, validCallback, validPassword, type FormAction, type FormState } from '../utils/registration/contracts';
import { registerOne, type RegistrationPorts } from '../utils/registration/workflow';
const email = 'test@outlook.com', clientId = '12345678-1234-1234-1234-123456789abc';
const link = 'https://arena.ai/nextjs-api/callback/email?token=fixture&type=email';
const now = Date.parse('2026-10-11T10:00:00Z');
const message = (id = 'new', at = now) => ({ id, receivedDateTime: new Date(at).toISOString(), toRecipients: [{ emailAddress: { address: email } }], body: { content: `<a href="${link.replace('&', '&amp;')}">Verify</a>` } });
describe('registration input and callback boundaries', () => {
  it('parses four parts, drops mailbox password and preserves token delimiters', () => {
    expect(parseAccount(` ${email.toUpperCase()}----private-password----${clientId}----fixture----token `)).toEqual({ email, clientId, refreshToken: 'fixture----token' });
    expect(JSON.stringify(parseAccount(`${email}----none----${clientId}----fixture`))).not.toContain('none');
  });
  it.each(['', 'test@outlook.com', `bad email----none----${clientId}----fixture`, `${email}----none----invalid----fixture`, `${email}----none----${clientId}----`, `${email}----none----${clientId}----a\nb`, 'a'.repeat(12001)])('rejects malformed input without reflecting it', input => {
    expect(() => parseAccount(input)).toThrow(RegistrationError);
    try { parseAccount(input); } catch (e) { if (input.length > 10) expect(String(e)).not.toContain(input); }
  });
  it('bounds configurable registration password', () => { expect(validPassword('Fixture8!')).toBe(true); expect(validPassword('short')).toBe(false); expect(validPassword('x'.repeat(129))).toBe(false); });
  it('accepts only exact HTTPS callback and decodes HTML entities', () => {
    expect(validCallback(link)).toBe(true); expect(validCallback(link.replace('arena.ai', 'arena.ai:443'))).toBe(true);
    for (const entity of ['&amp;', '&#38;', '&#x26;']) expect(findCallback(`<a href="${link.replace('&', entity)}">go</a>`)).toBe(link);
  });
  it.each([
    link.replace('https:', 'http:'), link.replace('arena.ai', 'arena.ai.evil.test'), link.replace('arena.ai', 'user@arena.ai'), link.replace('arena.ai', 'arena.ai:444'),
    link.replace('type=email', 'type=reset'), link + '&token=duplicate', link + '&type=email', link + '#', link + '#fragment', link.replace('token=fixture', 'token='),
    link.replace('token=fixture', `token=${'x'.repeat(4097)}`), link + '&redirect=https://evil.test', link.replace('/callback/email', '/callback/password'),
  ])('rejects unsafe callback %s', value => expect(validCallback(value)).toBe(false));
  it('selects latest current-recipient current-task body link, not subject or old IDs', () => {
    const old = message('old', now + 5000), wrong = { ...message('wrong', now + 4000), toRecipients: [{ emailAddress: { address: 'other@outlook.com' } }] };
    const before = message('before', now - 1000), subject = { ...message('subject', now + 6000), body: {}, subject: link };
    expect(mailboxCallback({ value: [old, wrong, before, subject, message()] }, email, now, new Set(['old']))).toBe(link);
    expect(mailboxCallback({ value: [old, wrong, before, subject] }, email, now, new Set(['old']))).toBeNull();
  });
  it('supports REST casing and does not follow unrelated email URLs', () => {
    expect(mailboxCallback({ value: [{ Id: 'rest', ReceivedDateTime: new Date(now).toISOString(), ToRecipients: [{ EmailAddress: { Address: email.toUpperCase() } }], Body: { Content: link } }] }, email, now, new Set())).toBe(link);
    expect(findCallback('https://evil.test/?token=fixture')).toBeNull();
  });
});
function fixture() {
  let time = now, stage = 'expand', blocker = '', matches = true;
  const controller = new AbortController(); const actions: FormAction[] = [];
  const ports: RegistrationPorts = {
    now: () => time, sleep: async ms => { time += ms; },
    mailbox: { prepare: vi.fn(async () => {}), callback: vi.fn(async () => link) },
    progress: vi.fn(), navigate: vi.fn(async () => { stage = 'setPassword'; }),
    page: vi.fn(async action => {
      if (action === 'read') return { stage, blocker, accountMatches: matches };
      actions.push(action);
      stage = ({ expand: 'loggedOut', openLogin: 'email', submitEmail: 'create', create: 'verification', submitPassword: 'authenticated' } as Record<string, string>)[action] ?? stage;
      return { stage, blocker, acted: true };
    }),
  };
  return { ports, controller, actions, setStage: (s: string) => { stage = s; }, setBlocker: (b: string) => { blocker = b; }, mismatch: () => { matches = false; }, run: () => registerOne(ports, email, 'Fixture8!', 'nickname', controller.signal) };
}
describe('registration state machine', () => {
  it('completes the exact create/callback/password/identity chain once', async () => {
    const f = fixture(); await f.run();
    expect(f.actions).toEqual(['expand', 'openLogin', 'fillEmail', 'submitEmail', 'fillName', 'create', 'fillPassword', 'submitPassword']);
    expect(f.ports.navigate).toHaveBeenCalledTimes(1); expect(f.ports.progress).toHaveBeenLastCalledWith('done', expect.any(String));
  });
  it('does not open or act on a webpage when mailbox preflight fails', async () => {
    const f = fixture(); f.ports.mailbox.prepare = vi.fn(async () => { throw new RegistrationError('预检失败'); });
    await expect(f.run()).rejects.toThrow('预检失败'); expect(f.ports.page).not.toHaveBeenCalled();
  });
  it.each(['authenticated', 'loginPassword', 'invalid', 'wrong_origin', 'create', 'verification', 'setPassword'])('refuses unowned initial stage %s', async stage => {
    const f = fixture(); f.setStage(stage); await expect(f.run()).rejects.toThrow(); expect(f.actions).toEqual([]);
  });
  it('does not claim success for a different authenticated account', async () => { const f = fixture(); f.mismatch(); await expect(f.run()).rejects.toThrow('不匹配'); });
  it('pauses for human CAPTCHA and resumes without interacting with it', async () => {
    const f = fixture(); f.setBlocker('verification'); let pauses = 0;
    const sleep = f.ports.sleep; f.ports.sleep = async (ms, signal) => { await sleep(ms, signal); if (++pauses === 3) f.setBlocker(''); };
    await f.run(); expect(f.ports.progress).toHaveBeenCalledWith('human', expect.any(String)); expect(f.actions[0]).toBe('expand');
  });
  it.each(['rate_limit', 'connect_failed', 'page_error'])('stops on %s without submitting', async blocker => {
    const f = fixture(); f.setBlocker(blocker); await expect(f.run()).rejects.toThrow(); expect(f.actions).toEqual([]);
  });
  it('cancellation during mailbox poll prevents callback navigation', async () => {
    const f = fixture(); f.ports.mailbox.callback = async () => { f.controller.abort(); return link; };
    await expect(f.run()).rejects.toThrow('停止'); expect(f.ports.navigate).not.toHaveBeenCalled(); expect(f.actions).not.toContain('fillPassword');
  });
  it('uncertain submission is not replayed', async () => {
    const f = fixture(), page = f.ports.page;
    f.ports.page = vi.fn(async (action, data) => { if (action === 'submitEmail') { f.actions.push(action); throw new Error('transport'); } return page(action, data); });
    await expect(f.run()).rejects.toThrow(); expect(f.actions.filter(a => a === 'submitEmail')).toHaveLength(1); expect(f.actions).not.toContain('create');
  });
  it('explicitly deferred (not acted) buttons may be retried', async () => {
    const f = fixture(), page = f.ports.page; let deferred = false;
    f.ports.page = async (action, data): Promise<FormState> => { if (action === 'create' && !deferred) { deferred = true; return { stage: 'create', blocker: '', deferred: true }; } return page(action, data); };
    await f.run(); expect(deferred).toBe(true); expect(f.actions.filter(a => a === 'create')).toHaveLength(1);
  });
  it('rejects an unsafe callback even if mailbox implementation returns one', async () => {
    const f = fixture(); f.ports.mailbox.callback = async () => 'https://evil.test/';
    await expect(f.run()).rejects.toThrow('校验'); expect(f.ports.navigate).not.toHaveBeenCalled();
  });
  it('stops after deadline without resubmitting create', async () => {
    const f = fixture(); f.ports.mailbox.callback = async () => null;
    await expect(f.run()).rejects.toThrow('超时'); expect(f.actions.filter(a => a === 'create')).toHaveLength(1);
  });
  it('retries only navigation reads, not terminal origin/ownership errors', async () => {
    const f = fixture(); f.ports.page = vi.fn(async () => { throw new RegistrationError('离开 Arena'); });
    await expect(f.run()).rejects.toThrow('离开'); expect(f.ports.page).toHaveBeenCalledTimes(1);
  });
});
