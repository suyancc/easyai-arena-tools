import { browser } from 'wxt/browser';
import { CAPTCHA_ORIGIN, CaptchaError, TwoCaptcha, alive, challenge, validKey } from './api';
const active = new Map<number, AbortController>();
export function cancelCaptchaForTab(tabId: number | null) { if (tabId !== null) active.get(tabId)?.abort(); }
export function installCaptcha() {
  let admission = Promise.resolve();
  async function status(tab: number, document: string, message: string, running: boolean) {
    void browser.storage.local.set({ captchaLastStatus: message }).catch(() => {});
    void browser.tabs.sendMessage(tab, { type: 'captcha:status', document, message, running }).catch(() => {});
  }
  async function run(tab: number, document: string, raw: unknown) {
    const c = challenge(raw); if (!c || active.has(tab)) return;
    const control = new AbortController(); active.set(tab, control); const signal = control.signal;
    let api: TwoCaptcha | null = null, key = '';
    try {
      const settings = await browser.storage.local.get(['captchaEnabled', 'captchaApiKey']); alive(signal);
      if (settings.captchaEnabled !== true || !validKey(settings.captchaApiKey)) return;
      if (!await browser.permissions.contains({ origins: [CAPTCHA_ORIGIN] })) throw new CaptchaError('请在设置中重新保存 Key 并允许 2Captcha 权限');
      key = settings.captchaApiKey;
      const page = await browser.tabs.get(tab);
      if (!page.url || new URL(page.url).origin !== 'https://arena.ai') return;
      const website = new URL(page.url); const route = website.origin + website.pathname;
      const current = async () => {
        alive(signal);
        const latest = await browser.tabs.get(tab);
        if (!latest.url || new URL(latest.url).origin + new URL(latest.url).pathname !== route) return false;
        const reply = await browser.tabs.sendMessage(tab, { type: 'captcha:current', document, id: c.id });
        alive(signal); return reply?.current === true;
      };
      if (!await current()) return;
      // Serial persisted admission BEFORE createTask: service-worker restarts cannot double bill.
      let admitted = false;
      const work = admission.then(async () => {
        alive(signal); const data = await browser.storage.local.get('captchaSpendGuard');
        const now = Date.now(); const rows: { tab: number; id: string; at: number }[] = Array.isArray(data.captchaSpendGuard) ? data.captchaSpendGuard.filter((v: any) => typeof v?.at === 'number' && now - v.at < 3600000).slice(-100) : [];
        const id = `${document}:${c.id}`;
        if (rows.some(v => v.tab === tab && v.id === id)) throw new CaptchaError('此验证已尝试过，不重复扣费；请手动处理');
        if (rows.filter(v => v.tab === tab && now - v.at < 600000).length >= 3 || rows.length >= 10) throw new CaptchaError('已达自动验证限额（每页10分钟3次／总计每小时10次），请手动处理');
        alive(signal); await browser.storage.local.set({ captchaSpendGuard: [...rows, { tab, id, at: now }] }); admitted = true;
      });
      admission = work.catch(() => {}); await work; if (!admitted) return;
      api = new TwoCaptcha(key);
      const token = await api.solve(c, route, signal, current, message => { void status(tab, document, message, true); });
      alive(signal);
      if (!token || !await current()) { await status(tab, document, '验证已由用户完成或页面变化，停止回填；平台任务可能仍收费', false); return; }
      const result = await browser.tabs.sendMessage(tab, { type: 'captcha:apply', document, id: c.id, token });
      alive(signal);
      if (!result?.applied) throw new CaptchaError('验证结果未能回填，不再提交收费任务；请手动验证');
      await status(tab, document, '2Captcha 已回填，等待 Arena 确认；未通过请手动验证', false);
    } catch (error) {
      await status(tab, document, signal.aborted ? '已停止自动验证；平台已提交任务可能仍收费' : error instanceof CaptchaError ? error.message : '自动验证连接或页面状态改变，已停止，不自动重试', false);
    } finally { key = ''; api?.dispose(); if (active.get(tab) === control) active.delete(tab); }
  }
  browser.tabs.onRemoved.addListener(id => cancelCaptchaForTab(id));
  browser.tabs.onUpdated.addListener((id, change) => { if (change.status === 'loading' || change.url) cancelCaptchaForTab(id); });
  browser.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes.captchaEnabled?.newValue === false || changes.captchaApiKey)) for (const c of active.values()) c.abort(); });
  browser.runtime.onMessage.addListener((req: any, sender, reply) => {
    if (!req || !['captcha:detected', 'captcha:cancel', 'captcha:test'].includes(req.type) || sender.id !== browser.runtime.id) return;
    if (req.type === 'captcha:test') {
      if (sender.tab || sender.url !== browser.runtime.getURL('/sidepanel.html' as '/')) { reply({ ok: false }); return; }
      void (async () => {
        const s = await browser.storage.local.get('captchaApiKey'); if (!validKey(s.captchaApiKey)) throw new CaptchaError('请先保存有效的 API Key');
        const api = new TwoCaptcha(s.captchaApiKey);
        try { return await api.balance(new AbortController().signal); } finally { api.dispose(); }
      })().then(balance => reply({ ok: true, balance }), error => reply({ ok: false, error: error instanceof CaptchaError ? error.message : '余额检测失败' })); return true;
    }
    const tab = sender.tab?.id;
    if (typeof tab !== 'number' || sender.frameId !== 0 || !sender.url || new URL(sender.url).origin !== 'https://arena.ai') return;
    if (req.type === 'captcha:cancel') { cancelCaptchaForTab(tab); reply({ ok: true }); return; }
    if (typeof req.document !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(req.document)) return;
    void run(tab, req.document, req.challenge); reply({ ok: true });
  });
}
