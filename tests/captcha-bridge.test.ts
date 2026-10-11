import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../public/injected/captcha-bridge.js', import.meta.url), 'utf8');
function fixture() {
  const frame = { hidden: false, src: 'https://www.google.com/recaptcha/api2/anchor?k=fixture-site-key&size=normal', getClientRects() { return this.hidden ? [] : [1]; }, closest() { return null; } };
  const callback = vi.fn(); const config = { sitekey: 'fixture-site-key', callback };
  const window: any = { ___grecaptcha_cfg: { clients: { 0: { nested: config } } }, grecaptcha: { getResponse: () => '' } };
  let id = 0; runInNewContext(source, { window, location: { origin: 'https://arena.ai' }, document: { querySelectorAll: () => [frame] }, Node: class {}, URL, crypto: { randomUUID: () => `id-${++id}` }, getComputedStyle: () => ({ visibility: 'visible' }) });
  return { window, api: window.__arenaCaptcha, frame, config, callback };
}
it('reads v2 metadata and applies only its matched callback once', async () => {
  const f = fixture(), c = f.api.inspect(); expect(c).toMatchObject({ key: 'fixture-site-key', enterprise: false, domain: 'google.com' });
  expect(await f.api.apply(c.id, 'fixture-token')).toEqual({ applied: true }); expect(f.callback).toHaveBeenCalledWith('fixture-token');
  expect(await f.api.apply(c.id, 'fixture-token')).toEqual({ applied: false }); expect(f.callback).toHaveBeenCalledTimes(1);
});
it('recognizes enterprise and recaptcha.net without guessing from dialog text', () => {
  const f = fixture(); f.frame.src = 'https://www.recaptcha.net/recaptcha/enterprise/anchor?k=fixture-site-key&size=invisible&s=fixture';
  expect(f.api.inspect()).toMatchObject({ enterprise: true, invisible: true, domain: 'recaptcha.net', s: 'fixture' });
});
it('does not accept spoofed Google iframe origins', () => {
  const f = fixture(); f.frame.src = f.frame.src.replace('www.google.com', 'www.google.com.evil.test'); expect(f.api.inspect()).toBeNull();
});
it('blocks unknown or ambiguous callbacks before paid tasks', () => {
  const f = fixture(); f.window.___grecaptcha_cfg.clients = {}; expect(f.api.inspect()).toEqual({ unsupported: true });
  f.window.___grecaptcha_cfg.clients = { a: f.config, b: { sitekey: 'fixture-site-key', callback: () => {} } }; expect(f.api.inspect()).toEqual({ unsupported: true });
});
it('does not inject into a changed challenge or an already manually solved widget', async () => {
  const f = fixture(); expect(await f.api.apply('stale-id', 'fixture-token')).toEqual({ applied: false });
  f.window.grecaptcha.getResponse = () => 'manual-token'; expect(f.api.inspect()).toBeNull(); expect(f.callback).not.toHaveBeenCalled();
});
it('issues a new episode id after the widget is hidden then shown again', () => {
  const f = fixture(), first = f.api.inspect(); f.frame.hidden = true; expect(f.api.inspect()).toBeNull();
  f.frame.hidden = false; expect(f.api.inspect().id).not.toBe(first.id);
});
it('does not replay a throwing callback', async () => {
  const f = fixture(); f.callback.mockImplementation(() => { throw new Error('fixture'); }); const c = f.api.inspect();
  expect(await f.api.apply(c.id, 'fixture-token')).toEqual({ applied: false }); expect(await f.api.apply(c.id, 'fixture-token')).toEqual({ applied: false }); expect(f.callback).toHaveBeenCalledTimes(1);
});
