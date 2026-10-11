// Standalone asset preparation. Reads only files inside this plugin repository.
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'public', 'injected');
const data = join(root, 'public', 'fingerprint');
const manifest = JSON.parse(readFileSync(join(data, 'manifest.json'), 'utf8'));
const allowed = new Set(['shared_detector.json', 'model_catalog.json', 'MIT-LICENSE.txt', 'UPSTREAM.md', '../tests/fixtures/shared_detector_golden.json']);
for (const name of allowed) {
  const expected = manifest.files[name];
  const file = name.startsWith('../tests/') ? join(root, name.slice(3)) : join(data, name);
  if (typeof expected !== 'string' || !existsSync(file) || createHash('sha256').update(readFileSync(file)).digest('hex') !== expected) {
    throw new Error(`[assets] Frozen asset missing or changed: ${name}`);
  }
}
for (const name of ['arena-model-probe.js', 'page_bridge.js', 'model_rename.js', 'pelican_send.js', 'arena-rpc.js', 'registration-form.js', 'captcha-bridge.js']) {
  if (!existsSync(join(target, name))) throw new Error(`[assets] Missing injected asset: ${name}`);
}
for (const size of [16, 32, 48, 64, 96, 128]) {
  if (!existsSync(join(root, 'public', 'icon', `${size}.png`))) throw new Error(`[assets] Missing icon: ${size}`);
}
console.log('[assets] Standalone assets and pinned fingerprints verified');

// Derive the pure classifier from the bundled probe without adding a stream reader. Fail closed on upstream changes.
const probeCode = readFileSync(join(target, 'arena-model-probe.js'), 'utf8');
const classifierStart = probeCode.indexOf('function classifyStreamFingerprint(');
const classifierEnd = probeCode.indexOf('function extractStreamFingerprint(', classifierStart);
if (classifierStart < 0 || classifierEnd < classifierStart) throw new Error('Shared tool classifier source missing');
const familyAsset = `// Generated from the shared probe by sync-injected.mjs.\n(() => {\nif (location.hostname !== 'arena.ai') return;\n${probeCode.slice(classifierStart, classifierEnd)}\nwindow.__arenaToolFamily = { classify: classifyStreamFingerprint };\n})();\n`;
const { writeFileSync } = await import('node:fs');
writeFileSync(join(target, 'tool-family.js'), familyAsset);
