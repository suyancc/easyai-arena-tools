/**
 * 抽模型阶段机：移植自桌面端 src-tauri/src/automation/runner（Rust）。
 *   inspect → new → waitNew → fill → send → observe → model → rename → roundPause → new …
 *
 * 安全边界与桌面端一致：页面状态不明确时停止而不是重复发送；发送前标记、不自动重发；
 * 只在官方 Arena Agent / Work 对话页内执行。
 *
 * 与桌面端的差异：
 *  - 三题指纹细分通过独立 FingerprintSession + 后台离线评分服务接入；
 *  - 页面离开对话页时不自动跳转（整页跳转会结束内容脚本），而是提示后安全停止；
 *  - 新增可选「命中目标模型即停止」。
 */
import { created, isRootRoute, route } from './arena-route';
import { FingerprintSession, type FingerprintPageApi } from './fingerprint/session';
import { bound, eligible, ready } from './fingerprint/identity';
import { FamilyCandidateCache } from './fingerprint/result';
import { familyFrom, familyLabel, type Family, type FingerprintService } from './fingerprint/types';
export interface FingerprintPorts { page: FingerprintPageApi; service: FingerprintService }
import { buildTitle, familyDisplayFromProbe, matchesTarget, safeTraceErrorTag } from './titles';
import type {
  DrawSettings,
  PageView,
  Phase,
  ProbeSnapshot,
  ProbeTurnStart,
  RoundRecord,
  TurnProbe,
} from './types';

export interface PageApi {
  read(prompt: string): Promise<PageView>;
  /** 页面动作；失败时抛出带原因的 Error。 */
  action(name: string, prompt: string, expectedRoute: string | null): Promise<void>;
  clickChoice(): Promise<boolean>;
  probe(): Promise<ProbeSnapshot>;
  beginTurn(turnId: string): Promise<ProbeTurnStart>;
  snapshotTurn(turnId: string): Promise<TurnProbe | null>;
  endTurn(turnId: string): Promise<void>;
  renameConversation(target: string, title: string, isActive: () => boolean): Promise<void>;
  stamp(): Promise<string>;
}

export interface RunnerHost {
  say(phase: Phase, message: string): void;
  /** 当前这次运行是否仍然有效（用户停止后返回 false）。 */
  isActive(): boolean;
  onModel(model: string | null): void;
  onRound(record: RoundRecord): void;
  now(): number;
  uuid(): string;
  log?(line: string): void;
}

const HUMAN_VERIFICATION_WAIT_MS = 600_000;
const HUMAN_VERIFICATION_LOG_MS = 15_000;
const PROBE_MISSING_MS = 20_000;

export class Runner {
  private phase: Phase = 'inspect';
  private fingerprint: FingerprintSession | null = null;
  private readonly fingerprintFamilies: Family[];
  private readonly fingerprintEveryTurn: boolean;
  private readonly candidateCache = new FamilyCandidateCache();
  private ticking = false;
  private since: number;
  rounds = 0;
  private readonly prompt: string;
  private readonly limit: number;
  private readonly noProgressMs: number;
  private readonly modelWaitSec: number;
  private readonly familyWaitSec: number;
  private readonly pauseMs: number;

  private choiceAt: number | null = null;
  private readFailSince: number | null = null;
  private missingSince: number | null = null;
  private termsTries = 0;
  private termsSince: number | null = null;
  private expanded = false;
  private sig: string | null = null;
  private stableSince: number;
  private sawGen = false;
  private progressSig: string | null = null;
  private progressAt: number;
  private idleSig: string | null | undefined = undefined;
  private idleSince: number | null = null;
  private identitySince: number | null = null;
  private baselineRun: string | null = null;
  private probeMissing: number | null = null;
  private sayBucket = -1;
  private conversation: string | null = null;
  private model: string | null = null;
  private provider: string | null = null;
  private note: string | null = null;
  private inferredLabel: string | null = null;
  private inferredSource: string | null = null;
  private turnId: string | null = null;
  private pauseUntil: number | null = null;
  private captchaSince: number | null = null;
  private captchaLogAt: number | null = null;
  private captchaRoute: string | null = null;
  /** 最近一次页面读数的紧凑标志位，停止时写入日志。 */
  lastPage = '';

