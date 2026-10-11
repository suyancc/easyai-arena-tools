import { readFamilyUnlessFingerprint } from '../utils/fingerprint/recovery-priority';
import type { FingerprintResult } from '../utils/fingerprint/result';
import { familyDisplayFromProbe } from '../utils/titles';
/**
 * arena.ai 页面内的控制器（隔离世界）。
 * 负责运行抽模型阶段机、发送鹈鹕测试、查询额度，并把状态广播给侧边栏。
 * 页面读写通过 public/injected/arena-rpc.js（主世界）转调桌面端同款脚本完成。
 */
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { annotateFingerprint, annotateToolFamily } from '../utils/fingerprint/annotate';
import { recoverFingerprint, type FingerprintHistory } from '../utils/fingerprint/recovery';
import { inspectManual, runManualFingerprint, type ManualContext } from '../utils/fingerprint/manual';
import { stableRouteRead } from '../utils/arena-route';
import { route } from '../utils/arena-route';
import { readPage, rpc } from '../utils/page-rpc';
import { sendPelican } from '../utils/pelican';
import { mergeQuota, normalizeAllowance, type PulseResponse } from '../utils/quota';
import { renameConversation } from '../utils/rename';
import { Runner, errorText, type PageApi } from '../utils/runner';
import { fingerprintPage } from '../utils/fingerprint/page-api';
import { createFingerprintClient } from '../utils/fingerprint/client';
import { normalizeSettings, validateSettings } from '../utils/settings';
import { HISTORY_LIMIT, historyItem, quotaItem } from '../utils/storage';
import type {
  BroadcastMessage,
  ContentRequest,
  DrawSettings,
  DrawState,
  Phase,
  ProbeSnapshot,
  ProbeTurnStart,
  QuotaView,
  Reply,
  TurnProbe,
} from '../utils/types';

const TICK_MS = 900;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function manualContext(claim: boolean): Promise<ManualContext> {
  const before = location.href;
  const context = await rpc<ManualContext>('fingerprintContext', [claim], 8000);
  if (!context?.page || !context.turnId || typeof context.prompt !== 'string') throw new Error('当前回合证据不可用');
  context.page.allowed = stableRouteRead(before, context.page.url, location.href);
  return context;
}

const pageApi: PageApi = {
  read: (prompt) => readPage(prompt),
  async action(name, prompt, expectedRoute) {
    const r = await rpc<{ error?: string } | null>('action', [name, prompt, expectedRoute]);
    if (r && typeof r.error === 'string') throw new Error(r.error);
    if (r == null) throw new Error('操作结果未确认');
  },
  clickChoice: async () => (await rpc<string>('choice', [], 5000).catch(() => 'error')) === 'clicked',
  probe: () => rpc<ProbeSnapshot>('probe', [], 8000),
  beginTurn: (id) => rpc<ProbeTurnStart>('beginTurn', [id], 5000),
  async snapshotTurn(id) {
    const v = await rpc<(TurnProbe & { probeError?: string }) | null>('snapshotTurn', [id], 8000);
    if (v && typeof v.probeError === 'string') throw new Error(v.probeError);
    return v;
  },
  endTurn: async (id) => {
    await rpc('endTurn', [id], 5000);
  },
  renameConversation: (target, title, isActive) =>
    renameConversation((a, v, t) => rpc<Record<string, unknown>>('rename', [a, v, t], 10_000), target, title, isActive),
  stamp: () => rpc<string>('stamp', [], 5000),
};

