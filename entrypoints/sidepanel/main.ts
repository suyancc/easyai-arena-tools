import './style.css';
import { installCaptchaSettings } from './captcha-settings';
installCaptchaSettings();
import { bindCommunityCopy } from './community';
import { installRegistrationPanel } from './registration';
import { renderHistoryList } from './history';
import { compactStatus, modelPresentation, quotaPresentation } from './presentation';
import { fillFingerprintSettings, readFingerprintSettings } from './fingerprint-settings';
import { browser, type Browser } from 'wxt/browser';
import { ARENA_MATCH, DEFAULT_ARENA_URL, created, isArenaUrl, route } from '../../utils/arena-route';
import { mergeQuota, type PulseResponse } from '../../utils/quota';
import { DEFAULT_SETTINGS, normalizeSettings, validateSettings } from '../../utils/settings';
import { historyItem, quotaItem, settingsItem } from '../../utils/storage';
import type {
  BroadcastMessage,
  ContentRequest,
  DrawSettings,
  DrawState,
  Phase,
  QuotaView,
  Reply,
  RoundRecord,
} from '../../utils/types';

type Tab = Browser.tabs.Tab;
type Conn = 'none' | 'loading' | 'ready' | 'reload' | 'permission';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
bindCommunityCopy($<HTMLButtonElement>('#community-copy'), $('#community-copy-status'));
const PHASE_LABEL: Record<Phase, string> = {
  idle: '空闲',
  inspect: '检查页面',
  new: '开新对话',
  waitNew: '开新对话',
  fill: '填写提示词',
  send: '发送中',
  observe: '等待回答',
  model: '读取模型',
  rename: '备注会话',
  roundPause: '轮间隔',
};

const ui = {
  tabInfo: $('#tab-info'),
  conn: $('#conn'),
  banner: $('#banner'),
  bannerText: $('#banner-text'),
  bannerAction: $<HTMLButtonElement>('#banner-action'),
  quotaBody: $('#quota-body'),
  quotaRefresh: $<HTMLButtonElement>('#quota-refresh'),
  drawPhase: $('#draw-phase'),
  drawRounds: $('#draw-rounds'),
  drawModel: $('#draw-model'),
  drawMessage: $('#draw-message'),
  drawStart: $<HTMLButtonElement>('#draw-start'),
  drawStop: $<HTMLButtonElement>('#draw-stop'),
  form: $<HTMLFormElement>('#settings-form'),
  settingsReset: $<HTMLButtonElement>('#settings-reset'),
  settingsSaved: $('#settings-saved'),
  historyList: $<HTMLOListElement>('#history-list'),
  historyCount: $('#history-count'),
  historyClear: $<HTMLButtonElement>('#history-clear'),
  fingerprintStart: $<HTMLButtonElement>('#fingerprint-start'),
  mainView: $('#main-view'),
  settingsView: $('#settings-view'),
  settingsToggle: $<HTMLButtonElement>('#settings-toggle'),
  settingsBack: $<HTMLButtonElement>('#settings-back'),
  modelKind: $('#model-kind'),
  pelicanSend: $<HTMLButtonElement>('#pelican-send'),
};

let target: Tab | null = null;
let conn: Conn = 'loading';
let draw: DrawState | null = null;
let quota: QuotaView | null = null;
let history: RoundRecord[] = [];
let settings: DrawSettings = DEFAULT_SETTINGS;
let busy = { start: false, stop: false, pelican: false, fingerprint: false, quota: false };
let localMessage: string | null = null;
let settingsOpen = false;
let registrationRunning = false;

// ───────────── 目标标签页 ─────────────
async function hasPermission(): Promise<boolean> {
  try {
    return await browser.permissions.contains({ origins: [ARENA_MATCH] });
  } catch {
    return true;
  }
}

async function findTarget(): Promise<Tab | null> {
  const [active] = await browser.tabs.query({ active: true, currentWindow: true });
  if (active?.id != null && isArenaUrl(active.url)) return active;
  const tabs = (await browser.tabs.query({ url: ARENA_MATCH })).filter((t) => t.id != null);
  if (!tabs.length) return null;
  const inWindow = tabs.filter((t) => t.windowId === active?.windowId);
  const pool = inWindow.length ? inWindow : tabs;
  return pool.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0] ?? null;
}

