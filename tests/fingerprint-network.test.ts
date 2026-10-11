import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const code = readFileSync(new URL('../public/injected/fingerprint-network.js', import.meta.url), 'utf8');
const CHAT = '0f8fad5b-d9cb-469f-a165-70867728950e', SESSION = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const ROOT = 'https://arena.ai';
const api = `/api/chat/${CHAT}`;
const stream = `/ai-proxy/realtime/v1/sessions/${SESSION}/out`;
const incoming = `/ai-proxy/realtime/v1/sessions/${SESSION}/in/append`;
function fixture() {
  const location = { href: `${ROOT}/work/${CHAT}`, pathname: `/work/${CHAT}`, hostname: 'arena.ai', origin: ROOT };
  let response = new Response('{}', { headers: { 'content-type': 'application/json' } });
  const fetch = vi.fn(async () => response);
  const window: any = { fetch };
  runInNewContext(readFileSync(new URL('../public/injected/tool-family.js', import.meta.url), 'utf8'), { window, location });
  runInNewContext(code, { window, location, URL, TextEncoder, TextDecoder, Date, setTimeout, clearTimeout, console });
  const flush = async () => { for (let i = 0; i < 30; i++) await new Promise<void>(resolve => setImmediate(resolve)); };
  const get = async (path: string, data: unknown, sse = false) => {
    response = new Response(sse ? String(data) : JSON.stringify(data), { headers: { 'content-type': sse ? 'text/event-stream' : 'application/json' } });
    await window.fetch(path.startsWith('https://') ? path : ROOT + path); await flush();
  };
  const post = async (id = 'u1', prompt = 'challenge', status = 200) => {
    response = new Response('{}', { status });
    await window.fetch(ROOT + incoming, { method: 'POST', body: JSON.stringify({ kind: 'message', payload: { chatId: CHAT, messageId: id, message: { id, role: 'user', parts: [{ type: 'text', text: prompt }] } } }) }); await flush();
  };
  const baseline = (tool = false) => ({ id: CHAT, triggerAddress: SESSION, messages: [
    { id: 'u0', role: 'user', parts: tool ? [{ type: 'data-tool-results', data: [{ output: 'PRIVATE_TOOL' }] }] : [{ type: 'text', text: 'old question' }] },
    { id: 'a0', role: 'assistant', parts: [{ type: 'text', text: 'old answer', state: 'done' }], metadata: { pending: false, timing: { completedAt: 1 } } },
  ] });
  const rows = (input = 'u1', answer = 'a1', offset = 10, text = 'new answer') => [
    { seqNum: offset, data: { type: 'data-agent-dispatch', data: { inputId: input, attemptId: 'attempt' } } },
    { seqNum: offset + 1, data: { type: 'start', messageId: answer } },
    { seqNum: offset + 2, data: { type: 'text-start', id: '0' } },
    { seqNum: offset + 3, data: { type: 'reasoning-delta', id: 'r', delta: 'PRIVATE_REASONING' } },
    { seqNum: offset + 4, data: { type: 'text-delta', id: '0', delta: text } },
    { seqNum: offset + 5, data: { type: 'text-end', id: '0' } },
    { seqNum: offset + 6, data: { type: 'finish', messageMetadata: { nodeId: answer, pending: false, timing: { completedAt: 2 } } } },
  ];
  return { respond: (r: Response) => { response = r; }, network: window.__arenaFingerprintNetwork, window, location, fetch, flush, get, post, baseline, rows };
}
describe('passive network fingerprint adapter', () => {
  it('never initiates network requests and only exposes safe diagnostics', () => {
    const f = fixture(); expect(f.fetch).not.toHaveBeenCalled();
    expect(f.network.current()).toBeNull();
    expect(JSON.stringify(f.network.diagnostics())).not.toContain(CHAT);
  });
  it('accepts historical tool results as an input anchor without requiring their text', async () => {
    const f = fixture(); await f.get(api, f.baseline(true));
    expect(f.network.current()).toMatchObject({ complete: true, prompt: '@arena-input:u0', text: 'old answer', source: 'chat-snapshot' });
    expect(JSON.stringify(f.network.diagnostics())).not.toContain('PRIVATE');
  });
  it('binds a new request to dispatch, assistant start and finish, ignoring reasoning', async () => {
    const f = fixture(); await f.get(api, f.baseline());
    f.network.arm('challenge', f.network.current().signature);
    expect(f.network.current().complete).toBe(false);
    await f.post(); expect(f.network.current().pending).toBe(true);
    await f.get(stream + '/records', { records: f.rows() });
    expect(f.network.current()).toMatchObject({ prompt: 'challenge', text: 'new answer', complete: true, source: 'out-records' });
  });
  it('deduplicates by sequence rather than record id and sorts replay records', async () => {
    const f = fixture(); await f.get(api, f.baseline()); await f.post();
    const rows = f.rows().map(r => ({ ...r, id: 'not-unique' })).reverse();
    await f.get(stream + '/records', { records: rows });
    await f.get(stream + '/records', { records: rows });
    expect(f.network.current().text).toBe('new answer');
    expect(f.network.current().complete).toBe(true);
  });
  it('does not mistake an old identical prompt for the new answer', async () => {
    const f = fixture(); const base = f.baseline(); base.messages[0]!.parts = [{ type: 'text', text: 'challenge' }];
    await f.get(api, base); await f.post(); await f.get(stream + '/records', { records: f.rows('u0', 'a0') });
    expect(f.network.current().complete).toBe(false); expect(f.network.current().text).toBe('');
  });
  it('marks an intervening or duplicate submission as a conflict', async () => {
    const f = fixture(); await f.get(api, f.baseline()); f.network.arm('challenge', f.network.current().signature);
    await f.post('u1'); await f.post('u2');
    expect(f.network.current()).toMatchObject({ failed: true, conflict: true, complete: false });
  });
  it('ignores stale snapshots during a pending request', async () => {
    const f = fixture(); await f.get(api, f.baseline()); await f.post(); await f.get(api, f.baseline());
    expect(f.network.current()).toMatchObject({ prompt: 'challenge', complete: false });
  });
  it('accepts a final snapshot fallback only for the captured input ID', async () => {
    const f = fixture(); await f.get(api, f.baseline()); await f.post();
    const base = f.baseline(); base.messages[0]!.id = 'u1'; base.messages[1]!.id = 'a1';
    await f.get(api, base);
    expect(f.network.current().complete).toBe(true);
  });
  it('does not clone or read SSE: the shared probe is its sole observer', async () => {
    const f = fixture(); await f.get(api, f.baseline()); await f.post();
    const response = new Response('data: {"records":[]}\n\n', { headers: { 'content-type': 'text/event-stream' } });
    const clone = vi.spyOn(response, 'clone');
    f.respond(response); await f.window.fetch(ROOT + stream); await f.flush();
    expect(clone).not.toHaveBeenCalled(); expect(response.bodyUsed).toBe(false);
    expect(f.network.diagnostics()).toMatchObject({ sseReader: false, activeReaders: 0 });
    await f.get(stream + '/records', { records: f.rows() });
    expect(f.network.current()).toMatchObject({ complete: true, text: 'new answer' });
  });
  it('does not accept finish-only interrupted answers as successful output', async () => {
    const f = fixture(); await f.get(api, f.baseline()); await f.post();
    await f.get(stream + '/records', { records: [{ seqNum: 99, data: { type: 'finish', messageMetadata: { nodeId: 'a1', pending: false, feedback: { interruption: 'yes' }, timing: { completedAt: 2 } } } }] });
    expect(f.network.current().complete).toBe(false);
  });
  it('rejects an interrupted final snapshot', async () => {
    const f = fixture(), base: any = f.baseline(); base.messages[1].metadata.feedback = { interruption: 'yes' };
    await f.get(api, base); expect(f.network.current()).toMatchObject({ failed: true, complete: false });
  });
  it('does not reuse an old session after navigation', async () => {
    const f = fixture(); await f.get(api, f.baseline()); f.location.pathname = '/work/11111111-1111-1111-1111-111111111111';
    expect(f.network.current()).toBeNull();
  });
  it('does not intercept foreign origins and rejects failed send acknowledgements', async () => {
    const f = fixture(); await f.get('https://other.invalid' + api, f.baseline()); expect(f.network.current()).toBeNull();
    await f.get(api, f.baseline()); await f.post('u1', 'challenge', 500);
    expect(f.network.current()).toMatchObject({ failed: true, complete: false });
  });
  it('bounds answer size and never retains reasoning in the answer', async () => {
    const f = fixture(); await f.get(api, f.baseline()); await f.post(); await f.get(stream + '/records', { records: f.rows('u1', 'a1', 10, '字'.repeat(24000)) });
    expect(f.network.current().oversize).toBe(true);
    expect(f.network.current().text).not.toContain('PRIVATE_REASONING');
  });
  it('captures Request-object submissions without changing their body', async () => {
    const f = fixture(); await f.get(api, f.baseline());
    f.network.arm('challenge', f.network.current().signature);
    const body = JSON.stringify({ payload: { chatId: CHAT, messageId: 'u1', message: { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'challenge' }] } } });
    const request = new Request(ROOT + incoming, { method: 'POST', body });
    await f.window.fetch(request); await f.flush();
    expect(await request.text()).toBe(body);
    await f.get(stream + '/records', { records: f.rows() });
    expect(f.network.current()).toMatchObject({ complete: true, inputBound: true, text: 'new answer' });
  });
  it('does not let a slow old snapshot overwrite a newer snapshot', async () => {
    const f = fixture(); let finish!: (r: Response) => void;
    f.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    const pending = f.window.fetch(ROOT + api);
    const newer = f.baseline(); newer.messages[1]!.parts = [{ type: 'text', text: 'newer answer', state: 'done' }];
    await f.get(api, newer);
    finish(new Response(JSON.stringify(f.baseline()), { headers: { 'content-type': 'application/json' } })); await pending; await f.flush();
    expect(f.network.current().text).toBe('newer answer');
  });
  it('refuses streaming content on a records URL before cloning it', async () => {
    const f = fixture(); await f.get(api, f.baseline());
    const response = new Response('never inspected', { headers: { 'content-type': 'text/event-stream' } });
    const clone = vi.spyOn(response, 'clone'); f.respond(response);
    await f.window.fetch(ROOT + stream + '/records'); await f.flush();
    expect(clone).not.toHaveBeenCalled(); expect(response.bodyUsed).toBe(false);
  });
  it('does not replace the latest answer with an older-history pagination response', async () => {
    const f = fixture(); await f.get(api, f.baseline());
    const old = f.baseline(); old.messages[1]!.parts = [{ type: 'text', text: 'older paginated answer', state: 'done' }];
    await f.get(api + '?paginated=true&cursor=old-cursor', old);
    expect(f.network.current().text).toBe('old answer');
  });

  it('limits concurrent finite-response clones and releases readers at completion', async () => {
    const f = fixture(); const controllers: ReadableStreamDefaultController[] = [];
    const slow = () => new Response(new ReadableStream({ start(c) { controllers.push(c); } }), { headers: { 'content-type': 'application/json' } });
    for (let i = 0; i < 2; i++) { f.respond(slow()); await f.window.fetch(ROOT + api); await f.flush(); }
    expect(f.network.diagnostics().activeReaders).toBe(2);
    const third = slow(), clone = vi.spyOn(third, 'clone'); f.respond(third);
    await f.window.fetch(ROOT + api); await f.flush();
    expect(clone).not.toHaveBeenCalled();
    for (const c of controllers) c.close(); await f.flush();
    expect(f.network.diagnostics().activeReaders).toBe(0);
  });
  it('times out a stalled JSON clone instead of leaving a persistent background reader', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const f = fixture();
      const response = new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } });
      f.respond(response); await f.window.fetch(ROOT + api); await f.flush();
      expect(f.network.diagnostics().activeReaders).toBe(1);
      await vi.advanceTimersByTimeAsync(5001); await f.flush();
      expect(f.network.diagnostics()).toMatchObject({ activeReaders: 0, lastError: 'RESPONSE_TIMEOUT' });
    } finally { vi.useRealTimers(); }
  });
  it('rejects known oversized JSON responses before cloning', async () => {
    const f = fixture();
    const response = new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(3 * 1024 * 1024) } });
    const clone = vi.spyOn(response, 'clone'); f.respond(response);
    await f.window.fetch(ROOT + api); await f.flush();
    expect(clone).not.toHaveBeenCalled(); expect(f.network.diagnostics().activeReaders).toBe(0);
  });

});
describe('bounded fingerprint history for refresh recovery', () => {
  const complete = { pending: false, timing: { completedAt: 1 } };
  const pairs = () => Array.from({ length: 4 }, (_, i) => [
    { id: 'u' + i, role: 'user', parts: [{ type: 'text', text: 'prompt-' + i }] },
    { id: 'a' + i, role: 'assistant', parts: [{ type: 'text', text: 'answer-' + i, state: 'done' }], metadata: complete },
  ]).flat();
  it('keeps exactly the latest three ID-linked pairs without an extra request', async () => {
    const f = fixture(); await f.get(api, { id: CHAT, triggerAddress: SESSION, messages: pairs() });
    expect(f.network.history().pairs.map((p: any) => p.input)).toEqual(['u1', 'u2', 'u3']);
    expect(f.network.history().pairs.map((p: any) => p.text)).toEqual(['answer-1', 'answer-2', 'answer-3']);
    expect(f.network.history().complete).toBe(true); expect(f.fetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(f.network.diagnostics())).not.toContain('answer-');
  });
  it('does not expose another route or a stale history during a new submission', async () => {
    const f = fixture(); await f.get(api, { id: CHAT, triggerAddress: SESSION, messages: pairs() });
    await f.post('u4'); expect(f.network.history()).toBeNull();
    f.location.pathname = '/work/7c9e6679-7425-40de-944b-e07fc1f90ae7'; expect(f.network.history()).toBeNull();
  });
  it('fills the pending last historical answer using already observed bound records', async () => {
    const f = fixture(), messages = pairs(); (messages[7] as any).metadata = { pending: true };
    await f.get(api, { id: CHAT, triggerAddress: SESSION, messages });
    expect(f.network.history().complete).toBe(false);
    await f.get(stream + '/records', { records: f.rows('u3', 'a3', 10, 'finished answer') });
    expect(f.network.history()).toMatchObject({ complete: true, pairs: [{ input: 'u1' }, { input: 'u2' }, { input: 'u3', complete: true, text: 'finished answer' }] });
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });
  it('never recovers a duplicated input ID', async () => {
    const f = fixture(), messages = pairs(); messages[4]!.id = 'u1';
    await f.get(api, { id: CHAT, triggerAddress: SESSION, messages }); expect(f.network.history()).toBeNull();
  });
});


