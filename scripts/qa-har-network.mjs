// Offline private HAR replay. Input remains local; output is metrics only.
// Usage: node scripts/qa-har-network.mjs arena.ai-2.har
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const file = process.argv[2];
const recordsOnly = process.argv.includes('--records-only');
let seeded = false;
if (!file) throw new Error('HAR path required');
const entries = JSON.parse(fs.readFileSync(file, 'utf8')).log.entries;
const decode = e => e.response.content.encoding === 'base64' ? Buffer.from(e.response.content.text || '', 'base64').toString('utf8') : e.response.content.text || '';
const snapshots = entries.filter(e => /^\/api\/chat\/[0-9a-f-]{36}$/i.test(new URL(e.request.url).pathname) && e.response.status === 200);
assert(snapshots.length, 'No chat snapshots');
const first = JSON.parse(decode(snapshots[0]));
const location = new URL(`https://arena.ai/work/${first.id}`);
let response;
let calls = 0;
const window = { fetch: async () => { calls++; return response; } };
vm.runInNewContext(fs.readFileSync(new URL('../public/injected/tool-family.js', import.meta.url), 'utf8'), { window, location });
vm.runInNewContext(fs.readFileSync(new URL('../public/injected/fingerprint-network.js', import.meta.url), 'utf8'), { window, location, URL, TextEncoder, TextDecoder, Date, setTimeout, clearTimeout });
let replayed = 0;
for (const e of entries) {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || !(/^\/api\/chat\/[0-9a-f-]{36}$/i.test(url.pathname) || /^\/ai-proxy\/realtime\/v1\/sessions\/[0-9a-f-]{36}\/(?:out(?:\/records)?|in\/append)$/i.test(url.pathname))) continue;
  if (e.response.status < 200 || e.response.status > 599) continue;
  const isSnapshot = /^\/api\/chat\/[0-9a-f-]{36}$/i.test(url.pathname);
  if (recordsOnly && isSnapshot && seeded) continue;
  if (isSnapshot) seeded = true;
  const body = decode(e);
  response = new Response([204, 205, 304].includes(e.response.status) ? null : body, { status: e.response.status, headers: { 'content-type': e.response.content.mimeType || 'application/octet-stream' } });
  await window.fetch(e.request.url, { method: e.request.method, ...(e.request.postData?.text ? { body: e.request.postData.text } : {}) });
  for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve));
  replayed++;
}
const last = JSON.parse(decode(snapshots.at(-1)));
const user = last.messages.filter(m => m.role === 'user').at(-1);
const assistant = last.messages.filter(m => m.role === 'assistant').at(-1);
const expected = assistant.parts.filter(p => p.type === 'text').map(p => p.text).join('');
const current = window.__arenaFingerprintNetwork.current();
assert(current && current.input === user.id, 'Wrong input selected');
assert(current.text === expected, 'Wrong answer reconstructed');
assert.equal(current.complete, true, 'Answer not complete');
assert.equal(calls, replayed, 'Adapter initiated an extra request');
console.log(JSON.stringify({ passed: true, mode: recordsOnly ? 'records-only' : 'all', replayed, answerChars: current.text.length, matchedLastInput: true, matchedLastAnswer: true, completed: current.complete, extraRequests: calls - replayed, network: window.__arenaFingerprintNetwork.diagnostics() }));


if (process.argv.includes('--check-artifact')) {
  assert.equal(current.text, '', 'Fixture must contain a textless final answer');
  assert.equal(current.failed, false);
  assert.equal(!!current.text || current.oversize, false, 'Old text gate must reject this fixture');
  window.__arenaCompanion = { read: () => ({ url: location.href, main: true, editor: true, generating: false, activity: false, draft: '', blocker: null }) };
  vm.runInNewContext(fs.readFileSync(new URL('../public/injected/fingerprint-bridge.js', import.meta.url), 'utf8'), {
    window, location, URL, TextEncoder, document: { querySelectorAll: () => [] }, getComputedStyle: () => ({ visibility: 'visible' }),
  });
  const page = window.__arenaFingerprintBridge.read(current.prompt);
  assert.equal(page.promptConfirmed, true); assert.equal(page.response, true); assert.equal(page.completionConfirmed, true);
  assert.equal(page.generating, false); assert.equal(page.failed, false); assert(page.responseSignature);
  assert.deepEqual(JSON.parse(JSON.stringify(window.__arenaFingerprintBridge.answer(current.prompt, location.origin + location.pathname, current.signature))), { text: '', oversize: false });
  assert.equal(calls, replayed);
  console.log(JSON.stringify({ artifactBridgePassed: true, oldTextGateRejected: true, completedAnchorAccepted: true, sampleTextChars: 0, extraRequests: 0, domState: 'mocked-idle' }));
}


if (process.argv.includes('--check-family')) {
  assert.equal(current.family, 'DeepSeek', 'Historical sample must classify from actual tool IDs');
  const handlers = {}, replies = [];
  window.addEventListener = (name, fn) => { handlers[name] = fn; };
  window.postMessage = data => replies.push(data);
  window.__arenaCompanion = { read: () => ({ url: location.href, main: true, editor: true, generating: false, activity: false, draft: '', blocker: null }) };
  const context = { window, location, URL, TextEncoder, document: { querySelectorAll: () => [] }, getComputedStyle: () => ({ visibility: 'visible' }) };
  for (const file of ['fingerprint-bridge.js', 'arena-rpc.js']) vm.runInNewContext(fs.readFileSync(new URL('../public/injected/' + file, import.meta.url), 'utf8'), context);
  await handlers.message({ source: window, data: { channel: 'arena-vxt:req', id: 'safe-test', method: 'historicalToolFamily', args: [] } });
  assert.equal(replies[0]?.result?.family, 'DeepSeek');
  assert.equal(calls, replayed);
  console.log(JSON.stringify({ historyFamilyPassed: true, family: current.family, idleRpcPassed: true, extraRequests: 0, domState: 'mocked-idle' }));
}