async function send<T>(req: ContentRequest): Promise<T> {
  if (target?.id == null) throw new Error('没有可用的 arena.ai 标签页');
  let reply: Reply<T> | undefined;
  try {
    reply = (await browser.tabs.sendMessage(target.id, req)) as Reply<T> | undefined;
  } catch {
    conn = 'reload';
    render();
    throw new Error('无法连接页面脚本，请刷新该 arena.ai 页面后重试');
  }
  if (!reply) throw new Error('页面没有响应，请刷新 arena.ai 页面');
  if (!reply.ok) throw new Error(reply.error);
  return reply.data;
}

let resolving = false;
async function resolveTarget() {
  if (resolving) return;
  resolving = true;
  try {
    if (!(await hasPermission())) {
      target = null;
      conn = 'permission';
      draw = null;
      return;
    }
    const next = await findTarget();
    const changed = next?.id !== target?.id;
    target = next;
    if (!target) {
      conn = 'none';
      draw = null;
      return;
    }
    if (changed) draw = null;
    try {
      draw = await send<DrawState>({ type: 'state:get' });
      conn = 'ready';
    } catch {
      conn = 'reload';
    }
  } finally {
    resolving = false;
    render();
  }
}

// ───────────── 额度 ─────────────
async function refreshQuota(manual = false) {
  if (busy.quota) return;
  busy.quota = true;
  render();
  try {
    if (conn === 'ready') {
      quota = await send<QuotaView>({ type: 'quota:query' });
    } else {
      const r = (await browser.runtime.sendMessage({ type: 'quota:direct' })) as Reply<PulseResponse> | undefined;
      if (!r || !r.ok) throw new Error(r && !r.ok ? r.error : '后台没有响应');
      quota = mergeQuota(await quotaItem.getValue(), r.data, 'direct', null);
      await quotaItem.setValue(quota);
    }
  } catch (e) {
    if (manual) quota = { ...(quota ?? (await quotaItem.getValue()) ?? emptyQuota()), error: (e as Error).message };
  } finally {
    busy.quota = false;
    render();
  }
}

function emptyQuota(): QuotaView {
  return { pulse: null, refreshedAt: null, checkedAt: null, error: null, allowance: null, source: null };
}

function renderQuota() {
  const q = quotaPresentation(quota);
  ui.quotaBody.innerHTML = `<div class="quota-track" role="progressbar" aria-label="剩余额度" aria-valuemin="0" aria-valuemax="100" ${q.value === null ? 'aria-valuetext="暂无数据"' : `aria-valuenow="${q.value}"`}><div class="quota-fill ${q.level}" style="width:${q.value ?? 0}%"></div></div><span class="quota-number${q.stale ? ' stale' : ''}">${q.label}${q.stale ? '*' : ''}</span>`;
  ui.quotaBody.title = q.stale ? '刷新失败，显示上次结果' : q.value === null ? '额度尚未读取' : '剩余额度';
  ui.quotaRefresh.disabled = busy.quota;
  ui.quotaRefresh.setAttribute('aria-busy', String(busy.quota));
}

// ───────────── 设置 ─────────────
type FormFields = Record<keyof DrawSettings, HTMLInputElement | HTMLTextAreaElement>;
const formFields = () => ui.form.elements as unknown as FormFields;

function fillForm(s: DrawSettings) {
  fillFingerprintSettings(ui.form, s);
  const f = formFields();
  f.prompt.value = s.prompt;
  f.limit.value = String(s.limit);
  f.roundPauseSeconds.value = String(s.roundPauseSeconds);
  f.modelWaitSeconds.value = String(s.modelWaitSeconds);
  f.familyWaitSeconds.value = String(s.familyWaitSeconds);
  f.noProgressSeconds.value = String(s.noProgressSeconds);
  f.targetKeywords.value = s.targetKeywords;
  (f.autoRename as HTMLInputElement).checked = s.autoRename;
}