describe('refresh-time tool family from completed snapshot', () => {
  const snapshot = (toolCallId: string, extra: object = {}) => ({ id: CHAT, triggerAddress: SESSION, messages: [
    { id: 'user', role: 'user', parts: [{ type: 'text', text: 'initial' }] },
    { id: 'answer', role: 'assistant', parts: [{ type: 'tool-read_file', toolCallId, state: 'output-available', input: { secret: 'PRIVATE_TOOL_INPUT' }, output: { secret: 'PRIVATE_TOOL_OUTPUT' } }], metadata: { pending: false, timing: { completedAt: 1 }, ...extra } },
  ] });
  it('recovers DeepSeek from the actual tool-ID pattern with zero extra requests', async () => {
    const f = fixture(); await f.get(api, snapshot('call_00_' + 'Z'.repeat(24)));
    expect(f.network.current()).toMatchObject({ complete: true, family: 'DeepSeek', text: '' });
    expect(f.fetch).toHaveBeenCalledOnce(); expect(JSON.stringify(f.network.current())).not.toContain('PRIVATE_TOOL');
  });
  it('does not use tool names, arbitrary outputs or incomplete turns as finished identity evidence', async () => {
    const f = fixture(); await f.get(api, snapshot('unknown'));
    expect(f.network.current().family).toBeNull();
    await f.get(api, snapshot('call_00_' + 'Z'.repeat(24), { pending: true }));
    expect(f.network.current().complete).toBe(false);
    await f.get(api, snapshot('call_00_' + 'Z'.repeat(24), { error: 'failed' }));
    expect(f.network.current().failed).toBe(true);
  });
  it('does not carry the preceding answer family to a new input or route', async () => {
    const f = fixture(); await f.get(api, snapshot('call_00_' + 'Z'.repeat(24)));
    await f.post('new-input'); expect(f.network.current().family).toBeNull();
    f.location.pathname = '/work/7c9e6679-7425-40de-944b-e07fc1f90ae7'; expect(f.network.current()).toBeNull();
  });
});
