import { route } from '../arena-route';
import type { PageView, TurnProbe } from '../types';
import { familyFrom, type Family } from './types';
export function bound(s: TurnProbe | null, turnId: string): s is TurnProbe {
  return !!turnId && !!s?.api && s.turnId === turnId && s.captureBound && s.routeMatched === true;
}
export function eligible(s: TurnProbe | null, turnId: string, families: Family[], everyTurn: boolean): boolean {
  if (!bound(s, turnId) || s.familyConflict || s.mode === 'RESOLVED') return false;
  if (everyTurn) return s.mode === 'INFERRED' || (s.evidenceCount ?? 0) > 0;
  const family = familyFrom(s.family);
  return s.mode === 'INFERRED' && !!family && families.includes(family);
}
export function ready(p: PageView, expected: string): boolean {
  return p.allowed && route(p.url) === expected && p.main && p.conversation && p.promptConfirmed && p.response && !p.generating && !p.activity && !p.failed && !p.blocker && !!p.responseSignature;
}
export interface Identity { networkOnly?: boolean; turnId: string; target: Family | null; everyTurn: boolean; provider: string | null; arena: string | null }
export function stable(s: TurnProbe | null, i: Identity): boolean {
  return bound(s, i.turnId) && !s.familyConflict &&
    ((i.networkOnly && s.mode === 'UNKNOWN') || s.mode === 'INFERRED' || (i.everyTurn && s.mode !== 'RESOLVED' && (s.evidenceCount ?? 0) > 0)) &&
    (!i.target || familyFrom(s.family) === i.target) &&
    (s.providerName ?? null) === i.provider && (s.arenaName ?? null) === i.arena;
}
export function official(s: TurnProbe, turnId: string): { model: string; provider: string | null } | null {
  if (!bound(s, turnId) || s.mode !== 'RESOLVED') return null;
  const provider = s.providerName?.trim() ? s.providerName : s.modelId?.trim() ? s.modelId : null;
  return { model: s.arenaName?.trim() ? s.arenaName : provider ?? '未识别（官方型号暂不可见）', provider };
}