class ArenaController {
  private state: DrawState = {
    running: false,
    manual: false,
    phase: 'idle',
    message: '准备就绪：打开 arena.ai 的 Agent / Work 对话页后即可开始抽模型',
    rounds: 0,
    limit: 0,
    model: null,
    lastStop: null,
    history: [],
    url: location.href,
    probeReady: false,
  };
  private epoch = 0;
  private runner: Runner | null = null;
  private lastAutoQuota = 0;
  private manualRoute: string | null = null;
  private recovering = false;
  private familyAnnotationKey: string | null = null;
  private recoveryAgain = false;
  private recoverySettled = false;
  private recoverySuppressed = false;
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly ctx: ContentScriptContext) {}

  start() {
    browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
      const req = msg as ContentRequest | null;
      if (!req || typeof req !== 'object' || !['state:get', 'draw:start', 'draw:stop', 'fingerprint:check', 'fingerprint:start', 'fingerprint:stop', 'pelican:send', 'quota:query', 'history:clear'].includes(req.type)) return;
      if (!this.ctx.isValid) return;
      this.handle(req).then(
        (data) => sendResponse({ ok: true, data } satisfies Reply<unknown>),
        (e) => sendResponse({ ok: false, error: errorText(e) } satisfies Reply<unknown>),
      );
      return true;
    });
    this.ctx.onInvalidated(() => {
      this.epoch++;
      clearTimeout(this.recoveryTimer);
      this.state.running = false;
    });
    this.ctx.addEventListener(window, 'wxt:locationchange', () => {
      if (this.state.manualKind === 'fingerprint' && this.manualRoute && route(location.href) !== this.manualRoute) this.stopFingerprint('会话已切换，指纹探测停止');
      const expected = this.runner?.fingerprintRoute;
      if (expected && route(location.href) !== expected && this.state.running) {
        this.stopWith(this.epoch, '指纹识别期间切换了会话，已停止并丢弃未完成样本');
        void this.runner?.endCapture();
      }
      this.state.url = location.href;
      this.recoverySettled = false; this.recoverySuppressed = false;
      this.scheduleRecovery();
      this.publish();
    });
    this.ctx.addEventListener(window, 'arena:fingerprint-state', () => this.scheduleRecovery());
    this.ctx.addEventListener(window, 'pageshow', () => this.scheduleRecovery());
    this.ctx.addEventListener(document, 'visibilitychange', () => { if (!document.hidden) this.scheduleRecovery(); });
    void this.checkProbe();
  }

  private async checkProbe() {
    for (let i = 0; i < 10 && this.ctx.isValid; i++) {
      const r = await rpc<{ probe: boolean; companion: boolean }>('ping', [], 3000).catch(() => null);
      if (r?.probe && r.companion) {
        this.state.probeReady = true;
        this.scheduleRecovery();
        // Bounded startup retries cover React mounting after the initial snapshot.
        for (const delay of [1000, 3000, 7000]) this.ctx.setTimeout(() => this.scheduleRecovery(), delay);
        this.publish();
        return;
      }
      await sleep(1000);
    }
  }

  private scheduleRecovery() {
    if (this.recovering) { this.recoveryAgain = true; return; }
    if (this.recoveryTimer || !this.ctx.isValid || !this.state.probeReady || this.recoverySettled || this.recoverySuppressed) return;
    this.recoveryTimer = setTimeout(() => { this.recoveryTimer = undefined; void this.recoverFingerprint(); }, 200);
  }

  private async recoverFingerprint() {
    if (this.recovering || this.state.running || this.state.manual || this.recoverySettled || this.recoverySuppressed || document.hidden) return;
    const expected = route(location.href), epoch = this.epoch;
    if (!expected) return;
    const active = () => this.ctx.isValid && this.epoch === epoch && route(location.href) === expected && !this.state.running && !this.state.manual && !document.hidden && !this.recoverySuppressed;
    this.recovering = true;
    let recovered: FingerprintResult | null = null;
    const restoreFamily = async () => {
      const family = await readFamilyUnlessFingerprint(recovered, active, () =>
        rpc<{ family: string; signature: string } | null>('historicalToolFamily', [], 8000).catch(() => null));
      const label = familyDisplayFromProbe(family?.family);
      if (!active() || !label) return false;
      this.state.model = label;
      const key = `${expected}:${family!.signature}:${family!.family}`;
      if (this.familyAnnotationKey === key) return true;
      // Mark before awaiting: self-triggered refresh events must not repeat an uncertain save.
      this.familyAnnotationKey = key;
      await annotateToolFamily(family!.family, expected, { active, rename: pageApi.renameConversation,
        say: message => { if (active()) this.say('idle', message); } });
      return true;
    };
    try {
      const status = await recoverFingerprint(expected, {
        active,
        history: () => rpc<FingerprintHistory | null>('fingerprintHistory', [], 8000),
        page: prompt => fingerprintPage.read(prompt), service: createFingerprintClient(),
        known: async key => {
          const record = (await historyItem.getValue()).find(r => r.fingerprintKey === key && r.conversation === expected);
          return record ? { kind: 'done', model: record.model, provider: record.provider, note: record.note ?? null } : null;
        },
        save: async (key, result) => {
          if (!active()) return;
          const all = await historyItem.getValue();
          if (!active()) return;
          const record = { kind: 'fingerprint' as const, round: 0, model: result.model, provider: result.provider,
            conversation: expected, fingerprintKey: key, note: result.note, at: Date.now(), hit: false };
          if (!all.some(r => r.fingerprintKey === key)) await historyItem.setValue([record, ...all].slice(0, HISTORY_LIMIT));
          if (active()) this.state.history = [record, ...this.state.history.filter(r => r.fingerprintKey !== key)].slice(0, 50);
        },
        show: async result => {
          if (!active()) return;
          recovered = result;
          this.state.model = result.model;
          await annotateFingerprint(result, expected, { active, rename: pageApi.renameConversation,
            say: message => { if (active()) this.say('idle', message); } });
        },
        say: text => { if (active()) this.say('model', text); },
      });
      // Fingerprint (fresh or cached) wins; no vendor RPC when it succeeded.
      await restoreFamily();
      if (active()) this.recoverySettled = status === 'restored' || status === 'scored';
      console.debug('[arena-fingerprint-recovery]', status);
    } catch {
      if (active()) {
        this.recoverySettled = true; // Never silently loop on a failed local score.
        const restored = await restoreFamily();
        if (active() && !restored && !recovered) this.say('idle', '指纹恢复未完成，且当前没有可用的工具调用厂商结果；可刷新重试，不会自动重发题目');
      }
    } finally {
      this.recovering = false;
      if (this.recoveryAgain) { this.recoveryAgain = false; this.scheduleRecovery(); }
    }
  }

  private async handle(req: ContentRequest): Promise<unknown> {
    if (['draw:start', 'fingerprint:start', 'pelican:send'].includes(req.type)) {
      const registration = await browser.runtime.sendMessage({ type: 'registration:busy' });
      if (registration?.running) throw new Error('请先停止注册任务，再执行模型操作');
    }
    switch (req.type) {
      case 'state:get':
        this.state.url = location.href;
        return this.snapshot();
      case 'draw:start':
        return this.startDraw(req.settings);
      case 'draw:stop':
        void browser.runtime.sendMessage({ type: 'captcha:cancel' }).catch(() => {});
        return this.stopDraw();
      case 'fingerprint:check':
        if (this.state.running || this.state.manual) throw new Error('请先停止当前任务');
        return inspectManual(await manualContext(false));
      case 'fingerprint:start':
        return this.startFingerprint(req.turnId);
      case 'fingerprint:stop':
        void browser.runtime.sendMessage({ type: 'captcha:cancel' }).catch(() => {});
        return this.stopFingerprint();
      case 'pelican:send':
        return this.pelican();
      case 'quota:query':
        return this.queryQuota();
      case 'history:clear':
        this.state.history = [];
        await historyItem.setValue([]);
        this.publish();
        return this.snapshot();
      default:
        throw new Error('未知请求');
    }
  }

  private snapshot(): DrawState {
    return { ...this.state, history: [...this.state.history] };
  }

  private publish() {
    const message: BroadcastMessage = { type: 'arena:state', state: this.snapshot() };
    browser.runtime.sendMessage(message).catch(() => undefined);
  }

  private say(phase: Phase, message: string) {
    const shown =
      !this.state.running && this.state.lastStop && !message.includes(this.state.lastStop)
        ? `${message}（上次停止：${this.state.lastStop}）`
        : message;
    if (this.state.phase === phase && this.state.message === shown) return;
    this.state.phase = phase;
    this.state.message = shown;
    console.debug('[arena-web-tools]', `[${phase}]`, shown);
    this.publish();
  }

  // ───────────── 抽模型 ─────────────
  private startDraw(input: DrawSettings): DrawState {
    const settings = normalizeSettings(input);
    const invalid = validateSettings(settings);
    if (invalid) throw new Error(invalid);
    if (this.state.manual) throw new Error('正在发送测试，请稍后再开始');
    if (this.state.running) return this.snapshot();
    if (!route(location.href)) {
      throw new Error('请先在此标签页打开 arena.ai/agent 或 arena.ai/work 对话页');
    }
    const epoch = ++this.epoch;
    Object.assign(this.state, {
      running: true,
      rounds: 0,
      limit: settings.limit,
      lastStop: null,
      phase: 'inspect' as Phase,
      message: '正在检查页面，请稍候…',
    });
    const active = () => this.ctx.isValid && this.state.running && this.epoch === epoch;
    this.runner = new Runner(pageApi, {
      say: (phase, message) => active() && this.say(phase, message),
      isActive: active,
      onModel: (model) => {
        if (!active()) return;
        this.state.model = model;
        this.publish();
      },
      onRound: (record) => {
        if (!active()) return;
        this.state.rounds = record.round;
        this.state.model = record.model;
        this.state.history = [record, ...this.state.history].slice(0, 50);
        void historyItem.getValue().then((all) => historyItem.setValue([record, ...all].slice(0, HISTORY_LIMIT)));
        this.publish();
        void this.autoQuota();
      },
      now: () => Date.now(),
      uuid: () => crypto.randomUUID(),
      log: (line) => console.debug('[arena-web-tools]', line),
    }, settings, settings.targetKeywords, settings.autoRename, { page: fingerprintPage, service: createFingerprintClient() });
    this.publish();
    void this.loop(epoch, this.runner, active);
    return this.snapshot();
  }

  private async loop(epoch: number, runner: Runner, active: () => boolean) {
    while (active()) {
      await sleep(TICK_MS);
      if (!active()) break;
      let stop: string | null;
      try {
        stop = await runner.tick();
      } catch (e) {
        stop = `内部错误：${errorText(e)}，已停止`;
      }
      if (stop && active()) {
        await runner.endCapture();
        console.info('[arena-web-tools] PAGE', runner.lastPage);
        this.stopWith(epoch, stop);
        break;
      }
    }
    if (this.runner === runner && !this.state.running) {
      await runner.endCapture();
      this.runner = null;
    }
  }

  private stopWith(epoch: number, message: string) {
    if (this.epoch !== epoch || !this.state.running) return;
    this.state.running = false;
    this.epoch++;
    this.state.phase = 'idle';
    this.state.message = message;
    this.state.lastStop = message;
    this.publish();
  }

  private stopDraw(): DrawState {
    if (this.state.running) {
      this.state.running = false;
      this.epoch++;
      this.state.phase = 'idle';
      this.state.message = `已停止抽模型，本次完成 ${this.state.rounds} 轮；已提交的请求不会撤回`;
      this.state.lastStop = null;
      const runner = this.runner;
      this.runner = null;
      void runner?.endCapture();
      this.publish();
    }
    return this.snapshot();
  }

  // Manual ownership remains locked until async cleanup completes, preventing
  // an old finally/release from ending a newly started capture.
  private startFingerprint(turnId: string): DrawState {
    this.recoverySuppressed = true;
    if (this.state.running || this.state.manual) throw new Error('请先停止当前任务');
    if (!turnId || turnId.length > 128) throw new Error('回合标识无效');
    const epoch = ++this.epoch;
    this.state.manual = true;
    this.state.manualKind = 'fingerprint';
    this.state.lastStop = null;
    this.manualRoute = route(location.href);
    this.say('model', '正在校验当前会话…');
    const active = () => this.ctx.isValid && this.epoch === epoch && this.state.manual;
    void (async () => {
      try {
        const result = await runManualFingerprint({
          context: manualContext, release: async () => { await rpc('fingerprintRelease', [], 5000); },
          page: fingerprintPage, service: createFingerprintClient(), sleep,
        }, { active, now: () => Date.now(), say: text => { if (active()) this.say('model', text); } }, turnId, 300_000);
        if (!active()) return;
        if (result.kind === 'stop') throw new Error(result.reason);
        if (result.kind === 'done') {
          this.state.model = result.model;
          const record = { kind: 'fingerprint' as const, round: 0, model: result.model, provider: result.provider,
            conversation: this.manualRoute, note: result.note, at: Date.now(), hit: false };
          this.state.history = [record, ...this.state.history].slice(0, 50);
          await historyItem.setValue([record, ...await historyItem.getValue()].slice(0, HISTORY_LIMIT));
          const expected = this.manualRoute;
          if (active() && expected) await annotateFingerprint(result, expected, {
            active: () => active() && route(location.href) === expected,
            rename: pageApi.renameConversation,
            say: message => { if (active()) this.say('idle', message); },
          });
        }
      } catch (e) {
        if (active()) { this.state.lastStop = errorText(e); this.say('idle', errorText(e)); }
      } finally {
        if (this.epoch !== epoch && this.state.message.startsWith('正在停止')) this.state.message = '指纹探测已停止';
        this.state.manual = false; this.state.manualKind = null; this.manualRoute = null;
        this.publish(); void this.autoQuota();
      }
    })();
    return this.snapshot();
  }

  private stopFingerprint(message = '正在停止探测，已发送的请求不会撤回'): DrawState {
    this.recoverySuppressed = true;
    if (this.state.manualKind === 'fingerprint') {
      this.epoch++;
      this.state.phase = 'idle'; this.state.message = message; this.state.lastStop = null;
      this.publish();
    }
    return this.snapshot();
  }

  // ───────────── 鹈鹕测试 ─────────────
  private async pelican(): Promise<DrawState> {
    if (this.state.running) throw new Error('请先停止抽模型，再发送鹈鹕骑车测试');
    if (this.state.manual) throw new Error('正在发送测试，请勿重复点击');
    this.state.manual = true;
    this.state.manualKind = 'pelican';
    this.say('send', '正在检查当前会话，准备发送鹈鹕骑车测试…');
    try {
      await sendPelican({
        read: (prompt) => readPage(prompt),
        pelican: (action, target, token, prompt) =>
          rpc<Record<string, unknown> | null>('pelican', [action, target, token, prompt], 10_000),
        uuid: () => crypto.randomUUID().replace(/-/g, ''),
        sleep,
      });
      this.state.manual = false;
      this.state.manualKind = null;
      this.say('idle', '鹈鹕骑车测试已发送，请在页面中查看结果（不会自动重发）');
      return this.snapshot();
    } catch (e) {
      this.state.manual = false;
      this.state.manualKind = null;
      this.say('idle', `鹈鹕骑车测试未发送：${errorText(e)}`);
      throw e;
    }
  }

  // ───────────── 额度 ─────────────
  private async queryQuota(): Promise<QuotaView> {
    const [pulse, allowance] = await Promise.all([
      rpc<PulseResponse>('pulse', [], 10_000).catch(() => ({ status: 0, pulse: null, refreshedAt: null })),
      rpc<unknown>('allowance', [], 5000).catch(() => null),
    ]);
    const previous = await quotaItem.getValue();
    const q = mergeQuota(previous, pulse, 'page', normalizeAllowance(allowance));
    await quotaItem.setValue(q);
    const message: BroadcastMessage = { type: 'arena:quota', quota: q };
    browser.runtime.sendMessage(message).catch(() => undefined);
    return q;
  }

  private async autoQuota() {
    if (Date.now() - this.lastAutoQuota < 15_000) return;
    this.lastAutoQuota = Date.now();
    await this.queryQuota().catch(() => undefined);
  }
}

export default defineContentScript({
  matches: ['https://arena.ai/*'],
  runAt: 'document_idle',
  main(ctx) {
    new ArenaController(ctx).start();
  },
});