  constructor(
    private readonly api: PageApi,
    private readonly host: RunnerHost,
    settings: DrawSettings,
    private readonly targets: string = settings.targetKeywords,
    private readonly autoRename: boolean = settings.autoRename,
    private readonly fingerprintPorts?: FingerprintPorts,
  ) {
    const now = host.now();
    this.since = now;
    this.stableSince = now;
    this.progressAt = now;
    this.prompt = settings.prompt.trim();
    this.fingerprintFamilies = settings.fingerprintFamilies ?? [];
    this.fingerprintEveryTurn = settings.fingerprintEveryTurn === true;
    this.limit = settings.limit;
    this.noProgressMs = settings.noProgressSeconds * 1000;
    this.modelWaitSec = settings.modelWaitSeconds;
    this.familyWaitSec = settings.familyWaitSeconds;
    this.pauseMs = settings.roundPauseSeconds * 1000;
  }

  get fingerprintRoute(): string | null { return this.fingerprint?.expectedRoute ?? null; }

  get currentPhase(): Phase {
    return this.phase;
  }

  private now() {
    return this.host.now();
  }
  private tell(phase: Phase, message: string) {
    this.host.say(phase, message);
  }
  private ok() {
    return this.host.isActive();
  }

  private go(p: Phase) {
    this.phase = p;
    this.since = this.now();
    this.sig = null;
    this.progressSig = null;
    this.idleSince = null;
    this.identitySince = null;
    this.missingSince = null;
    this.pauseUntil = null;
    if (p === 'new') this.expanded = false;
    if (p === 'model') {
      this.probeMissing = null;
      this.sayBucket = -1;
    }
  }

  private late(secs: number) {
    return this.now() - this.since >= secs * 1000;
  }

  /** “第 3/20 轮”（不限轮数时为“第 3 轮”）。 */
  roundLabel(): string {
    const n = this.rounds + 1;
    return this.limit > 0 ? `第 ${n}/${this.limit} 轮` : `第 ${n} 轮`;
  }

  private resumeMessage(): string {
    const r = this.roundLabel();
    switch (this.phase) {
      case 'observe':
        return `${r}：已发送，等待回答…`;
      case 'model':
        return `${r}：回答已完成，正在读取本轮模型名…`;
      case 'rename':
        return `${r}：正在备注会话…`;
      case 'new':
      case 'waitNew':
        return `${r}：正在开启新对话…`;
      case 'fill':
      case 'send':
        return `${r}：正在填写并发送提示词…`;
      default:
        return '页面已就绪，继续抽模型…';
    }
  }

  private shiftAfterHumanWait(elapsed: number) {
    this.since += elapsed;
    this.stableSince += elapsed;
    this.progressAt += elapsed;
    const shift = (v: number | null) => (v == null ? v : v + elapsed);
    this.choiceAt = shift(this.choiceAt);
    this.readFailSince = shift(this.readFailSince);
    this.missingSince = shift(this.missingSince);
    this.termsSince = shift(this.termsSince);
    this.idleSince = shift(this.idleSince);
    this.identitySince = shift(this.identitySince);
    this.probeMissing = shift(this.probeMissing);
    this.pauseUntil = shift(this.pauseUntil);
    this.fingerprint?.shiftTime(elapsed);
  }

  private captchaRouteMatches(p: PageView): boolean {
    const expected = this.captchaRoute;
    const current = route(p.url);
    if (expected === current) return true;
    const canBind =
      isRootRoute(expected) &&
      !!current &&
      !!created(current) &&
      (this.phase === 'observe' || this.phase === 'model') &&
      p.promptConfirmed;
    if (canBind) {
      this.captchaRoute = current;
      return true;
    }
    return false;
  }

