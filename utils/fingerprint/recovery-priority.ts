import type { FingerprintResult } from './result';
/** Only a concrete fingerprint result suppresses the read-only vendor fallback. */
export async function readFamilyUnlessFingerprint<T>(result: FingerprintResult | null, active: () => boolean, read: () => Promise<T | null>): Promise<T | null> {
  if (!active() || (result?.kind === 'done' && result.model.endsWith('（指纹推测）'))) return null;
  const family = await read();
  return active() ? family : null;
}
