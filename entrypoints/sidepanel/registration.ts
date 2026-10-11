import { installRegistrationResult } from './registration-result';
import { browser } from 'wxt/browser';
import { DEFAULT_REGISTRATION_PASSWORD, MAIL_ORIGINS, RegistrationError, parseAccount, validPassword, type RegistrationState } from '../../utils/registration/contracts';
class RegistrationRejected extends RegistrationError {}
export function installRegistrationPanel(options: { settings?(): void; beforeOpen(): void; canStart(): boolean; running(value: boolean): void }) {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T;
  const view = get('registration-view'), main = get('main-view'), toggle = get<HTMLButtonElement>('registration-toggle');
  const input = get<HTMLTextAreaElement>('registration-account'), start = get<HTMLButtonElement>('registration-start'), stop = get<HTMLButtonElement>('registration-stop');
  const status = get('registration-status'), open = get<HTMLButtonElement>('registration-page');
  const password = get<HTMLInputElement>('registration-password'), save = get<HTMLButtonElement>('registration-password-save'), saved = get('registration-password-status');
  let state: RegistrationState = { running: false, stage: 'idle', message: '输入一个 Outlook 账号后开始', tabId: null }, pending = false, refreshing = false, unconfirmed = false, revision = 0;
  const resultView = installRegistrationResult(request);
  get<HTMLButtonElement>('registration-settings').onclick = () => options.settings?.();
  let timer: ReturnType<typeof setTimeout> | undefined;
  function render() {
    if (state.stage === 'done' && !state.running) void resultView.refresh();
    if (state.running && !timer) timer = setTimeout(() => { timer = undefined; void refresh(); }, 1000);
    else if (!state.running) { clearTimeout(timer); timer = undefined; }
    start.disabled = pending || state.running || unconfirmed || !options.canStart();
    stop.hidden = !state.running && !unconfirmed; stop.disabled = pending || state.stage === 'stopping';
    input.disabled = pending || state.running; password.disabled = state.running; save.disabled = state.running;
    start.textContent = pending ? '正在启动…' : state.running ? '注册进行中…' : '开始注册';
    status.textContent = state.message; status.classList.toggle('err', ['error', 'interrupted'].includes(state.stage));
    open.hidden = state.tabId === null;
    toggle.title = state.running ? '注册进行中（点击查看或停止）' : 'Outlook 注册';
    toggle.classList.toggle('registration-active', state.running); options.running(state.running || pending || unconfirmed);
  }
  async function request(type: string, extra: Record<string, unknown> = {}) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let response;
    try {
      response = await Promise.race([
        browser.runtime.sendMessage({ type, ...extra }),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new RegistrationError('后台响应超时（10 秒）')), 10000); }),
      ]);
    } finally { clearTimeout(timeout); }
    if (response?.ok === false) throw new RegistrationRejected(response.error || '后台拒绝注册请求');
    if (!response?.ok) throw new RegistrationError('注册服务未响应，请重载扩展');
    return response;
  }
  async function refresh() {
    if (refreshing || pending || unconfirmed) return; refreshing = true;
    const version = revision;
    try { const next = (await request('registration:state')).data; if (version === revision && !pending && !unconfirmed) { state = next; render(); } }
    catch { if (version === revision && !view.hidden && !pending) status.textContent = '注册服务连接中断，请重载扩展并检查网页；不会自动重新提交'; }
    finally { refreshing = false; }
  }
  function close() { resultView.mask(); view.hidden = true; main.hidden = false; document.body.classList.remove('registration-open'); }
  toggle.onclick = () => {
    options.beforeOpen(); main.hidden = true; view.hidden = false; document.body.classList.add('registration-open');
    get<HTMLButtonElement>('registration-back').focus(); void refresh(); void resultView.refresh(); render();
  };
  get<HTMLButtonElement>('registration-back').onclick = () => { close(); toggle.focus(); };
  open.onclick = async () => {
    if (state.tabId === null) return;
    try { const tab = await browser.tabs.update(state.tabId, { active: true }); if (tab?.windowId) await browser.windows.update(tab.windowId, { focused: true }); }
    catch { status.textContent = '注册网页已关闭'; }
  };
  start.onclick = async () => {
    if (pending || state.running || unconfirmed || !options.canStart()) return;
    try { parseAccount(input.value); } catch (error) { status.textContent = error instanceof RegistrationError ? error.message : '输入格式无效'; return; }
    revision++; pending = true;
    state = { ...state, stage: 'permission', message: '正在请求收信权限，请留意浏览器授权提示…' }; render(); status.scrollIntoView?.({ block: 'nearest' });
    let dispatched = false;
    try {
      const granted = await browser.permissions.request({ origins: MAIL_ORIGINS });
      if (!granted) throw new RegistrationError('未授予 tools.oai9.com 收信权限，尚未提交注册');
      state = { ...state, stage: 'starting', message: '正在连接注册后台，等待接收确认…' }; render();
      const win = await browser.windows.getCurrent();
      dispatched = true;
      const version = revision;
      const response = await request('registration:start', { account: input.value, windowId: win.id });
      dispatched = false; // A definite response, not a transport timeout.
      if (response.accepted !== true) {
        throw new RegistrationError(response.data?.message || '后台未确认接收任务，请重载扩展后再试');
      }
      input.value = ''; // Clear ONLY after the background explicitly accepts ownership.
      if (revision === version) state = response.data;
    } catch (error) {
      unconfirmed = dispatched && !(error instanceof RegistrationRejected);
      state = { ...state, running: false, stage: 'error', message: unconfirmed
        ? '启动结果未确认，邮箱输入已保留。请先点“停止注册”确认取消，或重载扩展；不要重复提交。'
        : error instanceof RegistrationError ? error.message : '无法启动注册，邮箱输入已保留，请检查扩展状态' };
    } finally { pending = false; revision++; render(); status.scrollIntoView?.({ block: 'nearest' }); }
  };
  stop.onclick = async () => {
    if (pending) return; pending = true; revision++; render();
    try { const response = await request('registration:stop'); unconfirmed = false; state = response.data; }
    catch { state = { ...state, message: '停止请求未确认；请关闭注册标签页并重载扩展，勿重复提交' }; }
    finally { pending = false; render(); }
  };
  save.onclick = async () => {
    if (!validPassword(password.value)) { saved.textContent = '密码需为 8–128 字符'; return; }
    try { await browser.storage.local.set({ registrationPassword: password.value }); saved.textContent = '已保存，仅保存在此浏览器本地'; }
    catch { saved.textContent = '保存失败'; }
  };
  void browser.storage.local.get('registrationPassword').then(value => { password.value = typeof value.registrationPassword === 'string' ? value.registrationPassword : DEFAULT_REGISTRATION_PASSWORD; }).catch(() => { saved.textContent = '读取密码设置失败'; });
  browser.runtime.onMessage.addListener((message: any, sender) => {
    if (message?.type === 'registration:changed' && sender.id === browser.runtime.id && !sender.tab && typeof message.data?.running === 'boolean') { revision++; if (!unconfirmed) { state = message.data; render(); } }
  });
  // Event-driven when idle; bounded refresh only while a registration task is active.
  void refresh();
  window.addEventListener('pagehide', () => { clearTimeout(timer); input.value = ''; password.value = ''; }, { once: true });
  return { close };
}
