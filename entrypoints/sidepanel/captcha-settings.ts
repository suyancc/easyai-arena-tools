import { browser } from 'wxt/browser';
import { CAPTCHA_ORIGIN, validKey } from '../../utils/captcha/api';
export function installCaptchaSettings() {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T;
  const key = get<HTMLInputElement>('captcha-api-key'), enabled = get<HTMLInputElement>('captcha-enabled'), save = get<HTMLButtonElement>('captcha-save'), test = get<HTMLButtonElement>('captcha-test'), status = get('captcha-settings-status');
  void browser.storage.local.get(['captchaApiKey', 'captchaEnabled', 'captchaLastStatus']).then(s => { key.value = typeof s.captchaApiKey === 'string' ? s.captchaApiKey : ''; enabled.checked = s.captchaEnabled === true; if (typeof s.captchaLastStatus === 'string') status.textContent = s.captchaLastStatus; });
  enabled.onchange = async () => {
    if (enabled.checked) { status.textContent = '开启后请点“保存”，授权后才会自动提交付费任务'; return; }
    try { await browser.storage.local.set({ captchaEnabled: false }); status.textContent = '已关闭并停止本地等待；平台已提交任务可能仍收费'; }
    catch { status.textContent = '关闭失败，请使用网页右下角的停止按钮'; }
  };
  save.onclick = async () => {
    const value = key.value.trim();
    if (value && !validKey(value)) { status.textContent = 'API Key 应为 32 位字母数字（平台提供的十六进制 Key）'; return; }
    if (enabled.checked && !value) { status.textContent = '开启前请填写 API Key'; return; }
    save.disabled = true;
    try {
      if ((value || enabled.checked) && !await browser.permissions.request({ origins: [CAPTCHA_ORIGIN] })) { status.textContent = '未授权 2Captcha 站点，未保存'; return; }
      await browser.storage.local.set({ captchaApiKey: value, captchaEnabled: enabled.checked });
      status.textContent = enabled.checked ? '已开启：所有 Arena 页面自动验证（付费）' : '已关闭自动验证';
    } catch { status.textContent = '保存失败，请检查扩展状态'; }
    finally { save.disabled = false; }
  };
  test.onclick = async () => {
    test.disabled = true; status.textContent = '正在检测已保存的 Key…';
    try {
      const reply = await browser.runtime.sendMessage({ type: 'captcha:test' });
      status.textContent = reply?.ok ? `可用余额：$${Number(reply.balance).toFixed(3)}` : reply?.error || '检测失败，请先保存 Key 并授权';
    } catch { status.textContent = '余额检测连接失败'; }
    finally { test.disabled = false; }
  };
  browser.storage.onChanged.addListener((changes, area) => { if (area === 'local' && typeof changes.captchaLastStatus?.newValue === 'string') status.textContent = changes.captchaLastStatus.newValue; });
  window.addEventListener('pagehide', () => { key.value = ''; }, { once: true });
}
