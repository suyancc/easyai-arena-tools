/** Manual mode reuses FingerprintSession; never starts a new chat or probe prompt. */
import { created, route } from '../arena-route';
import type { PageView, TurnProbe } from '../types';
import { bound, eligible, official, ready } from './identity';
import { FingerprintSession, type FingerprintPageApi, type SessionHost, type SessionResult } from './session';
import { FAMILIES, familyFrom, type FingerprintService } from './types';
export interface ManualContext { turnId: string; prompt: string; page: PageView; snapshot: TurnProbe | null; bootstrap?: boolean }
export function inspectManual(context: ManualContext) {
  const { page, snapshot, turnId, prompt } = context;
  const expected = created(page.url);
  if (!expected || !prompt || !page.allowed || !page.main || !page.conversation || page.blocker) throw new Error('请打开当前会话并处理页面阻断');
  const resolved = !context.bootstrap && snapshot && official(snapshot, turnId);
  if (resolved) return { turnId, route: expected, official: resolved };
  if (!ready(page, expected)) throw new Error('请等待当前回答完成，并保持当前会话');
  if (page.draft) throw new Error('请先处理输入框中的草稿');
  if (!page.editor && !page.reviewChoiceReady) throw new Error('当前会话没有可用输入框');
  if (context.bootstrap && snapshot && (!bound(snapshot, turnId) || snapshot.familyConflict || snapshot.mode !== 'UNKNOWN' || (snapshot.evidenceCount ?? 0) !== 0)) throw new Error('新探测捕获状态无效，请重新点击探测');
  if (!context.bootstrap && !eligible(snapshot, turnId, [...FAMILIES], true)) throw new Error('当前回合证据不足，无法安全探测；请完成一轮对话后重试');
  return { turnId, route: expected, official: null };
}
export interface ManualPorts {
  context(claim: boolean): Promise<ManualContext>;
  release(): Promise<void>;
  page: FingerprintPageApi;
  service: FingerprintService;
  sleep(ms: number): Promise<void>;
}
export async function runManualFingerprint(ports: ManualPorts, host: SessionHost, expectedTurn: string, noProgressMs: number): Promise<SessionResult> {
  let session: FingerprintSession | undefined;
  let acquired = false;
  try {
    acquired = true;
    const context = await ports.context(true);
    if (!host.active()) return { kind: 'pending' };
    const inspection = inspectManual(context);
    if (context.turnId !== expectedTurn) throw new Error('对话回合已变化，请重新点击探测');
    if (inspection.official) return { kind: 'done', ...inspection.official, note: null };
    const s = context.snapshot;
    session = new FingerprintSession(ports.page, ports.service, host,
      { turnId: context.turnId, target: context.bootstrap ? null : familyFrom(s?.family), everyTurn: false, provider: context.bootstrap ? null : s?.providerName ?? null, arena: context.bootstrap ? null : s?.arenaName ?? null },
      inspection.route, context.prompt, context.page.responseSignature!, noProgressMs, undefined, context.bootstrap === true);
    let captchaAt: number | null = null;
    while (host.active()) {
      const page = await ports.page.read(session.pagePrompt);
      if (!host.active()) break;
      if (!page.allowed || route(page.url) !== inspection.route) return { kind: 'stop', reason: '会话已切换，探测停止' };
      if (page.blocker === '需要人机验证') {
        captchaAt ??= host.now();
        if (host.now() - captchaAt >= 600_000) return { kind: 'stop', reason: '人工验证等待超时' };
        host.say('等待人工验证…');
      } else {
        if (captchaAt !== null) { session.shiftTime(host.now() - captchaAt); captchaAt = null; }
        if (page.blocker) return { kind: 'stop', reason: page.blocker };
        const result = await session.tick(page);
        if (result.kind !== 'pending') return result;
      }
      await ports.sleep(900);
    }
    return { kind: 'pending' };
  } finally {
    session?.cancel();
    if (acquired) await ports.release().catch(() => undefined);
  }
}