function readForm(): DrawSettings {
  const f = formFields();
  return normalizeSettings({
    ...readFingerprintSettings(ui.form),
    prompt: f.prompt.value,
    limit: Number(f.limit.value),
    roundPauseSeconds: Number(f.roundPauseSeconds.value),
    modelWaitSeconds: Number(f.modelWaitSeconds.value),
    familyWaitSeconds: Number(f.familyWaitSeconds.value),
    noProgressSeconds: Number(f.noProgressSeconds.value),
    targetKeywords: f.targetKeywords.value,
    autoRename: (f.autoRename as HTMLInputElement).checked,
  });
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    settings = readForm();
    await settingsItem.setValue(settings);
    ui.settingsSaved.textContent = '已自动保存';
    setTimeout(() => (ui.settingsSaved.textContent = ''), 1500);
  }, 400);
}

// ───────────── 渲染 ─────────────
function setBanner(text: string | null, action?: { label: string; run: () => void }) {
  ui.banner.hidden = !text;
  if (!text) return;
  ui.bannerText.textContent = text;
  ui.bannerAction.hidden = !action;
  if (action) {
    ui.bannerAction.textContent = action.label;
    ui.bannerAction.onclick = action.run;
  }
}

function renderHistory() {
  renderHistoryList(ui.historyList, history);
  ui.historyCount.textContent = history.length ? String(Math.min(history.length, 50)) : '';
  ui.historyClear.disabled = !history.length;
}

function setSettings(open: boolean) {
  if (open) registrationPanel.close();
  settingsOpen = open;
  document.body.classList.toggle('settings-open', open);
  ui.mainView.hidden = open;
  ui.settingsView.hidden = !open;
  ui.settingsToggle.setAttribute('aria-expanded', String(open));
  ui.settingsToggle.title = open ? '返回主面板' : '设置';
  if (open) ui.settingsBack.focus(); else ui.settingsToggle.focus();
}
ui.settingsToggle.onclick = () => setSettings(!settingsOpen);
ui.settingsBack.onclick = () => setSettings(false);
const registrationPanel = installRegistrationPanel({
  settings: () => setSettings(true),
  beforeOpen: () => setSettings(false),
  canStart: () => !draw?.running && !draw?.manual && !busy.start && !busy.fingerprint && !busy.pelican,
  running: value => { if (registrationRunning !== value) { registrationRunning = value; render(); } },
});

