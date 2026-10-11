// Set a password in the extension settings; never publish a real default password.
export const DEFAULT_REGISTRATION_PASSWORD = '';
export const MAIL_ORIGINS = ['https://tools.oai9.com/*'];
export interface OutlookAccount { email: string; clientId: string; refreshToken: string }
export interface RegistrationResult { email: string; password: string; completedAt: number }
export function registrationResult(value: unknown): RegistrationResult | null {
  const r = value as Partial<RegistrationResult> | null;
  return r && typeof r.email === 'string' && r.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) && validPassword(r.password) && typeof r.completedAt === 'number' && Number.isFinite(r.completedAt)
    ? { email: r.email, password: r.password, completedAt: r.completedAt } : null;
}
export interface RegistrationState { running: boolean; stage: string; message: string; tabId: number | null }
export interface FormState { stage: string; blocker: string; acted?: boolean; deferred?: boolean; failed?: boolean; accountMatches?: boolean }
export type FormAction = 'read' | 'expand' | 'openLogin' | 'fillEmail' | 'submitEmail' | 'fillName' | 'create' | 'fillPassword' | 'submitPassword';
export const FORM_ACTIONS: FormAction[] = ['read', 'expand', 'openLogin', 'fillEmail', 'submitEmail', 'fillName', 'create', 'fillPassword', 'submitPassword'];
export class RegistrationError extends Error {}
export const checkAbort = (signal: AbortSignal) => { if (signal.aborted) throw new RegistrationError('已停止注册；已提交的请求不会撤回，请先检查网页结果'); };
export function parseAccount(input: unknown): OutlookAccount {
  if (typeof input !== 'string' || input.length > 12000 || input.trim().split(/\r?\n/).filter(Boolean).length !== 1) throw new RegistrationError('每次请输入一个 Outlook 账号：邮箱----密码或none----client_id----refresh_token');
  const line = input.trim(); const parts = line.split('----');
  if (parts.length < 4) throw new RegistrationError('邮箱信息需要四段：邮箱----密码或none----client_id----refresh_token');
  const email = parts[0]!.trim().toLowerCase(), clientId = parts[2]!.trim(), refreshToken = parts.slice(3).join('----').trim();
  if (email.length > 254 || !/^[^\s@<>"()\[\]\\]+@[^\s@<>"()\[\]\\]+\.[^\s@<>"()\[\]\\]+$/.test(email) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId) || !refreshToken || refreshToken.length > 8192 || /[\s\x00-\x1f\x7f]/.test(refreshToken)) throw new RegistrationError('邮箱、OAuth client_id 或 refresh_token 格式无效');
  return { email, clientId, refreshToken }; // The positional Outlook password is deliberately discarded.
}
export function validPassword(value: unknown): value is string { return typeof value === 'string' && [...value].length >= 8 && value.length <= 128 && !/[\x00-\x1f\x7f]/.test(value); }
export function validCallback(value: string): boolean {
  try {
    const u = new URL(value), tokens = u.searchParams.getAll('token'), kinds = u.searchParams.getAll('type');
    return value.length <= 8192 && u.origin === 'https://arena.ai' && !u.username && !u.password && !value.includes('#') && u.pathname === '/nextjs-api/callback/email' && tokens.length === 1 && !!tokens[0] && tokens[0].length <= 4096 && kinds.length <= 1 && kinds.every(t => t === 'email') && !u.searchParams.has('redirect') && !u.searchParams.has('redirect_uri');
  } catch { return false; }
}
export function findCallback(content: unknown): string | null {
  if (typeof content !== 'string') return null;
  const text = content.replace(/&amp;|&#38;|&#x26;/gi, '&');
  for (const match of text.matchAll(/https:\/\/[^\s<>"']+/g)) {
    const value = match[0].replace(/[.,;)\]}]+$/, '');
    if (validCallback(value)) return value;
  }
  return null;
}
export function mailboxCallback(data: unknown, email: string, since: number, baseline: Set<string>): string | null {
  const rows = (data as { value?: any[] })?.value;
  if (!Array.isArray(rows)) throw new RegistrationError('Outlook 返回了无法确认的邮件列表');
  const candidates: { at: number; url: string }[] = [];
  for (const m of rows.slice(0, 25)) {
    const id = m?.id ?? m?.Id;
    if (typeof id !== 'string' || baseline.has(id)) continue;
    const at = Date.parse(m.receivedDateTime ?? m.ReceivedDateTime ?? '');
    if (!Number.isFinite(at) || at < since) continue;
    const recipients = m.toRecipients ?? m.ToRecipients;
    if (!Array.isArray(recipients) || !recipients.some(r => String(r?.emailAddress?.address ?? r?.EmailAddress?.Address ?? '').toLowerCase() === email.toLowerCase())) continue;
    const body = m.body ?? m.Body;
    const url = findCallback(body?.content ?? body?.Content);
    if (url) candidates.push({ at, url });
  }
  return candidates.sort((a, b) => b.at - a.at)[0]?.url ?? null;
}
