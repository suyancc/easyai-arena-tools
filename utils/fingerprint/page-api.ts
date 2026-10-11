import { route, stableRouteRead } from '../arena-route';
import { rpc } from '../page-rpc';
import type { PageView, TurnProbe } from '../types';
import type { FingerprintPageApi } from './session';
export const fingerprintPage: FingerprintPageApi = {
  async read(prompt) {
    const before = location.href;
    const raw = await rpc<Omit<PageView, 'allowed'>>('fingerprintRead', [prompt]);
    if (!raw || typeof raw !== 'object') throw new Error('指纹页面读数无效');
    return { ...raw, allowed: stableRouteRead(before, raw.url, location.href) };
  },
  async choice(prompt, expectedRoute, signature) {
    if (route(location.href) !== expectedRoute) return 'blocked';
    const result = await rpc<string>('fingerprintChoice', [prompt, expectedRoute, signature]);
    if (route(location.href) !== expectedRoute) return 'blocked';
    return ['none', 'clicked', 'pending', 'blocked'].includes(result) ? result as 'none' | 'clicked' | 'pending' | 'blocked' : 'blocked';
  },
  async action(action, options) {
    if (route(location.href) !== options.expectedRoute) throw new Error('指纹操作前会话变化');
    const r = await rpc<{ ok?: boolean }>('fingerprintAction', [action, options]);
    if (!r?.ok || route(location.href) !== options.expectedRoute) throw new Error('指纹操作未确认，不会重试');
  },
  async readAnswer(prompt, expectedRoute, signature) {
    if (route(location.href) !== expectedRoute) throw new Error('指纹读取前会话变化');
    const r = await rpc<{ text: string | null; oversize: boolean }>('fingerprintAnswer', [prompt, expectedRoute, signature]);
    if (!r || typeof r.oversize !== 'boolean' || (r.text !== null && typeof r.text !== 'string') || route(location.href) !== expectedRoute) throw new Error('指纹读取未确认');
    return r;
  },
  async snapshot(turnId) {
    const before = route(location.href);
    const snapshot = await rpc<TurnProbe | null>('snapshotTurn', [turnId], 8000);
    if (snapshot && before !== route(location.href)) return { ...snapshot, routeMatched: false };
    return snapshot;
  },
};
