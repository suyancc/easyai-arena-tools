import { safeFault } from './errors';
/** Three-challenge state machine. All effects injected; no browser imports. */
import { route } from '../arena-route';
import type { PageView, TurnProbe } from '../types';
import { generateChallenges } from './challenges';
import { bound, eligible, official, ready, stable, type Identity } from './identity';
import { outcomeResult, type FingerprintResult } from './result';
import { FAMILIES, familyFrom, familyLabel, MAX_ANSWER_BYTES, type Answer, type Challenge, type FingerprintService } from './types';
export interface FingerprintAction {
  prompt: string; previousPrompt: string; expectedRoute: string; expectedResponseSignature: string;
}
export interface FingerprintPageApi {
  choice?(prompt: string, expectedRoute: string, signature: string): Promise<'none' | 'clicked' | 'pending' | 'blocked'>;
  action(action: 'fill' | 'send', options: FingerprintAction): Promise<void>;
  read(prompt: string): Promise<PageView>;
  readAnswer(prompt: string, expectedRoute: string, signature: string): Promise<{ text: string | null; oversize: boolean }>;
  snapshot(turnId: string): Promise<TurnProbe | null>;
}
export interface SessionHost { active(): boolean; now(): number; say(message: string): void }
export type SessionResult = { kind: 'pending' } | { kind: 'stop'; reason: string } | FingerprintResult;
const pending: SessionResult = { kind: 'pending' };
export class FingerprintSession {
  private stage: 'prepare' | 'fill' | 'send' | 'await' | 'score' | 'done' = 'prepare';
  private index = 0;
  private answers: Answer[] = [];
  private challenges: Challenge[];
  private previousPrompt: string;
  private previousSignature: string;
  private stageAt: number;
  private progressAt: number;
  private progress: string | null = null;
  private observed: string | null = null;
  private stableAt: number | null = null;
  private busy = false;
  private choiceSince: number | null = null;
  private cancelled = false;
  private result: SessionResult = pending;
  constructor(
    private readonly page: FingerprintPageApi,
    private readonly service: FingerprintService,
    private readonly host: SessionHost,
    readonly identity: Identity,
    readonly expectedRoute: string,
    prompt: string,
    signature: string,
    private readonly noProgressMs: number,
    challenges = generateChallenges(),
    private bootstrapping = false,
  ) {
    if (challenges.length !== 3) throw new Error('必须生成三题');
    this.challenges = challenges;
    this.previousPrompt = prompt;
    this.previousSignature = signature;
    this.stageAt = this.progressAt = host.now();
  }
  get pagePrompt() { return ['await', 'score'].includes(this.stage) ? this.challenges[this.index]!.prompt : this.previousPrompt; }
  private active() { return !this.cancelled && this.host.active(); }
  cancel() { this.cancelled = true; this.answers = []; }
  shiftTime(ms: number) { this.stageAt += ms; this.progressAt += ms; if (this.stableAt !== null) this.stableAt += ms; }
  private finish(result: SessionResult): SessionResult {
    this.stage = 'done'; this.answers = []; this.result = result;
    return result;
  }
  private fallback(note: string, snapshot?: TurnProbe | null): SessionResult {
    const target = familyFrom(snapshot?.family) ?? this.identity.target;
    return this.finish({ kind: 'done', model: familyLabel(target), provider: null, note });
  }
  private checkSnapshot(s: TurnProbe | null): SessionResult | null {
    if (this.bootstrapping) {
      // A new capture can be route-bound with zero evidence. Only challenge 1's
      // completed answer may establish identity; historical DOM is not evidence.
      if (!bound(s, this.identity.turnId) || s.familyConflict) return this.finish({ kind: 'stop', reason: '新探测证据失去会话绑定，已停止' });
      if (this.stage !== 'await' && (s.mode !== 'UNKNOWN' || (s.evidenceCount ?? 0) !== 0)) return this.finish({ kind: 'stop', reason: '第一题发送前出现其他回合证据，请重新探测' });
      return null;
    }
    const resolved = s && official(s, this.identity.turnId);
    if (resolved) return this.finish({ kind: 'done', ...resolved, note: null });
    if (!stable(s, this.identity)) return this.fallback('家族、可见型号或本回合证据变化，已中止剩余挑战；不显示具体候选', s);
    return null;
  }
  private changedRoute(p: PageView) { return !p.allowed || route(p.url) !== this.expectedRoute; }
  async tick(p: PageView): Promise<SessionResult> {
    if (!this.active() || this.busy) return pending;
    if (this.stage === 'done') return this.result;
    this.busy = true;
    try { return await this.advance(p); }
    catch (error) {
      if (!this.active()) return pending;
      // Errors may arrive after a route change or an official identity update.
      // Never downgrade that official identity, nor resume an unverified page.
      try {
        const current = await this.page.read(this.pagePrompt);
        if (!this.active()) return pending;
        if (this.changedRoute(current)) return this.finish({ kind: 'stop', reason: '指纹操作期间会话变化，已安全停止' });
        const snapshot = await this.page.snapshot(this.identity.turnId);
        if (!this.active()) return pending;
        const decision = this.checkSnapshot(snapshot);
        if (decision) return decision;
      } catch {
        return this.active() ? this.finish({ kind: 'stop', reason: '指纹操作失败且当前会话无法复核，已安全停止；不会重试' }) : pending;
      }
      if (this.stage === 'prepare') return this.finish({ kind: 'stop', reason: `指纹准备失败：${safeFault(error).message}；未发送挑战，已停止任务` });
      return this.fallback('指纹操作或评分未能确认，已停止细分且不会重试；保留家族判断');
    }
    finally { this.busy = false; }
  }
  private async advance(p: PageView): Promise<SessionResult> {
    if (this.identity.networkOnly && ready(p, this.expectedRoute) && p.fingerprintInputBound !== true) return this.finish({ kind: 'stop', reason: '网络回答失去发送请求绑定，已停止' });
    if (this.changedRoute(p)) return this.finish({ kind: 'stop', reason: '指纹细分期间会话变化，已停止；不会重发' });
    if (this.page.choice && this.stage !== 'send' && ready(p, this.expectedRoute) && !p.draft) {
      const choice = await this.page.choice(this.pagePrompt, this.expectedRoute, p.responseSignature!);
      if (!this.active()) return pending;
      if (choice === 'blocked') return this.finish({ kind: 'stop', reason: '回复后选项卡片无法唯一确认，已停止以避免误点' });
      if (choice !== 'none') {
        this.choiceSince ??= this.host.now();
        if (choice === 'clicked') this.host.say('已选择回复下方第 3 项，等待页面更新…');
        return this.host.now() - this.choiceSince >= 15000
          ? this.finish({ kind: 'stop', reason: '回复后选项卡片未关闭，请手动处理后重试；不会重复点击' }) : pending;
      }
      this.choiceSince = null;
    }
    const snapshot = await this.page.snapshot(this.identity.turnId);
    if (!this.active()) return pending;
    const decision = this.checkSnapshot(snapshot);
    if (decision) return decision;
    const now = this.host.now(), challenge = this.challenges[this.index]!;
    if (this.stage === 'prepare') {
      this.host.say('正在校验本地指纹数据，尚未发送挑战…');
      await this.service.prepare();
      if (!this.active()) return pending;
      this.stage = 'fill'; this.stageAt = this.host.now();
      return pending; // Fresh page + evidence required before any send.
    }
    if (this.stage === 'fill' || this.stage === 'send') {
      if (!ready(p, this.expectedRoute) || p.responseSignature !== this.previousSignature) {
        return now - this.stageAt >= 20_000 ? this.fallback('上一条回答无法确认，已停止细分') : pending;
      }
      const action = this.stage;
      if ((p.draft ?? '') !== (action === 'fill' ? '' : challenge.prompt)) return this.fallback('发现草稿变化，已保留草稿并停止细分');
      // Transition BEFORE await: an uncertain send is never retried.
      this.stage = action === 'fill' ? 'send' : 'await';
      this.stageAt = this.progressAt = now;
      this.observed = this.progress = null; this.stableAt = null;
      await this.page.action(action, { prompt: challenge.prompt, previousPrompt: this.previousPrompt, expectedRoute: this.expectedRoute, expectedResponseSignature: this.previousSignature });
      if (!this.active()) return pending;
      this.host.say(`指纹挑战 ${this.index + 1}/3：${action === 'fill' ? '已填入，准备发送' : '已发送，等待回答'}…`);
      return pending;
    }
    if (this.stage !== 'await') return pending;
    if (p.failed) return this.fallback('指纹挑战回答失败，已中止剩余挑战');
    if (!p.promptConfirmed) return now - this.stageAt >= this.noProgressMs ? this.fallback('指纹挑战提示无法确认，已停止细分') : pending;
    const progress = p.progressSignature ?? p.responseSignature ?? '';
    if (this.progress !== progress) { this.progress = progress; this.progressAt = now; }
    if (!ready(p, this.expectedRoute)) return now - this.progressAt >= this.noProgressMs ? this.fallback('指纹挑战长时间无进展，已停止细分') : pending;
    if (p.draft) return this.fallback('检测到用户草稿，已停止细分并保留草稿');
    if (this.observed !== p.responseSignature) { this.observed = p.responseSignature!; this.stableAt = now; return pending; }
    if (now - this.stableAt! < (p.completionConfirmed ? 500 : 1200)) return pending;
    const sample = await this.page.readAnswer(challenge.prompt, this.expectedRoute, p.responseSignature!);
    if (!this.active()) return pending;
    const afterRead = await this.page.snapshot(this.identity.turnId);
    if (!this.active()) return pending;
    const afterDecision = this.checkSnapshot(afterRead);
    if (afterDecision) return afterDecision;
    if (this.bootstrapping) {
      const resolved = afterRead && official(afterRead, this.identity.turnId);
      if (resolved) return this.finish({ kind: 'done', ...resolved, note: null });
      if (!eligible(afterRead, this.identity.turnId, [...FAMILIES], true) && p.fingerprintInputBound !== true) {
        return this.finish({ kind: 'stop', reason: '第一题已完成，但未捕获到可关联的新证据；已停止，不会继续发送' });
      }
      const target = familyFrom(afterRead!.family);
      Object.assign(this.identity, { networkOnly: p.fingerprintInputBound === true && !target, target, everyTurn: !target, provider: afterRead!.providerName ?? null, arena: afterRead!.arenaName ?? null });
      this.bootstrapping = false;
    }
    let text = sample.oversize ? '' : sample.text ?? '';
    if (new TextEncoder().encode(text).byteLength > MAX_ANSWER_BYTES) text = '';
    this.answers.push({ expectedCount: challenge.expectedCount, text });
    if (this.index < 2) {
      this.previousPrompt = challenge.prompt; this.previousSignature = p.responseSignature!;
      this.index++; this.stage = 'fill'; this.stageAt = this.host.now();
      this.host.say(`指纹挑战 ${this.index}/3 已完成，准备下一题…`);
      return pending;
    }
    this.stage = 'score';
    this.host.say('三题已完成，正在进行本地指纹评分…');
    const answers = this.answers; this.answers = [];
    let outcome;
    try { outcome = await this.service.score(answers, this.identity.everyTurn ? null : this.identity.target); }
    finally { answers.length = 0; }
    if (!this.active()) return pending;
    // Re-read page AND evidence after asynchronous scoring: result is not an identity lock.
    const finalPage = await this.page.read(challenge.prompt);
    if (!this.active()) return pending;
    if (this.changedRoute(finalPage)) return this.finish({ kind: 'stop', reason: '评分期间会话变化，已丢弃候选' });
    const finalSnapshot = await this.page.snapshot(this.identity.turnId);
    if (!this.active()) return pending;
    const finalDecision = this.checkSnapshot(finalSnapshot);
    if (finalDecision) return finalDecision;
    if (this.identity.networkOnly && finalPage.fingerprintInputBound !== true) return this.finish({ kind: 'stop', reason: '评分期间网络回答绑定失效，已丢弃候选' });
    if (!ready(finalPage, this.expectedRoute) || finalPage.responseSignature !== p.responseSignature || finalPage.draft) return this.fallback('评分期间回答或页面状态变化，未展示具体候选');
    return this.finish(outcomeResult(outcome, this.identity.target));
  }
}
