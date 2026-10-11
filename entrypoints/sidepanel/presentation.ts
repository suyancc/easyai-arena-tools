import type { QuotaView } from '../../utils/types';
export function modelPresentation(value: string | null | undefined) {
  const full = value?.trim() || '尚未识别';
  const unknown = /尚未|未识别|未知|待定/.test(full);
  const inferred = /推测|候选|家族/.test(full);
  return { full, name: full.replace(/（(?:指纹)?推测）$/u, ''), kind: unknown ? '' : inferred ? '推测' : '官方', className: inferred ? 'inferred' : 'official' };
}
export function quotaPresentation(quota: QuotaView | null) {
  // One authoritative bar, never fabricate zero when no value is available.
  const value = quota?.pulse;
  const p = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
  return { value: p, label: p === null ? '—' : `${Number(p.toFixed(1))}%`, stale: !!quota?.error,
    level: p !== null && p < 15 ? 'low' : p !== null && p < 35 ? 'medium' : 'high' };
}
export function compactStatus(message: string): string {
  if (/准备就绪：|页面已连接，准备/.test(message)) return '';
  const clean = message.replace(/^第\s*\d+(?:\/\d+)?\s*轮[：:]\s*/, '');
  if (/指纹挑战 \d\/3：.*已发送/.test(clean)) return clean.replace(/指纹挑战 (\d\/3)：.*/, '探测 $1 · 等待回答');
  if (/指纹挑战 \d\/3：.*已填入/.test(clean)) return clean.replace(/指纹挑战 (\d\/3)：.*/, '探测 $1 · 准备发送');
  if (/三题已.*评分/.test(clean)) return '三题完成 · 本地评分中';
  if (/已发送，等待回答/.test(clean)) return '等待回答…';
  if (/正在校验本地指纹/.test(clean)) return '校验离线数据…';
  return clean;
}
export const escapeHtml = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
