import { FingerprintFault, safeFault, type FaultCode } from './errors';
/** Background-only service. Explicit dependencies keep it testable without WXT. */
import { route } from '../arena-route';
import { loadData } from './data';
import { scoreThree } from './scorer';
import { FAMILIES, MAX_ANSWER_BYTES, type Answer, type Family, type FingerprintData } from './types';
export interface ServiceRequest { type: 'fingerprint:prepare' | 'fingerprint:score'; requestId: string; route: string; answers?: Answer[]; target?: Family | null }
export interface ServiceSender { id?: string; frameId?: number; url?: string; tab?: { id?: number } }
export function requestError(req: ServiceRequest, sender: ServiceSender, extensionId: string, liveUrl = sender.url): FaultCode | null {
  if (sender.id !== extensionId || !Number.isInteger(sender.tab?.id) || sender.frameId !== 0 || !route(sender.url)) return 'FP_REQUEST_SENDER';
  if (!req || !['fingerprint:prepare', 'fingerprint:score'].includes(req.type) || typeof req.requestId !== 'string' || req.requestId.length > 100 || !req.requestId) return 'FP_REQUEST_SHAPE';
  if (!route(liveUrl) || route(liveUrl) !== req.route || !/\/[0-9a-f-]{36}$/i.test(req.route)) return 'FP_REQUEST_ROUTE';
  if (req.type === 'fingerprint:prepare') return req.answers === undefined ? null : 'FP_REQUEST_SHAPE';
  return (req.target === null || FAMILIES.includes(req.target as Family)) && Array.isArray(req.answers) && req.answers.length === 3 && req.answers.every(a => a && Number.isInteger(a.expectedCount) && a.expectedCount >= 292 && a.expectedCount <= 332 && typeof a.text === 'string' && a.text.length <= MAX_ANSWER_BYTES && new TextEncoder().encode(a.text).byteLength <= MAX_ANSWER_BYTES) ? null : 'FP_REQUEST_SHAPE';
}
export function validRequest(req: ServiceRequest, sender: ServiceSender, extensionId: string): boolean { return requestError(req, sender, extensionId) === null; }
export function createScoringService(read: (name: string) => Promise<ArrayBuffer>, extensionId: string, currentTab?: (tabId: number) => Promise<{ url?: string; pendingUrl?: string }>) {
  let data: Promise<FingerprintData> | undefined;
  // An in-memory lock prevents parallel heavy requests, not an answer cache.
  let busy = false;
  const failure = (code: FaultCode) => {
    const error = new FingerprintFault(code);
    console.warn('[arena-fingerprint-service]', code);
    return { ok: false as const, code, error: error.message };
  };
  return async (request: ServiceRequest, sender: ServiceSender) => {
    // sender.url may retain the document's original URL across history.pushState.
    // Never trust a URL supplied in the message as proof: attest the tab via browser API.
    if (sender.id !== extensionId || !Number.isInteger(sender.tab?.id) || sender.frameId !== 0 || !route(sender.url)) return failure('FP_REQUEST_SENDER');
    const check = async (): Promise<FaultCode | null> => {
      if (!currentTab) return requestError(request, sender, extensionId);
      try {
        const tab = await currentTab(sender.tab!.id!);
        if (tab.pendingUrl) return 'FP_REQUEST_ROUTE';
        return requestError(request, sender, extensionId, tab.url ?? '');
      } catch { return 'FP_REQUEST_TAB'; }
    };
    const invalid = await check();
    if (invalid) return failure(invalid);
    if (busy) return failure('FP_BUSY');
    busy = true;
    let loadedData = false;
    try {
      // A transient read failure must not poison all later explicit attempts.
      data ??= loadData(read).catch(error => { data = undefined; throw error; });
      const loaded = await data;
      loadedData = true;
      const changed = await check();
      if (changed) return failure(changed);
      const result = request.type === 'fingerprint:prepare' ? null : scoreThree(request.answers!, request.target ?? null, loaded);
      if (result) console.debug('[arena-fingerprint-score]', JSON.stringify({ kind: result.kind, target: request.target ?? null, ...result.diagnostics }));
      return { ok: true as const, data: result, requestId: request.requestId };
    } catch (error) {
      return failure(safeFault(error, loadedData ? 'FP_SCORE' : 'FP_UNKNOWN').code);
    } finally { busy = false; }
  };
}
