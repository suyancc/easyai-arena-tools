import { FingerprintFault, faultCode, safeFault } from './errors';
import { browser } from 'wxt/browser';
import { route } from '../arena-route';
import type { Reply } from '../types';
import type { FingerprintService, Outcome } from './types';
import type { ServiceRequest } from './service';
export function createFingerprintClient(): FingerprintService {
  async function request<T>(partial: Pick<ServiceRequest, 'type' | 'answers' | 'target'>): Promise<T> {
    const expected = route(location.href);
    if (!expected) throw new FingerprintFault('FP_ROUTE');
    const requestId = crypto.randomUUID();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        (browser.runtime.sendMessage({ ...partial, route: expected, requestId }) as Promise<Reply<T> & { requestId?: string; code?: string }>).catch(() => { throw new FingerprintFault('FP_CHANNEL'); }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new FingerprintFault('FP_TIMEOUT')), 30_000); }),
      ]);
      if (route(location.href) !== expected) throw new FingerprintFault('FP_ROUTE');
      if (!response?.ok) throw new FingerprintFault(response?.code ? faultCode(response.code) : 'FP_REPLY');
      if (response.requestId !== requestId) throw new FingerprintFault('FP_REPLY');
      return response.data;
    } catch (error) { throw safeFault(error, 'FP_CHANNEL'); }
    finally { clearTimeout(timer); }
  }
  return {
    prepare: async () => { await request<null>({ type: 'fingerprint:prepare' }); },
    score: async (answers, target) => {
      const result = await request<Outcome>({ type: 'fingerprint:score', answers, target });
      console.debug('[arena-fingerprint-score]', JSON.stringify({ kind: result.kind, ...result.diagnostics }));
      return result;
    },
  };
}
