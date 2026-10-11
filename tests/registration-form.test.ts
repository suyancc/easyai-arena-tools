import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../public/injected/registration-form.js', import.meta.url), 'utf8');
class Element {
  hidden = false; disabled = false; readOnly = false; clicks = 0; events: string[] = []; type = ''; name = ''; placeholder = ''; title = ''; _value = '';
  constructor(public textContent = '') {}
  get value() { return this._value; } set value(value: string) { this._value = value; }
  getClientRects() { return this.hidden ? [] : [1]; }
  getAttribute() { return null; }
  dispatchEvent(e: { type: string }) { this.events.push(e.type); }
  click() { this.clicks++; }
}
function fixture() {
  const buttons: Element[] = [], inputs: Element[] = [], headings: Element[] = [], frames: Element[] = [];
  const form = { __reactPropsFixture: {}, getClientRects: () => [1], querySelectorAll: (q: string) => q.includes('input') ? inputs.filter(e => e.type === 'password') : buttons.filter(e => e.type === 'submit') };
  const location = { origin: 'https://arena.ai', pathname: '/' };
  const window: any = {};
  const document = { querySelectorAll: (q: string) => ({ button: buttons, input: inputs, 'h1,h2,h3': headings, form: [form], iframe: frames } as Record<string, unknown>)[q] ?? [] };
  runInNewContext(source, { location, window, document, HTMLInputElement: Element, Event: class { constructor(public type: string) {} }, getComputedStyle: () => ({ visibility: 'visible' }) });
  return { buttons, inputs, headings, frames, location, call: (action = 'read', data = {}) => window.__arenaRegistrationForm(action, data) };
}
describe('registration form bridge contract', () => {
  it('uses native setter with input/change and checks email again before submit', () => {
    const f = fixture(), field = new Element(), button = new Element('Continue with email'); field.type = 'email'; f.inputs.push(field); f.buttons.push(button);
    expect(f.call('fillEmail', { email: 'test@outlook.com' }).acted).toBe(true); expect(field.value).toBe('test@outlook.com'); expect(field.events).toEqual(['input', 'change']);
    field.value = 'other@outlook.com'; expect(f.call('submitEmail', { email: 'test@outlook.com' }).failed).toBe(true); expect(button.clicks).toBe(0);
  });
  it('does not click CAPTCHA, including when a form action was requested', () => {
    const f = fixture(), frame = new Element(), button = new Element('Log In'); frame.title = 'Security challenge'; f.frames.push(frame); f.buttons.push(button);
    expect(f.call('openLogin').blocker).toBe('verification'); expect(button.clicks).toBe(0);
  });
  it('rejects ambiguous duplicate buttons', () => {
    const f = fixture(); f.buttons.push(new Element('Log In'), new Element('Log In'));
    expect(f.call('openLogin').deferred).toBe(true); expect(f.buttons.every(b => b.clicks === 0)).toBe(true);
  });
  it('matches the expected account rather than any email-looking button', () => {
    const f = fixture(); f.buttons.push(new Element('other@outlook.com'));
    expect(f.call('read', { email: 'test@outlook.com' })).toMatchObject({ stage: 'authenticated', accountMatches: false });
    expect(f.call('read', { email: 'OTHER@outlook.com' }).accountMatches).toBe(true);
  });
  it('fills exactly two passwords and refuses a user-edited confirmation', () => {
    const f = fixture(); f.location.pathname = '/auth/set-password'; const a = new Element(), b = new Element(), button = new Element('Save');
    a.type = b.type = 'password'; b.name = 'confirmPassword'; button.type = 'submit'; f.inputs.push(a, b); f.buttons.push(button);
    expect(f.call('fillPassword', { password: 'Fixture8!' }).acted).toBe(true); b.value = 'other';
    expect(f.call('submitPassword', { password: 'Fixture8!' }).failed).toBe(true); expect(button.clicks).toBe(0);
    b.value = 'Fixture8!'; expect(f.call('submitPassword', { password: 'Fixture8!' }).acted).toBe(true); expect(button.clicks).toBe(1);
  });
  it('does not return raw alerts, passwords or mailbox credentials', () => {
    const f = fixture(); const output = JSON.stringify(f.call('read', { password: 'PRIVATE_SENTINEL', refreshToken: 'PRIVATE_SENTINEL' })); expect(output).not.toContain('PRIVATE_SENTINEL'); expect(output).not.toContain('alert');
  });
});
