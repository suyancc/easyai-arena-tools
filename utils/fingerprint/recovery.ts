/** Read-only recovery. No prompt generation, capture claim, editor action, or network fetch. */
import { recognizeChallenge } from './challenges';
import { ready } from './identity';
import { outcomeResult, type FingerprintResult } from './result';
import { MAX_ANSWER_BYTES, type Answer, type FingerprintService } from './types';
import type { PageView } from '../types';
export interface HistoryPair { input: string; answer: string | null; prompt: string; text: string; complete: boolean; failed: boolean; oversize: boolean }
export interface FingerprintHistory { pairs: HistoryPair[]; signature: string | null; complete: boolean; failed: boolean }
export type RecoveryInspection = { status: 'none' | 'waiting' | 'invalid' } | { status: 'ready'; answers: Answer[]; prompt: string; signature: string };
export function inspectHistory(h: FingerprintHistory | null): RecoveryInspection {
  if (!h || !Array.isArray(h.pairs) || h.pairs.length !== 3) return { status: 'none' };
  const challenges = h.pairs.map(p => recognizeChallenge(p.prompt));
  if (challenges.some(c => !c)) return { status: 'none' };
  if (new Set(challenges.map(c => c!.expectedCount)).size !== 3 || new Set(h.pairs.map(p => p.input)).size !== 3) return { status: 'invalid' };
  if (h.failed || h.pairs.some(p => p.failed || p.oversize || !p.input || new TextEncoder().encode(p.text).byteLength > MAX_ANSWER_BYTES)) return { status: 'invalid' };
  if (!h.complete || !h.signature || h.pairs.some(p => !p.complete || !p.answer)) return { status: 'waiting' };
  if (new Set(h.pairs.map(p => p.answer)).size !== 3) return { status: 'invalid' };
  return { status: 'ready', answers: h.pairs.map((p, i) => ({ text: p.text, expectedCount: challenges[i]!.expectedCount })),
    prompt: h.pairs[2]!.prompt, signature: h.signature };
}
export async function historyKey(expectedRoute: string, history: FingerprintHistory): Promise<string> {
  // Bind ALL three answers, not only the last one. Persist only this digest and result metadata.
  const bytes = new TextEncoder().encode(JSON.stringify([expectedRoute, history]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'fp-recovery-v1:' + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
export interface RecoveryPorts {
  active(): boolean;
  history(): Promise<FingerprintHistory | null>;
  page(prompt: string): Promise<PageView>;
  known(key: string): Promise<FingerprintResult | null>;
  service: FingerprintService;
  save(key: string, result: FingerprintResult): Promise<void>;
  show(result: FingerprintResult): void | Promise<void>;
  say(message: string): void;
}
export async function recoverFingerprint(expectedRoute: string, ports: RecoveryPorts): Promise<string> {
  if (!ports.active()) return 'inactive';
  const history = await ports.history();
  if (!ports.active()) return 'inactive';
  const inspection = inspectHistory(history);
  if (inspection.status !== 'ready') {
    if (inspection.status === 'waiting') ports.say('已找到三题指纹记录，等待已有回答完成；不会重发');
    return inspection.status;
  }
  const { answers, prompt, signature } = inspection;
  const key = await historyKey(expectedRoute, history!);
  try {
    const before = await ports.page(prompt);
    if (!ports.active() || !ready(before, expectedRoute) || before.responseSignature !== signature || before.draft) return 'waiting-page';
    const cached = await ports.known(key);
    if (!ports.active()) return 'inactive';
    let result = cached;
    if (!result) {
      ports.say('正在读取当前会话已有三题并恢复本地评分，不会重新发题…');
      const outcome = await ports.service.score(answers, null);
      const d = outcome.diagnostics;
      result = outcomeResult(outcome, null);
      if (d) result.note = `${result.note || ''}；三题有效数字：${d.numberCounts.join(' / ')}（最低 ${d.minimumCounts.join(' / ')}）`;
    }
    if (!ports.active()) return 'inactive';
    const after = await ports.history();
    const page = await ports.page(prompt);
    if (!ports.active() || !after || await historyKey(expectedRoute, after) !== key || !ready(page, expectedRoute) || page.responseSignature !== signature || page.draft) return 'changed';
    if (!ports.active()) return 'inactive';
    if (!cached) await ports.save(key, result);
    if (!ports.active()) return 'inactive';
    await ports.show(result);
    return cached ? 'restored' : 'scored';
  } finally { answers.length = 0; }
}