  /** 结束本轮探针捕获（停止或换轮时调用）。 */
  async endCapture(): Promise<void> {
    this.fingerprint?.cancel();
    this.fingerprint = null;
    const id = this.turnId;
    this.turnId = null;
    if (id) {
      try {
        await this.api.endTurn(id);
      } catch {
        /* 页面可能已关闭 */
      }
    }
  }

  /** 推进一步；返回停止原因，或 null 表示继续。 */
  async tick(): Promise<string | null> {
    if (this.ticking || !this.ok()) return null;
    this.ticking = true;
    try { return await this.tickInner(); }
    finally { this.ticking = false; }
  }

  private async tickInner(): Promise<string | null> {
    if (this.phase === 'roundPause') {
      if (this.pauseUntil == null || this.now() >= this.pauseUntil) {
        this.go('new');
        this.tell('new', '轮次间隔结束，准备下一轮');
      }
      return null;
    }

    let p: PageView;
    try {
      p = this.fingerprint && this.fingerprintPorts
        ? await this.fingerprintPorts.page.read(this.fingerprint.pagePrompt)
        : await this.api.read(this.prompt);
      this.readFailSince = null;
      this.lastPage =
        `phase=${this.phase} round=${this.rounds + 1} url=${p.url} allowed=${p.allowed} main=${p.main} conv=${p.conversation} ` +
        `promptOk=${p.promptConfirmed} gen=${p.generating} activity=${p.activity} failed=${p.failed} response=${p.response} ` +
        `done=${p.completionConfirmed} editor=${p.editor} send=${p.sendReady} newLinks=${p.newLinks} canExpand=${p.canExpand} ` +
        `terms=${p.termsPending} blocker=${JSON.stringify(p.blocker ?? '')} draftLen=${[...(p.draft ?? '')].length}`;
    } catch (e) {
      const t = (this.readFailSince ??= this.now());
      if (this.now() - t >= 120_000) return `网页连续 2 分钟无法读取（${errorText(e)}），已停止`;
      return null;
    }
    if (!this.ok()) return null;

    const blocker = p.blocker ?? '';
    const draft = p.draft ?? '';

    // ── 人机验证：暂停等待用户人工完成，不重发提示词 ──
    if (blocker === '需要人机验证') {
      if (this.captchaSince == null) {
        this.captchaSince = this.now();
        this.captchaRoute = route(p.url);
        this.captchaLogAt = null;
      }
      if (!this.captchaRouteMatches(p)) {
        this.captchaSince = null;
        this.captchaRoute = null;
        await this.endCapture();
        return '人机验证等待期间页面会话发生变化，已安全停止本轮；不会重复发送已完成的提示词';
      }
      const elapsed = this.now() - this.captchaSince;
      if (elapsed >= HUMAN_VERIFICATION_WAIT_MS) {
        this.captchaSince = null;
        this.captchaRoute = null;
        await this.endCapture();
        return '人工验证等待超过 10 分钟，任务已安全停止；本轮不会自动重发提示词';
      }
      if (this.captchaLogAt == null || this.now() - this.captchaLogAt >= HUMAN_VERIFICATION_LOG_MS) {
        this.captchaLogAt = this.now();
        this.tell(
          this.phase,
          `检测到人机验证，任务已暂停：请在 arena.ai 页面中人工完成；完成后会自动继续本轮且不会重发提示词（已等待 ${Math.floor(elapsed / 1000)} 秒）`,
        );
      }
      return null;
    }
    if (this.captchaSince != null) {
      const elapsed = this.now() - this.captchaSince;
      this.captchaSince = null;
      if (!this.captchaRouteMatches(p)) {
        this.captchaRoute = null;
        await this.endCapture();
        return '人机验证结束后检测到页面会话变化，已安全停止；不会重发提示词';
      }
      this.shiftAfterHumanWait(elapsed);
      this.captchaRoute = null;
      this.captchaLogAt = null;
      this.tell(this.phase, `人机验证已解除，自动从当前轮继续：${this.resumeMessage()}`);
    }

    // ── 不在受支持的对话页 ──
    if (!p.allowed) {
      if (this.late(30)) {
        return route(p.url) == null && ['inspect', 'new', 'waitNew'].includes(this.phase)
          ? '当前不在 Arena 对话页（arena.ai/agent 或 /work），请打开后重新开始'
          : '页面已离开 Arena Agent/Work 对话页，本轮已停止；不会自动重发';
      }
      return null;
    }
    const here = route(p.url);

    // ── 输入框上方的选项卡片：点击第 3 项（节流 3 秒） ──
    if (!this.fingerprint && (this.choiceAt == null || this.now() - this.choiceAt >= 3000) && (await this.api.clickChoice())) {
      this.choiceAt = this.now();
      this.since = this.now();
      this.progressAt = this.now();
      this.tell(this.phase, `${this.roundLabel()}：检测到页面选项卡片，已自动点击第 3 项`);
      return null;
    }

    // ── 首次使用条款弹窗：最多点 3 次 Agree ──
    if (p.termsPending) {
      this.missingSince = null;
      const retry = this.termsSince == null || this.now() - this.termsSince >= 6000;
      if (this.termsTries < 3 && retry) {
        this.termsTries++;
        this.termsSince = this.now();
        this.tell(this.phase, '正在确认网站使用条款，等待弹窗关闭…');
        await this.api.action('terms', this.prompt, here).catch(() => undefined);
        return null;
      }
      if (this.termsTries >= 3 && (this.termsSince == null || this.now() - this.termsSince >= 20_000)) {
        return '网站使用条款尚未关闭，请手动处理后重新开始（不会重复发送）';
      }
      return null;
    }
    if (this.termsSince != null) {
      this.termsSince = null;
      this.termsTries = 0;
      this.since = this.now();
      this.progressAt = this.now();
      this.tell(this.phase, `使用条款已确认。${this.resumeMessage()}`);
    }

    const missing = !p.main
      ? '页面内容连续 20 秒无法读取，已停止'
      : this.phase === 'observe' && !p.promptConfirmed
        ? '当前问题连续 20 秒无法确认，已停止，不会自动重发'
        : null;
    if (missing) {
      this.sig = null;
      const t = (this.missingSince ??= this.now());
      if (this.now() - t >= 20_000) return missing;
      return null;
    }
    this.missingSince = null;
    if (blocker) return `${blocker}，已停止`;
    if (!['observe', 'model', 'rename'].includes(this.phase) && this.late(120)) {
      return '当前步骤超过 2 分钟未完成，已停止；请检查页面';
    }

    switch (this.phase) {
      case 'inspect':
        this.go('new');
        this.tell('new', '页面已连接，准备开启新对话');
        break;

      case 'new': {
        // 已经是可用的空白 Agent/Work 页（响应式侧栏可能没渲染 New Chat）
        if (p.newLinks === 0 && !p.conversation && p.editor) {
          this.go('fill');
          return null;
        }
        if (p.newLinks !== 1) {
          if (p.newLinks > 1) return '检测到多个 New Chat 入口，已停止，避免误操作';
          if (p.canExpand && !this.expanded) {
            this.expanded = true;
            await this.api.action('expand', this.prompt, here).catch(() => undefined);
            return null;
          }
          if (this.late(20)) return '未能确认 New Chat 入口，请手动展开网页侧栏后重新开始';
          return null;
        }
        this.go('waitNew');
        this.sawGen = false;
        this.tell('waitNew', `${this.roundLabel()}：正在开启新对话…`);
        try {
          await this.api.action('new', this.prompt, here);
        } catch (e) {
          return `开启新对话失败：${errorText(e)}`;
        }
        break;
      }

      case 'waitNew':
        if (!p.conversation && !p.generating && p.editor) this.go('fill');
        else if (this.late(20)) return '未能打开新对话，请检查页面后重新开始';
        break;

      case 'fill':
        if (!p.editor || p.conversation || p.generating) return '当前不是空白新对话，已停止';
        if (draft && draft !== this.prompt) return '页面中有不同的草稿，已保留；请自行处理后重新开始';
        try {
          await this.api.action('fill', this.prompt, here);
        } catch (e) {
          return `填入提示词失败：${errorText(e)}`;
        }
        if (this.ok()) {
          this.go('send');
          this.tell('send', '已填入提示词，准备发送');
        }
        break;

      case 'send': {
        if (draft !== this.prompt || p.conversation || p.generating) return '发送前页面或草稿改变，已停止';
        if (!p.sendReady) {
          if (this.late(20)) return '发送按钮暂不可用，请检查页面';
          return null;
        }
        // 基线 run id：只有新的、带模型名的 run 才属于本轮。
        this.baselineRun = (await this.api.probe().catch(() => null))?.runId ?? null;
        if (!this.ok()) return null;
        this.turnId = null;
        this.note = null;
        this.inferredLabel = null;
        this.inferredSource = null;
        this.provider = null;
        const turnId = this.host.uuid();
        const captured = await this.api.beginTurn(turnId).catch(() => ({ ok: false, reason: 'rpc-failed' }) as ProbeTurnStart);
        if (!this.ok()) return null;
        if (captured.ok) this.turnId = turnId;
        this.host.log?.(`PROBE_TURN_START ok=${captured.ok} reason=${captured.reason ?? 'none'}`);
        this.sawGen = false;
        this.go('observe');
        this.tell('observe', `${this.roundLabel()}：已发送，等待回答…`);
        try {
          await this.api.action('send', this.prompt, here);
        } catch (e) {
          return `发送未确认（不会自动重发）：${errorText(e)}`;
        }
        break;
      }

      case 'observe': {
        const progress = p.progressSignature ?? p.responseSignature ?? '';
        if (this.progressSig !== progress) {
          this.progressSig = progress;
          this.progressAt = this.now();
        } else if (this.now() - this.progressAt >= this.noProgressMs) {
          return '回答内容长时间没有实质变化，已停止；不会自动重发';
        }
        if (p.failed) return '网页回答已停止或出错，本轮作废；请检查后重新开始';
        this.sawGen ||= p.generating;
        const signature = p.responseSignature ?? '';
        const finished =
          !p.generating && !p.activity && p.response && (this.sawGen || p.completionConfirmed || p.promptConfirmed);
        if (finished && signature) {
          this.idleSince = null;
          if (this.sig !== signature) {
            this.sig = signature;
            this.stableSince = this.now();
            this.identitySince = null;
          } else {
            const stable = p.completionConfirmed ? 500 : 1200;
            if (this.now() - this.stableSince >= stable) {
              const conversation = created(p.url);
              if (!conversation) {
                if (this.identitySince == null) {
                  this.identitySince = this.now();
                  this.tell('observe', '回答已稳定，正在等待具体对话身份…');
                }
                if (this.now() - this.identitySince >= 120_000) return '回答已完成，但具体对话身份仍未确认，已停止';
                return null;
              }
              this.conversation = conversation;
              this.go('model');
              this.tell('model', `${this.roundLabel()}：回答已完成，正在读取本轮模型名…`);
            }
          }
        } else {
          this.identitySince = null;
          this.sig = null;
          if (p.generating || p.activity) {
            this.idleSince = null;
          } else if (this.idleSig !== p.responseSignature || this.idleSince == null) {
            this.idleSig = p.responseSignature;
            this.idleSince = this.now();
          } else if (this.now() - this.idleSince >= 60_000) {
            return '页面已停止生成，但始终拿不到可靠完成证据，已停止；不会自动重发';
          }
        }
        break;
      }

      case 'model':
        return this.modelTick(p);

      case 'rename': {
        const target = this.conversation;
        const model = this.model;
        if (!target || !model) return '本轮会话身份丢失，已停止';
        if (this.autoRename && model !== '模型家族未知' && model !== '指纹样本不足' && !model.startsWith('未识别')) {
          const title = buildTitle(model.replace(/（指纹推测）$/u, ''), '');
          if (!this.ok()) return null;
          let renameError: unknown = null;
          try {
            await this.api.renameConversation(target, title, () => this.ok());
          } catch (e) {
            renameError = e;
          }
          if (!this.ok()) return null;
          if (renameError) this.tell('rename', `模型已识别，但自动备注失败：${errorText(renameError)}`);
        }
        const note = this.note ? `；${this.note}` : '';
        this.rounds++;
        const rounds = this.rounds;
        const hit = !!this.targets.trim() && matchesTarget(model, this.targets);
        this.host.onRound({
          round: rounds,
          model,
          provider: this.provider,
          conversation: target,
          note: this.note,
          at: Date.now(),
          hit,
        });
        if (hit) return `抽到目标模型：${model}（第 ${rounds} 轮），已自动停止`;
        if (this.limit > 0 && rounds >= this.limit) {
          return `已完成 ${rounds}/${this.limit} 轮，抽模型结束；最后一轮：${model}${note}`;
        }
        this.go('roundPause');
        this.pauseUntil = this.now() + this.pauseMs;
        const secs = (this.pauseMs / 1000).toFixed(1);
        this.tell(
          'roundPause',
          this.limit > 0
            ? `第 ${rounds}/${this.limit} 轮完成：${model}${note}；${secs} 秒后开始下一轮`
            : `第 ${rounds} 轮完成：${model}${note}；${secs} 秒后开始下一轮`,
        );
        break;
      }

      default:
        break;
    }
    return null;
  }

