import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { rpc } from '../utils/page-rpc';
import { challenge } from '../utils/captcha/api';
export default defineContentScript({ matches: ['https://arena.ai/*'], runAt: 'document_idle', main(ctx) {
  const documentId = crypto.randomUUID(), seen = new Set<string>();
  let enabled = false, busy = false, solving = false, timer: ReturnType<typeof setTimeout> | undefined;
  const box = document.createElement('div'); box.setAttribute('data-easyai-captcha-status', '');
  box.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:340px;background:#182238;color:#fff;padding:10px 12px;border-radius:8px;font:13px/1.5 system-ui;box-shadow:0 3px 16px #0003'; box.hidden = true;
  const label = document.createElement('span'), stop = document.createElement('button'); stop.textContent = '停止'; stop.style.cssText = 'margin-left:8px;cursor:pointer';
  const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', '关闭验证状态'); close.style.cssText = 'margin-left:8px;cursor:pointer';
  close.onclick = () => { box.hidden = true; }; box.append(label, stop, close);
  stop.onclick = () => { void browser.runtime.sendMessage({ type: 'captcha:cancel', document: documentId }); };
  async function scan() {
    timer = undefined; if (!enabled || busy || solving || !ctx.isValid) return; busy = true;
    try {
      const raw = await rpc<any>('captchaInspect', [], 5000);
      if (raw?.unsupported) { label.textContent = 'reCAPTCHA 回调未能唯一定位，未提交收费任务，请手动验证'; stop.hidden = true; if (!box.isConnected) document.body.append(box); box.hidden = false; return; }
      const c = challenge(raw);
      if (c && !seen.has(c.id)) {
        seen.add(c.id); // Before dispatch: do not repeat unknown paid submissions.
        await browser.runtime.sendMessage({ type: 'captcha:detected', document: documentId, challenge: c });
      }
    } catch { /* Page may still be loading; a later DOM event can inspect again. */ }
    finally { busy = false; }
  }
  const schedule = () => { if (enabled && !timer && ctx.isValid) timer = setTimeout(() => void scan(), 300); };
  const observer = new MutationObserver(records => { if (records.some(r => r.target !== box && !box.contains(r.target) && !(r.type === 'childList' && r.addedNodes.length > 0 && Array.from(r.addedNodes).every(n => n === box)))) schedule(); });
  function toggle(value: boolean) { if (!ctx.isValid) return; enabled = value; observer.disconnect(); clearTimeout(timer); timer = undefined; if (!enabled) { box.hidden = true; solving = false; } if (enabled) { observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'style', 'class', 'hidden'] }); schedule(); } }
  void browser.storage.local.get('captchaEnabled').then(s => toggle(s.captchaEnabled === true));
  const onSettings = (changes: Record<string, any>, area: string) => { if (area === 'local' && changes.captchaEnabled) toggle(changes.captchaEnabled.newValue === true); };
  browser.storage.onChanged.addListener(onSettings);
  ctx.addEventListener(window, 'wxt:locationchange', schedule);
  browser.runtime.onMessage.addListener((req: any, sender, reply) => {
    if (!req || !['captcha:current', 'captcha:apply', 'captcha:status'].includes(req.type) || sender.id !== browser.runtime.id || sender.tab || req.document !== documentId || !ctx.isValid) return;
    if (req.type === 'captcha:status') {
      solving = req.running === true;
      if (!solving) schedule();
      if (typeof req.message === 'string') { label.textContent = req.message.slice(0, 250); stop.hidden = !req.running; if (!box.isConnected) document.body.append(box); box.hidden = false; }
      reply({ ok: true }); return;
    }
    if (!enabled || !seen.has(req.id)) { reply({ current: false, applied: false }); return; }
    void (async () => {
      const c = challenge(await rpc('captchaInspect', [], 5000));
      if (!c || c.id !== req.id) return { current: false, applied: false };
      if (req.type === 'captcha:current') return { current: true };
      if (typeof req.token !== 'string' || req.token.length > 16384) return { applied: false };
      return rpc('captchaApply', [req.id, req.token], 8000);
    })().then(reply, () => reply({ current: false, applied: false })); return true;
  });
  ctx.onInvalidated(() => { observer.disconnect(); clearTimeout(timer); box.remove(); browser.storage.onChanged.removeListener(onSettings); });
} });
