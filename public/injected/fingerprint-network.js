// Plugin-only passive network adapter. No requests, credentials, storage or logging.
// Installed before the shared probe so its own read-only recovery requests are seen too.
(() => {
  if (location.hostname !== 'arena.ai' || window.__arenaFingerprintNetwork) return;
  const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const chatPattern = new RegExp(`^/api/chat/(${UUID})$`, 'i');
  const sessionPattern = new RegExp(`^/ai-proxy/realtime/v1/sessions/(${UUID})/(out(?:/records)?|in/append)$`, 'i');
  const pageId = () => location.pathname.match(new RegExp(`^/(?:work|agent)/(${UUID})/?$`, 'i'))?.[1]?.toLowerCase();
  const norm = s => String(s || '').normalize('NFC').replace(/\s+/gu, ' ').trim();
  const id = s => typeof s === 'string' && s.length > 0 && s.length <= 128 ? s : null;
  const MAX_TEXT = 65536, MAX_RECORDS = 4096;
  const chats = new Map(), sessions = new Map();
  let serial = 0, lastError = null, readers = 0;
  const limited = (map, key, create) => {
    if (!map.has(key)) { if (map.size >= 4) map.delete(map.keys().next().value); map.set(key, create()); }
    return map.get(key);
  };
  const chat = key => limited(chats, key, () => ({ session: null, snapshot: null, history: [], revision: 0, request: null, guard: null }));
  const session = key => limited(sessions, key, () => ({ records: new Map(), bytes: 0, overflow: false, revision: 0, built: -1, runs: [] }));
  const textParts = m => (m.parts || []).filter(p => p?.type === 'text' && typeof p.text === 'string').map(p => p.text).join('');
  const safeMessage = m => {
    if (!m || !id(m.id) || !['user', 'assistant'].includes(m.role) || !Array.isArray(m.parts)) return null;
    const text = textParts(m), meta = m.metadata || {};
    // Snapshot-only family recovery: retain only the classified family, never tool arguments.
    // Missing auxiliary IDs stay missing (not invented to force a Gemini/GPT match).
    const fingerprint = { toolIds: m.parts.filter(p => typeof p.toolCallId === 'string').map(p => p.toolCallId).slice(0, 128),
      textIds: m.parts.filter(p => p.type === 'text' && typeof p.id === 'string').map(p => p.id).slice(0, 128),
      reasoningIds: m.parts.filter(p => p.type === 'reasoning' && typeof p.id === 'string').map(p => p.id).slice(0, 128),
      reasoningCount: m.parts.filter(p => p.type === 'reasoning').length };
    const toolFamily = m.role === 'assistant' ? window.__arenaToolFamily?.classify(fingerprint)?.family || null : null;
    return { id: m.id, role: m.role, toolFamily, text: text.slice(0, MAX_TEXT), oversize: new TextEncoder().encode(text).length > MAX_TEXT,
      complete: meta.pending === false && !!meta.timing?.completedAt && m.parts.filter(p => p.type === 'text').every(p => !p.state || p.state === 'done'),
      failed: !!meta.error || !!meta.feedback?.interruption };
  };
  const snapshot = (key, data, revision) => {
    if (!data || String(data.id).toLowerCase() !== key || !id(data.triggerAddress) || !Array.isArray(data.messages)) return;
    const c = chat(key); if (revision < c.revision) return;
    // Keep at most three input/answer pairs for read-only fingerprint recovery, not full history.
    const messages = data.messages.slice(-100).map(safeMessage).filter(Boolean);
    const userIndex = messages.findLastIndex(m => m.role === 'user');
    if (userIndex < 0) return;
    const user = messages[userIndex], answer = messages.slice(userIndex + 1).filter(m => m.role === 'assistant').at(-1) || null;
    c.session = data.triggerAddress.toLowerCase(); c.revision = revision;
    c.snapshot = { user, answer };
    const indices = messages.map((m, i) => m.role === 'user' ? i : -1).filter(i => i >= 0).slice(-3);
    c.history = indices.map((start, i) => ({ user: messages[start],
      answer: messages.slice(start + 1, indices[i + 1] ?? messages.length).filter(m => m.role === 'assistant').at(-1) || null }));
    if (c.guard?.input && c.request && revision > c.request.revision && user.id !== c.guard.input && user.id !== c.guard.previousInput) c.guard.conflict = true;
  };
  const append = (key, payload, revision) => {
    const p = payload?.payload, m = p?.message;
    if (!p || !id(p.chatId) || !m || m.role !== 'user' || !id(m.id) || p.messageId !== m.id || !Array.isArray(m.parts)) return null;
    const c = chat(p.chatId.toLowerCase());
    if (c.session && c.session !== key) { if (c.guard) c.guard.conflict = true; return null; }
    c.session = key;
    const prompt = textParts(m);
    if (c.guard) {
      if ((c.guard.input && c.guard.input !== m.id) || norm(prompt) !== norm(c.guard.prompt)) { c.guard.conflict = true; lastError = 'UNEXPECTED_SUBMISSION'; }
      else c.guard.input = m.id;
    }
    c.request = { id: m.id, text: prompt.slice(0, MAX_TEXT), oversize: prompt.length > MAX_TEXT, revision, failed: false };
    return { chat: c, id: m.id };
  };
  const records = (key, rows) => {
    if (!Array.isArray(rows)) return;
    const s = session(key);
    for (const row of rows) {
      const seq = row?.seqNum ?? row?.seq_num;
      if (!Number.isSafeInteger(seq) || seq < 0 || s.records.has(seq) || s.overflow) continue;
      let d = row.data ?? row.body;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch { continue; } }
      if (!d || typeof d !== 'object') continue;
      let event;
      switch (d.type) {
        case 'data-agent-dispatch': event = { type: d.type, input: id(d.data?.inputId), attempt: id(d.data?.attemptId) }; break;
        case 'start': event = { type: d.type, message: id(d.messageId) }; break;
        case 'text-start': case 'text-end': event = { type: d.type, part: id(d.id) }; break;
        case 'text-delta': if (typeof d.delta !== 'string') continue; event = { type: d.type, part: id(d.id), text: d.delta.slice(0, MAX_TEXT), oversize: new TextEncoder().encode(d.delta).length > MAX_TEXT }; break;
        case 'finish': event = { type: d.type, message: id(d.messageMetadata?.nodeId), complete: d.messageMetadata?.pending === false && !!d.messageMetadata?.timing?.completedAt, failed: !!d.messageMetadata?.error || !!d.messageMetadata?.feedback?.interruption }; break;
        case 'error': case 'abort': event = { type: d.type }; break;
        default: continue; // Never retain reasoning, tool arguments, headers or tokens.
      }
      s.bytes += event.text?.length || 0;
      if (s.records.size >= MAX_RECORDS || s.bytes > 2 * 1024 * 1024) { s.overflow = true; lastError = 'RECORD_LIMIT'; continue; }
      s.records.set(seq, event); s.revision++;
    }
  };
  const rebuild = s => {
    if (s.built === s.revision) return s.runs;
    const runs = []; let input = null, attempt = null, run = null;
    for (const [seq, e] of [...s.records].sort((a, b) => a[0] - b[0])) {
      if (e.type === 'data-agent-dispatch') { input = e.input; attempt = e.attempt; run = null; }
      else if (e.type === 'start') {
        run = input && e.message ? { input, attempt, id: e.message, text: '', parts: new Set(), complete: false, failed: false, oversize: false, seq } : null;
        if (run) runs.push(run);
      } else if (run) {
        if (e.type === 'text-start' && e.part) run.parts.add(e.part);
        if (e.type === 'text-end') run.parts.delete(e.part);
        if (e.type === 'text-delta') {
          run.oversize ||= e.oversize || new TextEncoder().encode(run.text + e.text).length > MAX_TEXT;
          if (!run.oversize) run.text += e.text;
        }
        if (e.type === 'error' || e.type === 'abort') run.failed = true;
        if (e.type === 'finish') {
          // A finish-only interrupted answer must not terminate the previous run.
          if (e.message === run.id) { run.complete = e.complete && run.parts.size === 0; run.failed ||= e.failed; }
          run = null; input = null;
        }
      }
    }
    s.runs = runs; s.built = s.revision; return runs;
  };
  const digest = text => { let n = 2166136261; for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619); return (n >>> 0).toString(16); };
  const current = () => {
    const c = chats.get(pageId()); if (!c?.snapshot) return null;
    const request = c.request;
    const user = request ? { ...request, role: 'user' } : c.snapshot.user;
    const s = sessions.get(c.session);
    const runs = s ? rebuild(s).filter(r => r.input === user.id) : [];
    let answer = runs.at(-1) || null;
    const fromSnapshot = c.snapshot.user.id === user.id ? c.snapshot.answer : null;
    // A validated final snapshot can fill a missing stream, never replace another input.
    if (fromSnapshot && (!answer || (fromSnapshot.id === answer.id && fromSnapshot.complete))) answer = fromSnapshot;
    if (c.guard && !c.guard.input && Date.now() - c.guard.at > 60000) { c.guard.conflict = true; lastError = 'SEND_NOT_OBSERVED'; }
    const conflict = !!c.guard?.conflict || !!s?.overflow;
    const waitingRequest = !!c.guard && !c.guard.input;
    const failed = conflict || !!request?.failed || !!answer?.failed;
    const complete = !waitingRequest && !failed && !!answer?.complete;
    return { prompt: user.text || `@arena-input:${user.id}`, input: user.id,
      family: answer?.toolFamily || null, text: answer?.text || '', oversize: !!answer?.oversize, failed, complete,
      pending: waitingRequest || (!complete && !failed),
      signature: answer ? `net:${user.id}:${answer.id}:${digest(answer.text || '')}:${complete ? 1 : 0}` : null,
      inputBound: !!c.guard?.input && c.guard.input === request?.id && !!answer && !conflict,
      source: answer === fromSnapshot ? 'chat-snapshot' : 'out-records', conflict };
  };
  const arm = (prompt, signature) => {
    const v = current(), c = chats.get(pageId());
    if (!v?.complete || v.signature !== signature || !c || c.guard?.conflict) throw new Error('发送前网络回合状态已变化');
    c.guard = { prompt, previousInput: v.input, input: null, conflict: false, at: Date.now() };
  };
  const disarm = () => { for (const c of chats.values()) c.guard = null; };
  const diagnostics = () => { const c = chats.get(pageId()), s = sessions.get(c?.session), v = current(); return {
    revision: 'network-v3-history-finite-only', sseReader: false, activeReaders: readers, snapshotReady: !!c?.snapshot, sessionBound: !!c?.session,
    requestObserved: !!c?.request, awaitingRequest: !!c?.guard && !c.guard.input,
    recordCount: s?.records.size || 0, completed: !!v?.complete, failed: !!v?.failed,
    conflict: !!v?.conflict, source: v?.source || null, lastError,
  }; };
  const history = () => {
    const c = chats.get(pageId()), v = current();
    // Do not recover from stale pages, pending new submissions, or another chat.
    if (!c?.snapshot || !v || v.conflict || c.snapshot.user.id !== v.input) return null;
    const pairs = c.history.map(({ user, answer }, i) => {
      if (i === c.history.length - 1 && v.complete && v.signature) {
        return { input: user.id, answer: v.signature, prompt: user.text, text: v.text,
          complete: true, failed: v.failed, oversize: user.oversize || v.oversize };
      }
      return { input: user.id, answer: answer?.id || null, prompt: user.text, text: answer?.text || '',
        complete: !!answer?.complete, failed: !!answer?.failed, oversize: user.oversize || !!answer?.oversize };
    });
    if (new Set(pairs.map(p => p.input)).size !== pairs.length) return null;
    return { pairs, signature: v.signature, complete: v.complete, failed: v.failed };
  };
  window.__arenaFingerprintNetwork = { current, arm, disarm, diagnostics, history };
  // Only inspect already-issued same-origin requests. Never retain headers/post bodies.
  const original = window.fetch;
  // NEVER clone /out SSE. The shared Rust-origin probe already taps it.
  // Observe only finite JSON bodies, bounded by bytes, elapsed time and concurrency.
  const readBounded = async response => {
    const reader = response.body?.getReader(); if (!reader) return null;
    const decoder = new TextDecoder(); let buffer = '', total = 0, timer;
    const deadline = new Promise(resolve => { timer = setTimeout(() => resolve(null), 5000); });
    const collect = async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) return buffer + decoder.decode();
        total += value.byteLength;
        if (total > 2 * 1024 * 1024) { lastError = 'RESPONSE_LIMIT'; return null; }
        buffer += decoder.decode(value, { stream: true });
      }
    };
    try {
      const text = await Promise.race([collect(), deadline]);
      if (text === null) { lastError ||= 'RESPONSE_TIMEOUT'; void reader.cancel().catch(() => {}); }
      return text;
    } finally {
      clearTimeout(timer);
      // A timed-out read can still be settling; release after cancellation.
      try { reader.releaseLock(); } catch { /* cancellation settles asynchronously */ }
    }
  };
  window.fetch = function(input, init) {
    let url; try { url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href); } catch { return original.apply(this, arguments); }
    const revision = ++serial, method = String(init?.method || input?.method || 'GET').toUpperCase();
    // Older-history pagination must not replace the latest-answer baseline.
    const ch = url.origin === location.origin && !['cursor', 'before', 'after'].some(k => url.searchParams.has(k)) && url.pathname.match(chatPattern);
    const se = url.origin === location.origin && url.pathname.match(sessionPattern);
    let request = null, capture = Promise.resolve();
    if (se && method === 'POST' && se[2] === 'in/append') {
      const failCapture = code => {
        lastError = code;
        for (const c of chats.values()) if (c.session === se[1].toLowerCase() && c.guard) c.guard.conflict = true;
      };
      const consume = text => {
        try {
          if (typeof text !== 'string' || text.length > 1024 * 1024) { failCapture('REQUEST_LIMIT'); return; }
          request = append(se[1].toLowerCase(), JSON.parse(text), revision);
          if (!request) failCapture('REQUEST_SHAPE');
        } catch { failCapture('REQUEST_PARSE'); }
      };
      if (typeof init?.body === 'string') consume(init.body);
      else if ([...chats.values()].some(c => c.session === se[1].toLowerCase() && c.guard) && !init?.body && typeof input?.clone === 'function') {
        try { capture = readBounded(input.clone()).then(consume).catch(() => failCapture('REQUEST_PARSE')); }
        catch { failCapture('REQUEST_PARSE'); }
      } else if (init?.body && typeof init.body.text === 'function' && init.body.size <= 1024 * 1024) {
        capture = init.body.text().then(consume).catch(() => failCapture('REQUEST_PARSE'));
      } else failCapture('UNSUPPORTED_REQUEST_BODY');
    }
    let result;
    try { result = original.apply(this, arguments); } catch (error) { if (request && request.chat.request?.id === request.id) request.chat.request.failed = true; throw error; }
    const finiteRead = method === 'GET' && (ch || se?.[2] === 'out/records');
    if (!request && !finiteRead && !(se && method === 'POST' && se[2] === 'in/append')) return result;
    Promise.resolve(result).then(async response => {
      await capture;
      if (request && (!response.ok) && request.chat.request?.id === request.id) { request.chat.request.failed = true; lastError = 'SEND_HTTP_ERROR'; }
      if (!response.ok || !finiteRead) return;
      const type = response.headers.get('content-type') || '';
      if (!/application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(type)) { lastError = 'NON_JSON_RESPONSE'; return; }
      const size = Number(response.headers.get('content-length') || 0);
      if (size > 2 * 1024 * 1024 || readers >= 2) { lastError = 'RESPONSE_BUDGET'; return; }
      readers++;
      try {
        const text = await readBounded(response.clone());
        if (!text) return;
        if (ch) snapshot(ch[1].toLowerCase(), JSON.parse(text), revision);
        else records(se[1].toLowerCase(), JSON.parse(text).records);
        // Payload-free wakeup for review handling; no additional request/reader.
        if (typeof window.dispatchEvent === 'function' && typeof Event === 'function') window.dispatchEvent(new Event('arena:fingerprint-state'));
      } finally { readers--; }
    }).catch(async () => { await capture; if (request && request.chat.request?.id === request.id) request.chat.request.failed = true; lastError = 'NETWORK_OBSERVE'; });
    return result;
  };
})();
