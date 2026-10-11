import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const code = readFileSync(new URL('../public/injected/fingerprint-bridge.js', import.meta.url), 'utf8');
const selector = '[data-message-author-role],[data-message-role],[data-role],[data-author]';
function fixture(options: { main?: boolean; log?: boolean; user?: boolean; nested?: boolean; empty?: boolean; hidden?: boolean } = {}) {
  const secret = 'PRIVATE_USER_QUESTION_AND_ACCOUNT_123';
  const user = {
    innerText: options.empty ? '' : secret,
    getAttribute: (key: string) => key === 'data-role' ? 'user' : null,
    parentElement: { closest: () => options.nested ? {} : null },
  };
  const messages = options.user === false ? [] : [user];
  const log = { getClientRects: () => [1], querySelectorAll: (key: string) => key === selector ? messages : [] };
  const logs = options.log === false ? [] : [log];
  const main = { getClientRects: () => options.hidden ? [] : [1], querySelectorAll: (key: string) => key === '[role="log"]' ? logs : key === selector ? messages : [] };
  const document = { readyState: 'complete', querySelectorAll: (key: string) => key === 'main' ? options.main === false ? [] : [main] : key === selector ? messages : key === '[role="log"]' ? logs : [] };
  const window: any = { __arenaCompanion: {}, __MODEL_PROBE__: {}, __arenaFingerprintObserver: {} };
  const warn = vi.fn();
  runInNewContext(code, { window, document, getComputedStyle: () => ({ visibility: 'visible' }), location: { hostname: 'arena.ai', pathname: '/work/PRIVATE_CONVERSATION_ID', href: 'https://arena.ai/work/PRIVATE_CONVERSATION_ID' }, console: { warn } });
  return { bridge: window.__arenaFingerprintBridge, warn, secret };
}
describe('privacy-safe DOM diagnostics', () => {
  it.each([
    [{ main: false }, 'NO_VISIBLE_MAIN'],
    [{ hidden: true }, 'NO_VISIBLE_MAIN'],
    [{ log: false }, 'NO_VISIBLE_LOG'],
    [{ user: false }, 'NO_USER_ROLE'],
    [{ nested: true }, 'ALL_USERS_FILTERED_AS_NESTED'],
    [{ empty: true }, 'EMPTY_LAST_USER'],
    [{}, 'READY'],
  ] as const)('explains selection failure %#', (options, expected) => {
    const f = fixture(options);
    expect(f.bridge.diagnostics().reason).toBe(expected);
    expect(Boolean(f.bridge.latestPrompt())).toBe(expected === 'READY');
  });
  it('records bounded stages without prompt, HTML, URLs or IDs', () => {
    const f = fixture();
    for (let i = 0; i < 25; i++) f.bridge.recordDiagnostic('PREFLIGHT');
    f.bridge.recordDiagnostic(f.secret);
    f.bridge.recordDiagnostic('MISSING_PROMPT');
    const result = f.bridge.diagnostics();
    expect(result.events).toHaveLength(20);
    expect(result.events.at(-1).code).toBe('MISSING_PROMPT');
    expect(f.warn).toHaveBeenCalledOnce();
    const output = JSON.stringify([result, f.warn.mock.calls]);
    expect(output).not.toContain('PRIVATE_');
    expect(output).not.toContain('https://');
    result.events[0].code = 'mutated';
    expect(f.bridge.diagnostics().events[0].code).toBe('PREFLIGHT');
  });
});
