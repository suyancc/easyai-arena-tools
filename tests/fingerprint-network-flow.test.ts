import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { inspectManual, runManualFingerprint, type ManualPorts } from '../utils/fingerprint/manual';
const CHAT = '0f8fad5b-d9cb-469f-a165-70867728950e', SESSION = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const route = `https://arena.ai/work/${CHAT}`;
async function fixture(preview: 'none' | 'complete' | 'pending' | 'failed' | 'missing-completion' = 'none') {
  let draft = '', sends = 0, clock = 0, active = true, httpFailure = false, navigate = false;
  let duplicate = false, thrown = false, attached = false, inferFamily = true;
  const location = { href: route, origin: 'https://arena.ai', pathname: `/work/${CHAT}`, hostname: 'arena.ai' };
  const handlers: Record<string, (e: any) => void> = {};
  const rows: any[] = [];
  const flush = async () => { for (let i = 0; i < 30; i++) await new Promise<void>(resolve => setImmediate(resolve)); };
  const probe = {
    bus: { activeTurnId: null as string | null },
    beginTurnInfo(id: string) { if (this.bus.activeTurnId) return { ok: false }; this.bus.activeTurnId = id; return { ok: true }; },
    endTurn(id: string) { if (this.bus.activeTurnId === id) this.bus.activeTurnId = null; },
    snapshotTurn(id: string) { return { api: true, turnId: id, captureBound: true, routeMatched: location.href === route, mode: sends > 0 && inferFamily ? 'INFERRED' : 'UNKNOWN', family: sends > 0 && inferFamily ? 'openai' : null, evidenceCount: 0, familyConflict: false }; },
  };
  const baseline = { id: CHAT, triggerAddress: SESSION, messages: [
    { id: 'old-tool-input', role: 'user', parts: [{ type: 'data-tool-results' }] },
    { id: 'old-answer', role: 'assistant', parts: preview === 'none' ? [{ type: 'text', text: 'history', state: 'done' }] : [
      { type: 'step-start' }, { type: 'tool-write_file', state: 'output-available', input: { content: '<html>PRIVATE_ARTIFACT 123</html>' }, output: {} },
      { type: 'step-start' }, { type: 'tool-present_file', state: 'output-available', output: {} }, { type: 'step-start' },
    ], metadata: { pending: preview === 'pending', timing: { completedAt: preview === 'missing-completion' ? null : 1 }, error: preview === 'failed' ? 'failed' : null } },
  ] };
  const window: any = { __MODEL_PROBE__: probe, getSelection: () => ({ removeAllRanges() {}, addRange() {} }) };
  const appendUrl = `https://arena.ai/ai-proxy/realtime/v1/sessions/${SESSION}/in/append`;
  const recordsUrl = `https://arena.ai/ai-proxy/realtime/v1/sessions/${SESSION}/out/records`;
  window.fetch = vi.fn(async (url: string, init: any) => {
    if (url.includes('/api/chat/')) return new Response(JSON.stringify(baseline), { headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/in/append')) {
      const m = JSON.parse(init.body).payload.message;
      const n = sends * 20;
      rows.push(...[
        { seqNum: n, data: { type: 'data-agent-dispatch', data: { inputId: m.id, attemptId: 'attempt-' + sends } } },
        { seqNum: n + 1, data: { type: 'start', messageId: 'a-' + sends } },
        { seqNum: n + 2, data: { type: 'text-start', id: '0' } },
        { seqNum: n + 3, data: { type: 'text-delta', id: '0', delta: '1 '.repeat(310) } },
        { seqNum: n + 4, data: { type: 'text-end', id: '0' } },
        { seqNum: n + 5, data: { type: 'finish', messageMetadata: { nodeId: 'a-' + sends, pending: false, timing: { completedAt: 2 } } } },
      ]);
      return new Response('{}', { status: httpFailure ? 500 : 200 });
    }
    return new Response(JSON.stringify({ records: [...rows, ...rows] }), { headers: { 'content-type': 'application/json' } });
  });
  const send = { disabled: false, getClientRects: () => [1], getAttribute: () => 'Send message', textContent: 'Send',
    click: () => {
      sends++;
      const body = (id: string) => JSON.stringify({ payload: { chatId: CHAT, messageId: id, message: { id, role: 'user', parts: [{ type: 'text', text: draft }] } } });
      const promise = window.fetch(appendUrl, { method: 'POST', body: body('u-' + sends) });
      if (duplicate) void window.fetch(appendUrl, { method: 'POST', body: body('duplicate') });
      draft = '';
      void promise.then(() => window.fetch(recordsUrl));
      if (navigate) { location.href = 'https://arena.ai/work'; location.pathname = '/work'; }
      if (thrown) throw new Error('uncertain click');
    },
  };
  const attachment = { ...send, getAttribute: () => 'Remove attachment', click: () => {} };
  const main: any = { getClientRects: () => [1], querySelectorAll: (s: string) => s === 'button' ? attached ? [send, attachment] : [send] : [] };
  const input: any = { getClientRects: () => [1], closest: () => main, focus() {}, get innerText() { return draft; } };
  const document = {
    readyState: 'complete', addEventListener: (name: string, fn: any) => { handlers[name] = fn; },
    querySelectorAll: (s: string) => s === 'main' ? [main] : s === 'main [contenteditable="true"]' ? [input] : [],
    createRange: () => ({ selectNodeContents() {} }),
    execCommand: (_command: string, _ui: boolean, value: string) => { draft = value; return true; },
  };
  window.__arenaCompanion = {
    read: () => ({ url: location.href, main: true, conversation: false, promptConfirmed: false, response: false, responseSignature: null, failed: true, generating: false, activity: false, completionConfirmed: false, editor: true, draft, sendReady: !!draft, blocker: null }),
    fingerprintAction: vi.fn(() => { throw new Error('Legacy DOM action must not be called'); }),
  };
  const context = { window, document, location, URL, TextEncoder, TextDecoder, Date, setTimeout, clearTimeout, getComputedStyle: () => ({ visibility: 'visible' }), crypto: { randomUUID: () => 'fresh' }, console };
  for (const file of ['fingerprint-network.js', 'fingerprint-bridge.js', 'fingerprint-observer.js']) runInNewContext(readFileSync(new URL('../public/injected/' + file, import.meta.url), 'utf8'), context);
  await window.fetch(`https://arena.ai/api/chat/${CHAT}`); await flush();
  const bridge = window.__arenaFingerprintBridge;
  const ports: ManualPorts = {
    context: async claim => { const c = window.__arenaFingerprintObserver.context(claim); c.page.allowed = c.page.url === route; return c; },
    release: async () => window.__arenaFingerprintObserver.unclaim(),
    page: {
      read: async prompt => ({ ...bridge.read(prompt), allowed: location.href === route }),
      action: async (name, options) => bridge.action(name, options),
      readAnswer: async (prompt, expected, signature) => bridge.answer(prompt, expected, signature),
      snapshot: async id => probe.snapshotTurn(id),
    },
    service: { prepare: vi.fn(async () => {}), score: vi.fn(async (answers: { text: string }[]) => { expect(answers).toHaveLength(3); expect(answers.every(a => a.text === '1 '.repeat(310))).toBe(true); return { kind: 'candidate' as const, candidate: { modelId: 'example', displayName: 'Example', family: 'openai' as const } }; }) },
    sleep: async ms => { clock += ms; await flush(); if (clock > 90000) throw new Error('Did not finish'); },
  };
  const host = { active: () => active, now: () => clock, say: vi.fn() };
  return { ports, host, window, unknownFamily: () => { inferFamily = false; }, sends: () => sends, setDraft: (s: string) => { draft = s; }, fail: () => { httpFailure = true; }, navigate: () => { navigate = true; }, duplicate: () => { duplicate = true; }, uncertain: () => { thrown = true; }, attach: () => { attached = true; }, cancel: () => { active = false; } };
}
describe('network → bridge → observer → three-question session', () => {
  it('runs exactly three sends with no DOM message roles and a textless historical user input', async () => {
    const f = await fixture(); const check = inspectManual(await f.ports.context(false));
    const result = await runManualFingerprint(f.ports, f.host, check.turnId, 60000);
    expect(result).toMatchObject({ kind: 'done', model: 'Example（指纹推测）' });
    expect(f.sends()).toBe(3); expect(f.ports.service.score).toHaveBeenCalledWith(expect.any(Array), 'openai');
    expect(f.window.__arenaCompanion.fingerprintAction).not.toHaveBeenCalled();
  });
  it('shows the computed top even without network family metadata', async () => {
    const f = await fixture(); f.unknownFamily(); const check = inspectManual(await f.ports.context(false));
    expect(await runManualFingerprint(f.ports, f.host, check.turnId, 60000)).toMatchObject({ kind: 'done', model: 'Example（指纹推测）', note: expect.stringContaining('评分最高型号') });
    expect(f.sends()).toBe(3); expect(f.ports.service.score).toHaveBeenCalledWith(expect.any(Array), null);
  });
  it('preserves an existing draft before preflight', async () => {
    const f = await fixture(); f.setDraft('private draft');
    const context = await f.ports.context(false);
    expect(() => inspectManual(context)).toThrow('草稿');
    expect(f.sends()).toBe(0);
  });
  it.each(['fail', 'navigate', 'duplicate', 'uncertain'] as const)('stops without retrying on %s', async kind => {
    const f = await fixture(); const check = inspectManual(await f.ports.context(false)); f[kind]();
    const result = await runManualFingerprint(f.ports, f.host, check.turnId, 60000);
    expect(result.kind).not.toBe('pending'); expect(f.sends()).toBe(1); expect(f.ports.service.score).not.toHaveBeenCalled();
  });
  it('does not silently include staged attachments', async () => {
    const f = await fixture(); const check = inspectManual(await f.ports.context(false)); f.attach();
    await runManualFingerprint(f.ports, f.host, check.turnId, 60000);
    expect(f.sends()).toBe(0); expect(f.ports.service.score).not.toHaveBeenCalled();
  });
  it('sends nothing when cancelled after confirmation', async () => {
    const f = await fixture(); const check = inspectManual(await f.ports.context(false)); f.cancel();
    expect((await runManualFingerprint(f.ports, f.host, check.turnId, 60000)).kind).toBe('pending'); expect(f.sends()).toBe(0);
  });
});


describe('completed HTML artifact without assistant text', () => {
  it('passes real bridge preflight and sends exactly three fresh fingerprint challenges', async () => {
    const f = await fixture('complete');
    const context = await f.ports.context(false);
    expect(context.page).toMatchObject({ response: true, completionConfirmed: true, generating: false, failed: false });
    const check = inspectManual(context);
    const result = await runManualFingerprint(f.ports, f.host, check.turnId, 60000);
    expect(result).toMatchObject({ kind: 'done', model: 'Example（指纹推测）' });
    expect(f.sends()).toBe(3); expect(f.ports.service.score).toHaveBeenCalledOnce();
  });
  it('never exposes tool code/preview as answer text or diagnostic data', async () => {
    const f = await fixture('complete'); const c = await f.ports.context(false);
    expect(await f.ports.page.readAnswer(c.prompt, route, c.page.responseSignature!)).toEqual({ text: '', oversize: false });
    expect(JSON.stringify(f.window.__arenaFingerprintNetwork.diagnostics())).not.toContain('PRIVATE_ARTIFACT');
    expect(f.sends()).toBe(0);
  });
  it.each(['pending', 'failed', 'missing-completion'] as const)('still rejects artifact with %s state', async state => {
    const f = await fixture(state);
    const c = await f.ports.context(false);
    expect(() => inspectManual(c)).toThrow('请等待当前回答完成');
    expect(f.sends()).toBe(0); expect(f.ports.service.score).not.toHaveBeenCalled();
  });
});