function render() {
  // 连接状态
  const chip = ui.conn;
  chip.className = 'connection';
  switch (conn) {
    case 'ready':
      chip.classList.add(draw?.probeReady === false ? 'warn' : 'ok');
      chip.textContent = draw?.probeReady === false ? '探针加载中' : '已连接';
      break;
    case 'loading':
      chip.textContent = '连接中';
      break;
    case 'reload':
      chip.classList.add('warn');
      chip.textContent = '需刷新';
      break;
    case 'permission':
      chip.classList.add('bad');
      chip.textContent = '未授权';
      break;
    default:
      chip.classList.add('bad');
      chip.textContent = '未打开';
  }
  ui.tabInfo.title = target
    ? `${route(target.url) ? '对话页' : 'arena.ai'} · ${target.title || target.url || ''}`
    : '未找到 arena.ai 标签页';
  if (conn === 'permission') {
    setBanner('需要访问 arena.ai 的权限', {
      label: '授权',
      run: () => {
        void browser.permissions.request({ origins: [ARENA_MATCH] }).then(() => resolveTarget());
      },
    });
  } else if (conn === 'none') {
    setBanner('当前没有打开 arena.ai。', {
      label: '打开 arena.ai',
      run: () => void browser.tabs.create({ url: DEFAULT_ARENA_URL }),
    });
  } else if (conn === 'reload') {
    setBanner('插件已更新，请刷新页面', {
      label: '刷新页面',
      run: () => {
        if (target?.id != null) void browser.tabs.reload(target.id).then(() => setTimeout(resolveTarget, 1500));
      },
    });
  } else if (conn === 'ready' && target && !route(target.url) && !draw?.running) {
    setBanner('请打开 Agent / Work 会话', {
      label: '前往 /work',
      run: () => {
        if (target?.id != null) void browser.tabs.update(target.id, { url: DEFAULT_ARENA_URL });
      },
    });
  } else {
    setBanner(null);
  }

  const d = draw;
  const ready = conn === 'ready' && !!d;
  const running = !!d?.running, manual = !!d?.manual;
  const pendingAction = busy.start || busy.fingerprint || busy.pelican;
  const locked = running || manual || pendingAction || registrationRunning;
  const canAct = ready && d?.probeReady !== false && !locked && !!route(target?.url);
  ui.drawPhase.className = 'phase' + (running || manual ? ' run' : '');
  ui.drawPhase.textContent = running ? PHASE_LABEL[d!.phase] ?? '运行中' : manual ? d?.manualKind === 'fingerprint' ? '指纹' : '发送中' : '就绪';
  ui.drawRounds.textContent = d ? d.limit > 0 && running ? `${d.rounds}/${d.limit}` : `${d.rounds} 轮` : '0 轮';
  const model = modelPresentation(d?.model);
  ui.drawModel.textContent = model.name;
  ui.drawModel.title = model.full;
  ui.modelKind.textContent = model.kind;
  ui.modelKind.className = `badge ${model.className}`;
  ui.modelKind.hidden = !model.kind;
  const message = localMessage ?? (ready ? d!.message : '');
  ui.drawMessage.textContent = compactStatus(message);
  ui.drawMessage.title = message;
  ui.drawMessage.className = 'status' + (localMessage || (d?.lastStop && !d.lastStop.startsWith('已完成') && !d.lastStop.startsWith('抽到目标')) ? ' err' : '');
  const stoppable = running || (manual && d?.manualKind === 'fingerprint');
  ui.drawStart.textContent = busy.stop ? '正在停止…' : stoppable ? (running ? '停止抽模型' : '停止探测') : '开始抽模型';
  ui.drawStart.classList.toggle('stop-action', stoppable);
  ui.drawStart.disabled = stoppable ? !ready || busy.stop : !canAct;
  ui.fingerprintStart.disabled = !canAct || !created(target?.url);
  ui.fingerprintStart.title = created(target?.url) ? '在当前对话执行三题探测' : '请先打开已有对话';
  ui.pelicanSend.disabled = !canAct;
  ui.drawStart.setAttribute('aria-busy', String(busy.start || busy.stop));
  ui.fingerprintStart.setAttribute('aria-busy', String(busy.fingerprint));
  ui.pelicanSend.setAttribute('aria-busy', String(busy.pelican));
  ui.drawStop.hidden = !stoppable;
  ui.drawStop.disabled = !ready || busy.stop || !stoppable;
  for (const el of Array.from(ui.form.elements) as HTMLInputElement[]) el.disabled = locked;
  ui.settingsReset.disabled = locked;
  renderQuota();
  renderHistory();
}

// ───────────── 事件 ─────────────
ui.drawStart.onclick = async () => {
  if (draw?.running || (draw?.manual && draw.manualKind === 'fingerprint')) { await stopCurrentTask(); return; }
  if (busy.start || busy.fingerprint || busy.pelican) return;
  const targetId = target?.id;
  busy.start = true; localMessage = null; render();
  try {
    clearTimeout(saveTimer);
    settings = readForm();
    const invalid = validateSettings(settings);
    if (invalid) throw new Error(invalid);
    await settingsItem.setValue(settings);
    if (target?.id !== targetId) throw new Error('目标标签页已变化，请重新开始');
    draw = await send<DrawState>({ type: 'draw:start', settings });
  } catch (e) { localMessage = (e as Error).message; }
  finally { busy.start = false; render(); }
};

ui.drawStop.onclick = stopCurrentTask;

async function stopCurrentTask() {
  if (busy.stop) return;
  busy.stop = true; localMessage = null; render();
  try { draw = await send<DrawState>({ type: draw?.manualKind === 'fingerprint' ? 'fingerprint:stop' : 'draw:stop' }); }
  catch (e) { localMessage = (e as Error).message; }
  finally { busy.stop = false; render(); }
}