  private setModel(model: string | null) {
    if (this.model === model) return;
    this.model = model;
    this.host.onModel(model);
  }

  private complete(model: string, provider: string | null, run: string | null) {
    this.setModel(model);
    this.provider = provider;
    this.host.log?.(`ROUND_MODEL round=${this.rounds + 1} run=${run ? 'present' : 'none'}`);
    this.go('rename');
    const via = provider && provider.trim() && provider !== model ? `（供应商 id：${provider}）` : '';
    const note = this.note ? `；${this.note}` : '';
    this.tell('rename', `本轮模型：${model}${via}${note}，准备下一轮`);
  }

  private async modelTick(p: PageView): Promise<string | null> {
    if (this.conversation && route(p.url) !== this.conversation) {
      await this.endCapture();
      if (!this.ok()) return null;
      return '读取模型期间会话发生变化，已停止；不会重发提示词';
    }
    if (this.fingerprint) {
      const result = await this.fingerprint.tick(p);
      if (!this.ok() || result.kind === 'pending') return null;
      if (result.kind === 'stop') {
        const family = this.model;
        await this.endCapture();
        return family && family !== '模型家族未知' ? `${result.reason}；此前工具调用家族判断：${family}` : result.reason;
      }
      if (result.candidateFamily) this.candidateCache.remember(result.candidateFamily, result.model);
      this.note = result.note;
      await this.endCapture();
      if (this.ok()) this.complete(result.model, result.provider, null);
      return null;
    }
    let snap: ProbeSnapshot | null = null;
    let probeError: string | null = null;
    try {
      snap = await this.api.probe();
    } catch (e) {
      probeError = errorText(e);
    }
    if (!this.ok()) return null;
    const waited = Math.floor((this.now() - this.since) / 1000);

    if (snap?.api) {
      this.probeMissing = null;
      const newRun = !!snap.runId && snap.runId !== this.baselineRun;
      // 探针自带的 SSE 指纹推测只作为显示提示，不能完成一轮。
      if (newRun && snap.name && snap.name.endsWith('（指纹推测）')) {
        this.inferredLabel = snap.name;
        this.inferredSource = 'sse-fingerprint';
        this.setModel(snap.name);
      }
    }

    let turn: TurnProbe | null = null;
    if (this.turnId) {
      try {
        turn = await this.api.snapshotTurn(this.turnId);
      } catch {
        turn = null;
      }
    }
    if (!this.ok()) return null;

    if (this.turnId && turn && turn.api && turn.turnId === this.turnId) {
      if (turn.routeMatched === false) {
        await this.endCapture();
        if (!this.ok()) return null;
        return '本轮模型证据关联的会话或路由发生变化，已安全停止；不会重发提示词';
      }
      if (turn.familyConflict) {
        this.candidateCache.clear();
        if (this.inferredLabel && this.model === this.inferredLabel) this.setModel(null);
        this.inferredLabel = null;
        this.inferredSource = null;
      }
      if (turn.mode === 'RESOLVED' && turn.captureBound && turn.routeMatched === true) {
        this.candidateCache.clear();
        const resolved = resolvedTurnModel(turn);
        await this.endCapture();
        if (!this.ok()) return null;
        if (resolved) {
          this.note = null;
          this.complete(resolved.name, resolved.provider, resolved.runId);
        } else {
          this.note = '官方身份已解决，但未取得可显示型号';
          this.complete('未识别（官方型号暂不可见）', null, turn.runId ?? null);
        }
        return null;
      }
      const family = familyFrom(turn.family);
      if (bound(turn, this.turnId) && !turn.familyConflict && turn.family) this.candidateCache.observe(turn.family);
      const selected = this.fingerprintEveryTurn || (!!family && this.fingerprintFamilies.includes(family));
      if (selected && !this.fingerprintEveryTurn && family && bound(turn, this.turnId) && !turn.familyConflict && turn.mode === 'INFERRED') {
        const cached = this.candidateCache.get(family);
        if (cached && ready(p, this.conversation ?? '') && waited >= 5) {
          this.note = '沿用本次运行同家族的指纹候选（推测）；非本轮重新评分';
          await this.endCapture();
          if (this.ok()) this.complete(cached, null, null);
          return null;
        }
        if (cached && waited < this.modelWaitSec) return null;
      }
      if (selected && eligible(turn, this.turnId, this.fingerprintFamilies, this.fingerprintEveryTurn) && ready(p, this.conversation ?? '')) {
        if (!this.fingerprintPorts) {
          this.note = '指纹模块不可用，未发送额外请求';
          await this.endCapture();
          if (this.ok()) this.complete(familyDisplayFromProbe(turn.family) ?? '模型家族未知', null, null);
          return null;
        }
        // The draw reader uses a DOM signature; the fingerprint reader uses a network
        // input/answer signature. Never carry a signature across those namespaces.
        const anchor = await this.fingerprintPorts.page.read(this.prompt).catch(() => null);
        if (!this.ok()) return null;
        if (anchor?.draft) {
          await this.endCapture();
          return '进入指纹细分前发现草稿，已停止并保留草稿；未发送挑战';
        }
        if (!anchor || !ready(anchor, this.conversation!)) {
          if (waited >= this.modelWaitSec) {
            await this.endCapture();
            return '当前回答尚未通过指纹读取通道确认，已停止；未发送挑战';
          }
          this.tell('model', `${this.roundLabel()}：等待当前回答的网络完成状态，尚未发送指纹挑战…`);
          return null;
        }
        // Tool-call family inference is independent of the three-family refinement selector.
        this.setModel(familyDisplayFromProbe(turn.family) ?? familyLabel(family));
        this.fingerprint = new FingerprintSession(this.fingerprintPorts.page, this.fingerprintPorts.service, {
          active: () => this.ok(), now: () => this.now(), say: message => this.tell('model', `${this.roundLabel()}：${message}`),
        }, { turnId: this.turnId, target: family, everyTurn: this.fingerprintEveryTurn,
          provider: turn.providerName ?? null, arena: turn.arenaName ?? null },
          this.conversation!, this.prompt, anchor.responseSignature!, this.noProgressMs);
        this.tell('model', `${this.roundLabel()}：准备本地指纹挑战 1/3…`);
        return null;
      }
      if (turn.mode === 'INFERRED' && !turn.familyConflict) {
        const label = familyDisplayFromProbe(turn.family);
        if (label) {
          const source = turn.familySource || 'current-turn-evidence';
          if (this.inferredLabel !== label) {
            this.inferredLabel = label;
            this.inferredSource = source;
            this.setModel(label);
            this.tell('model', `${this.roundLabel()}：本轮已推测为 ${label}，继续等待官方精确型号…`);
          }
          const settled = p.response && !p.generating && !p.activity;
          if (!selected && settled && waited >= this.familyWaitSec) {
            this.note = `本轮仅得到家族级推测（来源=${source}）`;
            await this.endCapture();
            if (!this.ok()) return null;
            this.complete(label, null, snap?.runId ?? null);
            return null;
          }
        }
      }
    }

    if (snap?.api) {
      if (waited >= this.modelWaitSec) {
        if (this.inferredLabel) {
          this.note = `官方型号等待超时，保留家族级推测（来源=${this.inferredSource ?? 'current-turn-evidence'}）`;
          await this.endCapture();
          if (!this.ok()) return null;
          this.complete(this.inferredLabel, null, snap.runId ?? null);
        } else {
          let reason: string;
          if (!snap.runId) reason = this.turnId ? '未取到 run 令牌；本轮家族证据未识别' : '未取到 run 令牌';
          else {
            const tag = safeTraceErrorTag(snap.lastError);
            reason = !tag ? 'run trace 未给出模型名' : `run trace 读取失败：${tag}`;
          }
          await this.endCapture();
          if (!this.ok()) return null;
          this.complete(`未识别（${reason}）`, null, snap.runId ?? null);
        }
        return null;
      }
    } else {
      const t = (this.probeMissing ??= this.now());
      if (this.now() - t >= PROBE_MISSING_MS) {
        this.host.log?.(`MODEL_PROBE_UNAVAILABLE waited_s=${waited} error=${probeError ?? 'none'}`);
        await this.endCapture();
        if (!this.ok()) return null;
        if (this.inferredLabel) {
          this.note = '模型读取探针失效；仅保留本轮家族级推测';
          this.complete(this.inferredLabel, null, null);
        } else {
          this.complete('未识别（探针未加载，请刷新页面）', null, null);
        }
        return null;
      }
    }

    const bucket = Math.floor(waited / 5);
    if (bucket !== this.sayBucket) {
      this.sayBucket = bucket;
      this.tell(
        'model',
        this.inferredLabel
          ? `${this.roundLabel()}：本轮已推测为 ${this.inferredLabel}，等待官方精确型号（已等 ${waited} 秒）`
          : `${this.roundLabel()}：回答已完成，正在读取本轮模型名…（已等 ${waited} 秒）`,
      );
    }
    return null;
  }
}

export function resolvedTurnModel(
  snap: TurnProbe,
): { name: string; provider: string | null; runId: string | null } | null {
  if (snap.mode !== 'RESOLVED') return null;
  const provider = snap.providerName?.trim() ? snap.providerName : snap.modelId?.trim() ? snap.modelId : null;
  const arena = snap.arenaName?.trim() ? snap.arenaName : null;
  const name = arena ?? provider;
  if (!name) return null;
  return { name, provider: provider ?? null, runId: snap.runId ?? null };
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : String(e);
}
