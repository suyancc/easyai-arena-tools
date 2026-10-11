import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ load: vi.fn(), score: vi.fn() }));
vi.mock('../utils/fingerprint/data', () => ({ loadData: mocks.load }));
vi.mock('../utils/fingerprint/scorer', () => ({ scoreThree: mocks.score }));
import { createScoringService } from '../utils/fingerprint/service';
import { FingerprintFault } from '../utils/fingerprint/errors';
const route = 'https://arena.ai/work/0f8fad5b-d9cb-469f-a165-70867728950e';
const sender = { id: 'extension', frameId: 0, tab: { id: 1 }, url: route };
const request = { type: 'fingerprint:prepare' as const, requestId: 'r1', route };
beforeEach(() => { mocks.load.mockReset(); mocks.score.mockReset(); });
describe('background failure diagnostics and explicit retry', () => {
  it('does not cache a rejected data load forever', async () => {
    mocks.load.mockRejectedValueOnce(new FingerprintFault('FP_DATA_READ')).mockResolvedValue({});
    const service = createScoringService(vi.fn(), 'extension');
    expect(await service(request, sender)).toMatchObject({ ok: false, code: 'FP_DATA_READ' });
    expect(await service(request, sender)).toMatchObject({ ok: true });
    expect(await service(request, sender)).toMatchObject({ ok: true });
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it('distinguishes a busy loader from invalid assets', async () => {
    let resolve!: (x: unknown) => void;
    mocks.load.mockImplementation(() => new Promise(r => { resolve = r; }));
    const service = createScoringService(vi.fn(), 'extension');
    const first = service(request, sender);
    expect(await service(request, sender)).toMatchObject({ ok: false, code: 'FP_BUSY' });
    resolve({}); expect(await first).toMatchObject({ ok: true });
  });
  it('rejects foreign senders without accessing files', async () => {
    const service = createScoringService(vi.fn(), 'extension');
    expect(await service(request, { ...sender, id: 'foreign' })).toMatchObject({ ok: false, code: 'FP_REQUEST_SENDER' });
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each(['FP_DATA_JSON', 'FP_DATA_HASH', 'FP_DATA_SCHEMA', 'FP_CRYPTO'] as const)('retains %s', async code => {
    mocks.load.mockRejectedValue(new FingerprintFault(code));
    expect(await createScoringService(vi.fn(), 'extension')(request, sender)).toMatchObject({ ok: false, code });
  });
});


describe('SPA automatic drawing request binding', () => {
  it('accepts an old document URL only when browser tab confirms the new conversation', async () => {
    mocks.load.mockResolvedValue({});
    const tab = vi.fn(async () => ({ url: route }));
    const service = createScoringService(vi.fn(), 'extension', tab);
    expect(await service(request, { ...sender, url: 'https://arena.ai/work' })).toMatchObject({ ok: true });
    expect(tab).toHaveBeenCalledWith(1);
  });
  it('does not trust request.route when current tab points at another conversation', async () => {
    const service = createScoringService(vi.fn(), 'extension', async () => ({ url: route.replace('/work/', '/agent/') }));
    expect(await service(request, sender)).toMatchObject({ code: 'FP_REQUEST_ROUTE' }); expect(mocks.load).not.toHaveBeenCalled();
  });
  it('rejects another extension and subframes before querying tabs', async () => {
    const tab = vi.fn(); const service = createScoringService(vi.fn(), 'extension', tab);
    for (const patch of [{ id: 'foreign' }, { frameId: 1 }, { url: 'https://evil.example/' }]) {
      expect(await service(request, { ...sender, ...patch })).toMatchObject({ code: 'FP_REQUEST_SENDER' });
    }
    expect(tab).not.toHaveBeenCalled();
  });
  it('detects navigation while offline data is loading', async () => {
    mocks.load.mockResolvedValue({});
    const tab = vi.fn().mockResolvedValueOnce({ url: route }).mockResolvedValue({ url: 'https://arena.ai/work' });
    const service = createScoringService(vi.fn(), 'extension', tab);
    expect(await service(request, sender)).toMatchObject({ code: 'FP_REQUEST_ROUTE' }); expect(mocks.score).not.toHaveBeenCalled();
  });
  it('rejects a closed or pending-navigation tab rather than weakening the route check', async () => {
    const service = createScoringService(vi.fn(), 'extension', async () => { throw Error('closed'); });
    expect(await service(request, sender)).toMatchObject({ code: 'FP_REQUEST_TAB' });
    const pending = createScoringService(vi.fn(), 'extension', async () => ({ url: route, pendingUrl: 'https://arena.ai/work' }));
    expect(await pending(request, sender)).toMatchObject({ code: 'FP_REQUEST_ROUTE' });
  });
});