ui.fingerprintStart.onclick = async () => {
  if (busy.fingerprint || busy.start || busy.pelican) return;
  busy.fingerprint = true; localMessage = null; render();
  const targetId = target?.id;
  try {
    const check = await send<{ turnId: string; route: string; official: { model: string } | null }>({ type: 'fingerprint:check' });
    if (target?.id !== targetId || route(target?.url) !== check.route) throw new Error('目标会话已变化，请重新探测');
    draw = await send<DrawState>({ type: 'fingerprint:start', turnId: check.turnId });
  } catch (e) { localMessage = (e as Error).message; }
  finally { busy.fingerprint = false; render(); }
};

ui.pelicanSend.onclick = async () => {
  if (busy.pelican || busy.start || busy.fingerprint) return;
  busy.pelican = true; localMessage = null; render();
  try { draw = await send<DrawState>({ type: 'pelican:send' }); }
  catch (e) { localMessage = (e as Error).message; }
  finally { busy.pelican = false; render(); }
};

ui.quotaRefresh.onclick = () => void refreshQuota(true);

ui.historyClear.onclick = async (event) => {
  event.preventDefault();
  event.stopPropagation();
  await historyItem.setValue([]);
  if (conn === 'ready') await send({ type: 'history:clear' }).catch(() => undefined);
};

ui.historyList.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a[data-open]') as HTMLAnchorElement | null;
  if (!a) return;
  e.preventDefault();
  const url = a.dataset.open!;
  if (target?.id != null && !draw?.running && !draw?.manual) void browser.tabs.update(target.id, { url, active: true });
  else void browser.tabs.create({ url });
});

ui.form.addEventListener('input', scheduleSave);
ui.form.addEventListener('change', scheduleSave);
ui.form.addEventListener('submit', (e) => e.preventDefault());
ui.settingsReset.onclick = async () => {
  clearTimeout(saveTimer);
  settings = normalizeSettings(DEFAULT_SETTINGS);
  fillForm(settings);
  await settingsItem.setValue(settings);
};

browser.runtime.onMessage.addListener((msg: unknown, sender) => {
  const m = msg as BroadcastMessage | null;
  if (!m || typeof m !== 'object') return;
  if (m.type === 'arena:state') {
    if (sender.tab?.id != null && sender.tab.id === target?.id) {
      draw = m.state;
      localMessage = null;
      if (conn !== 'ready') conn = 'ready';
      render();
    }
  } else if (m.type === 'arena:quota') {
    quota = m.quota;
    render();
  }
});

browser.tabs.onActivated.addListener(() => void resolveTarget());
browser.tabs.onRemoved.addListener((id) => {
  if (id === target?.id) void resolveTarget();
});
browser.tabs.onUpdated.addListener((id, info, tab) => {
  if (info.status === 'complete' || info.url) {
    if (id === target?.id || (tab.active && isArenaUrl(tab.url))) {
      if (id === target?.id && info.url) target = { ...target!, url: info.url };
      setTimeout(() => void resolveTarget(), info.status === 'complete' ? 600 : 0);
    }
  }
});
browser.permissions?.onAdded?.addListener(() => void resolveTarget());

quotaItem.watch((q) => {
  quota = q;
  render();
});
historyItem.watch((h) => {
  history = h ?? [];
  renderHistory();
});

// 额度：面板可见时每 60 秒自动刷新一次（网站对频繁查询会限速）。
setInterval(() => {
  if (document.visibilityState === 'visible' && conn === 'ready') void refreshQuota();
}, 60_000);

// ───────────── 初始化 ─────────────
(async () => {
  settings = normalizeSettings(await settingsItem.getValue());
  fillForm(settings);
  quota = await quotaItem.getValue();
  history = await historyItem.getValue();
  render();
  await resolveTarget();
  const fresh = quota?.checkedAt && Date.now() - quota.checkedAt < 30_000;
  if (!fresh) void refreshQuota();
})();
