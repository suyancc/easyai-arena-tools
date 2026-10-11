/** HTTPS mailbox adapter. Only this fixed endpoint receives task-local OAuth credentials. */
import { RegistrationError, checkAbort, findCallback, type OutlookAccount } from './contracts';
export const OUTLOOK_MESSAGES_URL = 'https://tools.oai9.com/api/outlook/messages';
interface Message { id: string; to: string; received_at: string; text?: string; html?: string }
function messages(data: unknown): Message[] {
  const value = data as { messages?: unknown; error?: unknown; success?: unknown } | null;
  if (!value || value.error || value.success === false || !Array.isArray(value.messages) || value.messages.length > 1000) throw new RegistrationError('收信服务返回了无效邮件列表，已停止');
  if (value.messages.some(m => !m || typeof m.id !== 'string' || !m.id || m.id.length > 512 || typeof m.to !== 'string' || typeof m.received_at !== 'string')) throw new RegistrationError('收信服务邮件字段无效，已停止');
  return value.messages;
}
export function serviceCallback(data: unknown, email: string, since: number, baseline: Set<string>): string | null {
  const candidates: { at: number; url: string }[] = [];
  for (const m of messages(data)) {
    if (baseline.has(m.id)) continue;
    const recipient = (m.to.match(/^[^<>]*<([^<>]+)>$/)?.[1] ?? m.to).trim().toLowerCase();
    const at = Date.parse(m.received_at);
    if (recipient !== email.toLowerCase() || !Number.isFinite(at) || at < since) continue;
    // Parse as strings only: never render returned HTML or fetch embedded resources.
    const url = findCallback(m.html) ?? findCallback(m.text);
    if (url) candidates.push({ at, url });
  }
  return candidates.sort((a, b) => b.at - a.at)[0]?.url ?? null;
}
export class OutlookMailbox {
  private baseline = new Set<string>(); private prepared = false;
  constructor(private account: OutlookAccount, private fetcher: typeof fetch = fetch) {}
  private async json(url: string, init: RequestInit, signal: AbortSignal): Promise<any> {
    checkAbort(signal); const controller = new AbortController();
    const started = Date.now(); let timedOut = false, phase = 'fetch', http = 0, format = 'unknown';
    const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; abort(); }, 15000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    // Fixed labels/numeric metadata only. Never include response bodies, URLs with tokens,
    // request payloads, or native exception messages (which may reflect credentials).
    const detail = () => `${Date.now() - started}ms${http ? ` / HTTP ${http} / ${format}` : ' / HTTP 未建立'}`;
    try {
      // Native browser fetch is branded to Window/WorkerGlobalScope, not this mailbox.
      const fetcher = this.fetcher;
      const response = await fetcher(url, { ...init, signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
      phase = 'headers'; http = response.status;
      const mime = (response.headers.get('content-type') || '').toLowerCase();
      format = mime.includes('json') ? 'JSON' : mime.includes('html') ? 'HTML' : mime.startsWith('text/') ? 'text' : 'other';
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => {});
        throw new RegistrationError(`[MAIL_HTTP / ${detail()}] ${http === 429 ? '收信服务限流' : '收信服务返回错误状态'}；未自动重试`);
      }
      if (Number(response.headers.get('content-length') || 0) > 2097152) { void response.body?.cancel().catch(() => {}); throw new RegistrationError(`[MAIL_SIZE / ${detail()}] 响应超过 2 MiB，已停止`); }
      phase = 'body'; reader = response.body?.getReader();
      if (!reader) throw new RegistrationError(`[MAIL_BODY / ${detail()}] 收信响应没有可读正文`);
      let bytes = 0, text = ''; const decoder = new TextDecoder('utf-8', { fatal: true });
      for (;;) {
        phase = 'read'; const r = await reader.read(); if (r.done) break;
        bytes += r.value.byteLength;
        if (bytes > 2097152) throw new RegistrationError(`[MAIL_SIZE / ${detail()}] 响应超过 2 MiB，已停止`);
        phase = 'decode'; text += decoder.decode(r.value, { stream: true });
      }
      phase = 'decode'; text += decoder.decode(); checkAbort(signal);
      phase = 'json'; return JSON.parse(text);
    } catch (error) {
      checkAbort(signal);
      if (timedOut) throw new RegistrationError(`[MAIL_TIMEOUT / ${detail()}] 收信请求达到 15 秒上限（阶段：${phase}）；未自动重试`);
      if (error instanceof RegistrationError) throw error;
      const labels: Record<string, string> = {
        fetch: 'MAIL_FETCH：浏览器未取得 HTTP 响应，请检查扩展后台 Network 的网络、代理、证书或重定向错误',
        headers: 'MAIL_HEADERS：无法读取收信响应信息',
        body: 'MAIL_BODY：收信响应没有可用的数据流',
        read: 'MAIL_READ：收信响应流中断',
        decode: 'MAIL_UTF8：收信响应不是有效 UTF-8',
        json: 'MAIL_JSON：收信响应不是有效 JSON（可能返回了网页或空正文）',
      };
      throw new RegistrationError(`[${detail()}] ${labels[phase] || 'MAIL_UNKNOWN：收信处理失败'}；未自动重试`);
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); if (reader) void reader.cancel().catch(() => {}); }
  }

  private async list(signal: AbortSignal): Promise<unknown> {
    if (!this.account.refreshToken) throw new RegistrationError('邮箱任务凭据已释放');
    return this.json(OUTLOOK_MESSAGES_URL, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: `${this.account.email}----none----${this.account.clientId}----${this.account.refreshToken}` }),
    }, signal);
  }
  async prepare(signal: AbortSignal): Promise<void> {
    this.prepared = false;
    const data = await this.list(signal); checkAbort(signal);
    this.baseline = new Set(messages(data).map(m => m.id)); this.prepared = true;
  }
  async callback(since: number, signal: AbortSignal): Promise<string | null> {
    if (!this.prepared) throw new RegistrationError('邮箱尚未通过预检');
    return serviceCallback(await this.list(signal), this.account.email, since, this.baseline);
  }
  dispose() { this.account.refreshToken = ''; this.baseline.clear(); this.prepared = false; }
}
