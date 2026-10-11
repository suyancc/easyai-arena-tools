import { cancelCaptchaForTab } from '../captcha/background';
import { browser } from 'wxt/browser';
import { DEFAULT_REGISTRATION_PASSWORD, MAIL_ORIGINS, registrationResult, type RegistrationResult, RegistrationError, checkAbort, parseAccount, validPassword, type FormAction, type FormState, type OutlookAccount, type RegistrationState } from './contracts';
import { OutlookMailbox } from './mailbox';
import { registerOne } from './workflow';
const STATUS_KEY = 'registrationStatus', PASSWORD_KEY = 'registrationPassword', RESULT_KEY = 'registrationLastResult';
export function installRegistration() {
  let state: RegistrationState = { running: false, stage: 'idle', message: '输入一个 Outlook 账号后开始', tabId: null };
  let lastResult: RegistrationResult | null = null;
  const resultReady = browser.storage.local.get(RESULT_KEY).then(saved => { lastResult = registrationResult(saved[RESULT_KEY]); }).catch(() => {});
  let active: { id: string; controller: AbortController; tabId: number | null } | null = null;
  // Persist progress only. Restart NEVER resumes with credentials or repeats a submission.
  const ready = browser.storage.local.get(STATUS_KEY).then(saved => {
    const previous = saved[STATUS_KEY] as RegistrationState | undefined;
    if (previous?.running) state = { running: false, stage: 'interrupted', message: '后台或扩展已重启，任务已中断；请先检查网页，不会自动重新提交', tabId: previous.tabId };
    else if (previous && typeof previous.message === 'string') state = previous;
  }).catch(() => {});
  function publish(stage: string, message: string) {
    state = { running: !!active, stage, message, tabId: active?.tabId ?? state.tabId };
    void browser.storage.local.set({ [STATUS_KEY]: state }).catch(() => {});
    void browser.runtime.sendMessage({ type: 'registration:changed', data: state }).catch(() => {});
  }
  function sleep(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new RegistrationError('已停止注册，请检查网页')); return; }
      const done = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(); };
      const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new RegistrationError('已停止注册；已提交的请求不会撤回，请检查网页')); };
      const timer = setTimeout(done, ms); signal.addEventListener('abort', abort, { once: true });
    });
  }
  async function run(account: OutlookAccount, password: string, windowId: number) {
    const task = active!, signal = task.controller.signal, mailbox = new OutlookMailbox(account);
    let finalStage = 'error', finalMessage = '注册中断，请检查网页';
    try {
      await resultReady;
      if (!await browser.permissions.contains({ origins: MAIL_ORIGINS })) throw new RegistrationError('请授予 tools.oai9.com 收信权限后再开始');
      checkAbort(signal);
      // Lock is already set: refuse competing draw/manual tasks before changing login state.
      publish('preflight', '正在检查其他 Arena 标签页的任务…');
      const tabs = await browser.tabs.query({ url: ['https://arena.ai/*'] });
      for (const tab of tabs) {
        if (tab.id === undefined || tab.discarded) continue;
        let reply: any;
        try { reply = await browser.tabs.sendMessage(tab.id, { type: 'state:get' }); }
        catch { continue; } // No content controller means no extension task on this document.
        if (reply?.data?.running || reply?.data?.manual) throw new RegistrationError('请先停止所有 Arena 标签页的抽模型、指纹或测试任务');
      }
      checkAbort(signal);
      const win = await browser.windows.get(windowId);
      if (!Number.isInteger(win.id)) throw new RegistrationError('无法确认当前浏览器窗口');
      async function ownedTab() {
        checkAbort(signal);
        if (task.tabId === null) {
          const tab = await browser.tabs.create({ windowId, url: 'https://arena.ai/', active: true });
          if (typeof tab.id !== 'number') throw new RegistrationError('无法打开注册网页');
          task.tabId = tab.id; publish('page', '正在打开 Arena 注册网页…'); checkAbort(signal);
        }
        let tab;
        try { tab = await browser.tabs.get(task.tabId); } catch { throw new RegistrationError('注册标签页已关闭，任务停止'); }
        checkAbort(signal);
        if (new URL(tab.pendingUrl || tab.url || 'about:blank').origin !== 'https://arena.ai') throw new RegistrationError('注册标签页已离开 Arena，任务停止');
        return task.tabId;
      }
      await registerOne({
        now: () => Date.now(), sleep, mailbox,
        page: async (action: FormAction, data): Promise<FormState> => {
          const tabId = await ownedTab(); checkAbort(signal);
          const result = await browser.tabs.sendMessage(tabId, { type: 'registration:page', job: task.id, action, data });
          checkAbort(signal);
          if (!result?.ok || typeof result.data?.stage !== 'string' || typeof result.data?.blocker !== 'string') throw new RegistrationError('网页操作未确认，已停止且不重复提交');
          return result.data;
        },
        navigate: async url => { const tabId = await ownedTab(); checkAbort(signal); await browser.tabs.update(tabId, { url }); },
        progress: publish,
      }, account.email, password, Array.from(crypto.getRandomValues(new Uint8Array(8)), n => String.fromCharCode(97 + n % 26)).join(''), signal);
      lastResult = { email: account.email, password, completedAt: Date.now() };
      finalStage = 'done'; finalMessage = '注册完成，账号密码见下方';
      try { await browser.storage.local.set({ [RESULT_KEY]: lastResult }); }
      catch { finalMessage = '注册完成，但结果未能保存；请立即复制下方账号密码'; }
    } catch (error) {
      finalStage = signal.aborted ? 'stopped' : 'error';
      finalMessage = error instanceof RegistrationError ? error.message : '注册操作失败或结果未确认；已停止且不会重复提交，请检查网页';
    } finally {
      mailbox.dispose(); account.refreshToken = ''; password = '';
      if (active === task) { active = null; publish(finalStage, finalMessage); }
    }
  }
  browser.tabs.onRemoved.addListener(id => { if (active?.tabId === id) active.controller.abort(); });
  browser.runtime.onMessage.addListener((request: any, sender, reply) => {
    if (!request || !['registration:start', 'registration:stop', 'registration:state', 'registration:busy', 'registration:result', 'registration:clearResult'].includes(request.type)) return;
    if (sender.id !== browser.runtime.id) return;
    if (request.type !== 'registration:busy' && (sender.tab || sender.url !== browser.runtime.getURL('/sidepanel.html' as '/'))) { reply({ ok: false, error: '注册只能由插件面板发起' }); return; }
    void (async () => {
      await ready;
      if (request.type === 'registration:result') { await resultReady; return { ok: true, data: lastResult }; }
      if (request.type === 'registration:clearResult') {
        await resultReady;
        if (active) throw new RegistrationError('请等待当前注册任务结束后再清除结果');
        await browser.storage.local.remove(RESULT_KEY); lastResult = null; return { ok: true };
      }
      if (request.type === 'registration:busy') return { ok: true, running: !!active };
      if (request.type === 'registration:state') return { ok: true, data: state };
      if (request.type === 'registration:stop') {
        if (active) {
          const task = active; task.controller.abort(); cancelCaptchaForTab(task.tabId); publish('stopping', '正在停止，已提交的网页请求不会撤回…');
          if (task.tabId !== null) void browser.tabs.sendMessage(task.tabId, { type: 'registration:cancel', job: task.id }).catch(() => {});
        }
        return { ok: true, data: state };
      }
      if (active) throw new RegistrationError('已有注册任务正在执行');
      const account = parseAccount(request.account);
      if (!Number.isInteger(request.windowId)) throw new RegistrationError('无法确认注册窗口');
      // Reserve BEFORE any await; two panels cannot launch concurrent jobs.
      active = { id: crypto.randomUUID(), controller: new AbortController(), tabId: null };
      state.tabId = null; publish('starting', '正在准备注册…');
      const task = active;
      let accepted = false;
      try {
        const stored = await browser.storage.local.get(PASSWORD_KEY);
        checkAbort(task.controller.signal);
        const password: unknown = stored[PASSWORD_KEY] ?? DEFAULT_REGISTRATION_PASSWORD;
        if (!validPassword(password)) throw new RegistrationError('Arena 注册密码需为 8–128 字符，请在设置中修改');
        accepted = true;
        void run(account, password, request.windowId);
      } catch (error) {
        account.refreshToken = ''; if (active === task) { active = null; publish('error', error instanceof RegistrationError ? error.message : '读取注册设置失败'); }
      }
      return { ok: true, accepted, data: state };
    })().then(reply, error => reply({ ok: false, error: error instanceof RegistrationError ? error.message : '注册服务不可用' }));
    return true;
  });
}
