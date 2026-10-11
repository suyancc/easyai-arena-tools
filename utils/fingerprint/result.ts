import { type Family, type Outcome } from './types';
export interface FingerprintResult {
  kind: 'done'; model: string; provider: string | null; note: string | null;
  candidateFamily?: Family;
}
export function outcomeResult(outcome: Outcome, _target: Family | null): FingerprintResult {
  const top = outcome.diagnostics?.ranking[0];
  const candidate = outcome.kind === 'candidate' ? outcome.candidate : top;
  if (candidate) return { kind: 'done', model: `${candidate.displayName}（指纹推测）`, provider: null,
    note: `指纹评分最高型号：${candidate.displayName}；按三题指纹排名选取，不按厂商或家族过滤；非官方身份确认`,
    ...(outcome.kind === 'candidate' && outcome.candidate.family ? { candidateFamily: outcome.candidate.family } : {}),
  };
  return { kind: 'done', model: '指纹样本不足', provider: null,
    note: outcome.kind === 'insufficient' ? `有效样本 ${outcome.validAnswers}/3，不足以计算具体型号` : '指纹评分未返回具体型号' };
}
/** Session-local reuse only. Vendor changes invalidate the previous candidate. */
export class FamilyCandidateCache {
  private family: string | null = null;
  private candidate: { family: Family; model: string } | null = null;
  observe(family: string) {
    if (this.family !== family) this.candidate = null;
    this.family = family;
  }
  remember(family: Family, model: string) { this.observe(family); this.candidate = { family, model }; }
  get(family: Family) { return this.candidate?.family === family ? this.candidate.model : null; }
  clear() { this.family = null; this.candidate = null; }
}
