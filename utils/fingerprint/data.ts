import { FingerprintFault } from './errors';
import type { Catalog, Detector, FeatureBank, FingerprintData, Params } from './types';
export const SOURCE_COMMIT = 'd53d3f5b158249a87a895e4fc7aaa8a940dfd6d6';
export const HASHES = {
  'shared_detector.json': '24cb37ae32bfd70f97b43dad4e71332cfa82aaa8527fbb1fe7dc007ce16f216f',
  'model_catalog.json': '43cdb732d6e63250b9dcca2a15a2becd80eb7ed871ddf93439c9b09583a70203',
};
function requireAsset(ok: unknown): asserts ok { if (!ok) throw new FingerprintFault('FP_DATA_SCHEMA'); }
function vector(v: unknown, size: number, positive = false): asserts v is number[] {
  requireAsset(Array.isArray(v) && v.length === size && v.every(x => typeof x === 'number' && Number.isFinite(x) && (!positive || x > 0)));
}
function matrix(v: unknown, width: number, rows?: number) {
  requireAsset(Array.isArray(v) && (rows === undefined || v.length === rows));
  for (const row of v as unknown[]) vector(row, width);
}
function params(p: Params[]) {
  requireAsset(Array.isArray(p) && p.length === 2);
  [355, 74].forEach((width, i) => { vector(p[i]?.mean, width); vector(p[i]?.scale, width, true); });
}
function bank(b: FeatureBank, width: number, models: number) {
  requireAsset(b);
  vector(b.feature_mean, width); vector(b.feature_scale, width, true);
  matrix(b.nuisance_basis, width); matrix(b.centroids, width, models);
}
export function validateDimensions(detector: Detector, catalog: Catalog): void {
  requireAsset(detector?.schema === 'shared-detector-v1' && detector.bank_built_at === catalog?.built_at);
  requireAsset(Array.isArray(catalog.models) && catalog.models.length > 0);
  const n = catalog.models.length;
  requireAsset(Array.isArray(detector.model_ids) && detector.model_ids.length === n);
  vector(detector.response_counts, n);
  catalog.models.forEach((m, i) => requireAsset(m && typeof m.id === 'string' && typeof m.display_name === 'string' && typeof m.family === 'string' && m.id === detector.model_ids[i] && m.response_count === detector.response_counts[i]));
  const r = detector.ranker;
  requireAsset(r); params(r.head_params); params(r.full_params);
  matrix(r.lda_weights, 429, n); vector(r.lda_bias, n);
  requireAsset(Array.isArray(r.references) && r.references.length === n);
  for (const group of r.references) { requireAsset(group.length > 0); matrix(group, 429); }
  requireAsset(r.bank); bank(r.bank.hellinger, 355, n); bank(r.bank.ordered_blocks, 74, n);
  const environments = r.bank.ordered_blocks.environment_centroids;
  requireAsset(Array.isArray(environments) && environments.length > 0);
  for (const env of environments) matrix(env, 74, n);
}
export async function loadData(read: (name: string) => Promise<ArrayBuffer>): Promise<FingerprintData> {
  const [manifestBytes, detectorBytes, catalogBytes] = await Promise.all(['manifest.json', 'shared_detector.json', 'model_catalog.json'].map(async name => { try { return await read(name); } catch { throw new FingerprintFault('FP_DATA_READ'); } }));
  const decode = (buffer: ArrayBuffer) => { try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)); } catch { throw new FingerprintFault('FP_DATA_JSON'); } };
  const manifest = decode(manifestBytes!);
  requireAsset(manifest.schema === 'arena-model-fingerprint-assets-v1' && manifest.source_commit === SOURCE_COMMIT);
  for (const [name, bytes] of [['shared_detector.json', detectorBytes!], ['model_catalog.json', catalogBytes!]] as const) {
    let digest: ArrayBuffer;
    try { digest = await crypto.subtle.digest('SHA-256', bytes); } catch { throw new FingerprintFault('FP_CRYPTO'); }
    const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
    if (hash !== HASHES[name] || manifest.files?.[name] !== hash) throw new FingerprintFault('FP_DATA_HASH');
  }
  const detector: Detector = decode(detectorBytes!), catalog: Catalog = decode(catalogBytes!);
  validateDimensions(detector, catalog);
  return { detector, catalog };
}
