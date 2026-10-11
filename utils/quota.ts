/** 额度查询结果整理（移植自 src-tauri/src/quota.rs）。 */
import type { Allowance, QuotaView } from './types';

export interface PulseResponse {
  status: number;
  pulse: number | null;
  refreshedAt: string | null;
}

export const EMPTY_QUOTA: QuotaView = {
  pulse: null,
  refreshedAt: null,
  checkedAt: null,
  error: null,
  allowance: null,
  source: null,
};

/** HTTP 结果 → 剩余百分比或错误文本。 */
export function interpretPulse(r: PulseResponse): { pulse: number; refreshedAt: string | null } | { error: string } {
  if (r.status >= 200 && r.status < 300) {
    if (typeof r.pulse !== 'number' || !(r.pulse >= 0 && r.pulse <= 100)) return { error: '额度数据无效' };
    return { pulse: Math.round(r.pulse), refreshedAt: r.refreshedAt };
  }
  if (r.status === 401 || r.status === 403) return { error: '未登录，无法查询额度' };
  if (r.status === 429) return { error: '查询过于频繁，稍后重试' };
  if (r.status === 0) return { error: '网络请求失败' };
  return { error: `查询失败（HTTP ${r.status}）` };
}

/** 在上一次结果的基础上合并新的查询结果（失败时保留上次成功的百分比）。 */
export function mergeQuota(
  previous: QuotaView | null | undefined,
  r: PulseResponse,
  source: 'page' | 'direct',
  allowance: Allowance | null | undefined,
  now = Date.now(),
): QuotaView {
  const q: QuotaView = { ...EMPTY_QUOTA, ...(previous ?? {}) };
  const res = interpretPulse(r);
  if ('error' in res) {
    q.error = res.error;
  } else {
    q.pulse = res.pulse;
    q.refreshedAt = res.refreshedAt;
    q.checkedAt = now;
    q.error = null;
  }
  if (allowance) q.allowance = normalizeAllowance(allowance);
  q.source = source;
  return q;
}

export function normalizeAllowance(a: unknown): Allowance | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    tier: str(o.tier),
    usd: num(o.usd),
    remainingUsd: num(o.remainingUsd),
    chargedUsd: num(o.chargedUsd),
    overLimit: typeof o.overLimit === 'boolean' ? o.overLimit : null,
    windowStartMs: num(o.windowStartMs),
    source: str(o.source),
    at: num(o.at),
  };
}

export function quotaLevel(p: number): 'high' | 'mid' | 'low' {
  return p >= 50 ? 'high' : p >= 20 ? 'mid' : 'low';
}

export function agoText(ms: number | null, now = Date.now()): string {
  if (!ms) return '';
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 10) return '刚刚';
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  return `${Math.floor(s / 3600)} 小时前`;
}

export function usd(v: number | null | undefined): string {
  return typeof v === 'number' ? `$${v.toFixed(2)}` : '—';
}
