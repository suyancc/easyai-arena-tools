export const CAPTCHA_ORIGIN = 'https://api.2captcha.com/*';
export class CaptchaError extends Error {}
export interface Challenge { id: string; key: string; enterprise: boolean; invisible: boolean; domain: 'google.com' | 'recaptcha.net'; s?: string }
export const validKey = (key: unknown): key is string => typeof key === 'string' && /^[a-f0-9]{32}$/i.test(key);
export function challenge(value: any): Challenge | null {
  if (!value || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id) || typeof value.key !== 'string' || !/^[a-zA-Z0-9_-]{10,200}$/.test(value.key) || typeof value.enterprise !== 'boolean' || typeof value.invisible !== 'boolean' || !['google.com', 'recaptcha.net'].includes(value.domain)) return null;
  if (value.s !== undefined && (typeof value.s !== 'string' || value.s.length > 4096)) return null;
  return { id: value.id, key: value.key, enterprise: value.enterprise, invisible: value.invisible, domain: value.domain, ...(value.s ? { s: value.s } : {}) };
}
export function taskFor(c: Challenge, url: string) {
  const u = new URL(url);
  if (u.origin !== 'https://arena.ai') throw new CaptchaError('仅支持 Arena 页面');
  return { type: c.enterprise ? 'RecaptchaV2EnterpriseTaskProxyless' : 'RecaptchaV2TaskProxyless', websiteURL: u.origin + u.pathname, websiteKey: c.key, isInvisible: c.invisible, apiDomain: c.domain, ...(c.s ? c.enterprise ? { enterprisePayload: { s: c.s } } : { recaptchaDataSValue: c.s } : {}) };
}
export const alive = (signal: AbortSignal) => { if (signal.aborted) throw new CaptchaError('已停止自动验证；平台已提交任务可能仍收费'); };
export function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new CaptchaError('已停止自动验证')); return; }
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new CaptchaError('已停止自动验证')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export class TwoCaptcha {
  constructor(private key: string, private fetcher: typeof fetch = fetch) {}
  private async post(method: 'createTask' | 'getTaskResult' | 'getBalance', body: Record<string, unknown>, signal: AbortSignal): Promise<any> {
    alive(signal); const controller = new AbortController(); const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true }); const timer = setTimeout(abort, 15000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const fetcher = this.fetcher; // Never bind browser-native fetch to this API instance.
      const r = await fetcher(`https://api.2captcha.com/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, clientKey: this.key }), credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal });
      if (r.status !== 200) { void r.body?.cancel().catch(() => {}); throw new CaptchaError(`2Captcha HTTP ${r.status}；不自动重新提交`); }
      reader = r.body?.getReader(); if (!reader) throw new CaptchaError('2Captcha 响应为空');
      let count = 0, text = ''; const decoder = new TextDecoder('utf-8', { fatal: true });
      for (;;) { const part = await reader.read(); if (part.done) break; count += part.value.byteLength; if (count > 524288) throw new CaptchaError('2Captcha 响应过大'); text += decoder.decode(part.value, { stream: true }); }
      text += decoder.decode(); alive(signal); const data = JSON.parse(text);
      if (data.errorId !== 0) {
        const code = typeof data.errorCode === 'string' && /^ERROR_[A-Z0-9_]{1,60}$/.test(data.errorCode) ? data.errorCode : 'API_ERROR';
        throw new CaptchaError(`2Captcha ${code}；请检查 Key、余额或任务类型`);
      }
      return data;
    } catch (error) {
      alive(signal); if (error instanceof CaptchaError) throw error;
      throw new CaptchaError('2Captcha 网络、15 秒超时或响应错误；创建任务结果可能未知，不自动重试');
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); if (reader) void reader.cancel().catch(() => {}); }
  }
  async balance(signal: AbortSignal): Promise<number> {
    const value = (await this.post('getBalance', {}, signal)).balance;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new CaptchaError('余额响应无效'); return value;
  }
  async solve(c: Challenge, url: string, signal: AbortSignal, current: () => Promise<boolean>, progress: (message: string) => void): Promise<string | null> {
    alive(signal); if (!await current()) return null;
    progress('2Captcha：正在提交付费验证任务…');
    const created = await this.post('createTask', { task: taskFor(c, url) }, signal);
    if (!Number.isSafeInteger(created.taskId) || created.taskId <= 0) throw new CaptchaError('任务编号未确认，不自动重新提交');
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      await wait(5000, signal); alive(signal); if (!await current()) return null;
      progress('2Captcha：等待验证结果…');
      const value = await this.post('getTaskResult', { taskId: created.taskId }, signal);
      if (value.status === 'processing') continue;
      const token = value.solution?.gRecaptchaResponse;
      if (value.status !== 'ready' || typeof token !== 'string' || !token || token.length > 16384 || /[\s\x00-\x1f]/.test(token)) throw new CaptchaError('2Captcha 验证结果无效');
      alive(signal); return await current() ? token : null;
    }
    throw new CaptchaError('2Captcha 等待超过 5 分钟；请手动验证，不自动重试');
  }
  dispose() { this.key = ''; }
}
