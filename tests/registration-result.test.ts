import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installRegistrationResult } from '../entrypoints/sidepanel/registration-result';
const result = { email: 'fixture@outlook.com', password: 'ActualFixture9!', completedAt: 1770000000000 };
let elements: Record<string, any>, request: ReturnType<typeof vi.fn>, clipboard: ReturnType<typeof vi.fn>;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
beforeEach(() => {
  elements = {}; request = vi.fn().mockResolvedValue({ ok: true, data: result }); clipboard = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('document', { getElementById: (id: string) => elements[id] ??= { value: '', hidden: true, type: 'password', textContent: '' } });
  vi.stubGlobal('window', { addEventListener() {} }); vi.stubGlobal('navigator', { clipboard: { writeText: clipboard } });
});
afterEach(() => vi.unstubAllGlobals());
it('shows the last result masked by default and supports reveal/remask', async () => {
  const view = installRegistrationResult(request); await flush();
  expect(elements['registration-result'].hidden).toBe(false); expect(elements['registration-result-email'].value).toBe(result.email);
  expect(elements['registration-result-password'].type).toBe('password'); elements['registration-result-show'].onclick();
  expect(elements['registration-result-password'].type).toBe('text'); view.mask(); expect(elements['registration-result-password'].type).toBe('password');
});
it('copies email, actual password, and combined account only on clicks', async () => {
  installRegistrationResult(request); await flush(); expect(clipboard).not.toHaveBeenCalled();
  elements['registration-copy-email'].onclick(); elements['registration-copy-password'].onclick(); elements['registration-copy-both'].onclick(); await flush();
  expect(clipboard.mock.calls.map(([v]) => v)).toEqual([result.email, result.password, `${result.email}----${result.password}`]);
});
it('clears the stored result and hides its fields', async () => {
  installRegistrationResult(request); await flush(); await elements['registration-result-clear'].onclick();
  expect(request).toHaveBeenCalledWith('registration:clearResult'); expect(elements['registration-result'].hidden).toBe(true); expect(elements['registration-result-password'].value).toBe('');
});
it('shows no fabricated credentials for an absent result', async () => {
  request.mockResolvedValue({ ok: true, data: null }); installRegistrationResult(request); await flush();
  expect(elements['registration-result'].hidden).toBe(true); elements['registration-copy-both'].onclick(); expect(clipboard).not.toHaveBeenCalled();
});
it('reports clipboard failure without exposing the password in feedback', async () => {
  clipboard.mockRejectedValue(new Error(result.password)); installRegistrationResult(request); await flush();
  elements['registration-copy-both'].onclick(); await flush();
  expect(elements['registration-result-feedback'].textContent).toContain('复制失败'); expect(elements['registration-result-feedback'].textContent).not.toContain(result.password);
});
