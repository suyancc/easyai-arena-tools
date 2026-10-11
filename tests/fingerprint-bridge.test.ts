import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const script = readFileSync(new URL('../public/injected/fingerprint-bridge.js', import.meta.url), 'utf8');
const CHAT = 'https://arena.ai/work/0f8fad5b-d9cb-469f-a165-70867728950e';
function fixture(latest: string) {
  const message = { innerText: latest, textContent: latest, getAttribute: (name: string) => name === 'data-message-author-role' ? 'user' : null, parentElement: { closest: () => null } };
  const log = { getClientRects: () => [1], querySelectorAll: () => [message] };
  const main = { getClientRects: () => [1], querySelectorAll: () => [log] };
  const document = { querySelectorAll: () => [main] };
  const location = { hostname: 'arena.ai', href: CHAT };
  let response = { main: true, conversation: true, promptConfirmed: true, response: true, generating: false, activity: false, failed: false, responseSignature: 'sig', draft: '', responseText: '1 2 3', responseTextOversize: false };
  const action = vi.fn(() => ({ ok: true }));
  const window: any = { __arenaCompanion: { read: () => ({ ...response }), fingerprintAction: action } };
  runInNewContext(script, { window, document, location, URL, TextEncoder, getComputedStyle: () => ({ visibility: 'visible' }) });
  return { bridge: window.__arenaFingerprintBridge, action, location, set: (patch: Partial<typeof response>) => { response = { ...response, ...patch }; } };
}
describe('strict plugin bridge', () => {
  const first = 'This is an independent record of numerical choices. Choose 292 integers.';
  const second = 'This is an independent record of numerical choices. Choose 293 integers.';
  it('rejects previous answer despite same first 25 characters', () => {
    const f = fixture(first);
    expect(f.bridge.read(second).promptConfirmed).toBe(false);
    expect(f.bridge.read(second).responseText).toBeUndefined();
    expect(() => f.bridge.answer(second, CHAT, 'sig')).toThrow();
    expect(() => f.bridge.action('send', { previousPrompt: second, prompt: 'next', expectedRoute: CHAT })).toThrow();
    expect(f.action).not.toHaveBeenCalled();
  });
  it('returns only the matching stable answer and rejects changed route or signature', () => {
    const f = fixture(first);
    expect(f.bridge.answer(first, CHAT, 'sig')).toEqual({ text: '1 2 3', oversize: false });
    expect(() => f.bridge.answer(first, CHAT, 'old')).toThrow();
    f.location.href = 'https://arena.ai/work';
    expect(() => f.bridge.answer(first, CHAT, 'sig')).toThrow();
  });
  it('does not truncate oversize UTF-8 text into a valid sample', () => {
    const f = fixture(first); f.set({ responseText: '中'.repeat(22000) });
    expect(f.bridge.answer(first, CHAT, 'sig')).toEqual({ text: null, oversize: true });
  });
  it('fails closed while generating or with user draft', () => {
    const f = fixture(first); f.set({ generating: true }); expect(() => f.bridge.answer(first, CHAT, 'sig')).toThrow();
    f.set({ generating: false, draft: 'user draft' }); expect(() => f.bridge.answer(first, CHAT, 'sig')).toThrow();
  });
});
