/** Foreground single-account state machine, ported from Rust form_registration.rs. */
import { RegistrationError, checkAbort, validCallback, type FormAction, type FormState } from './contracts';
export interface RegistrationPorts {
  now(): number; sleep(ms: number, signal: AbortSignal): Promise<void>;
  mailbox: { prepare(signal: AbortSignal): Promise<void>; callback(since: number, signal: AbortSignal): Promise<string | null> };
  page(action: FormAction, data: Record<string, string>): Promise<FormState>;
  navigate(url: string): Promise<void>;
  progress(stage: string, message: string): void;
}
export async function registerOne(ports: RegistrationPorts, email: string, password: string, name: string, signal: AbortSignal): Promise<void> {
  checkAbort(signal); ports.progress('mailbox', '正在校验 Outlook 授权，尚未提交注册…');
  await ports.mailbox.prepare(signal); checkAbort(signal);
  const deadline = ports.now() + 480000, submitted = new Set<FormAction>();
  let callbackUsed = false, since = Infinity, lastMail = -Infinity, submittedAt = 0;
  while (ports.now() < deadline) {
    checkAbort(signal); let page: FormState;
    try { page = await ports.page('read', { email }); }
    catch (error) { checkAbort(signal); if (error instanceof RegistrationError) throw error; await ports.sleep(1000, signal); continue; } // Reads only: page may be navigating.
    checkAbort(signal);
    if (page.blocker === 'verification') {
      ports.progress('human', '等待人机验证完成；已开启 2Captcha 时自动处理，也可手动完成');
      await ports.sleep(1000, signal); continue;
    }
    if (page.blocker) throw new RegistrationError('注册网页出现限流或连接错误，已停止；不会重复提交，请查看网页');
    if (page.stage === 'loginPassword') throw new RegistrationError('该邮箱可能已有 Arena 账号，已停止；不会替你登录已有账号');
    if (page.stage === 'invalid' || page.stage === 'wrong_origin') throw new RegistrationError('验证链接或注册页面无效，已停止');
    if (page.stage === 'authenticated') {
      if (!submitted.has('create') || !callbackUsed || !submitted.has('submitPassword') || !page.accountMatches) throw new RegistrationError('检测到已有或不匹配的登录状态，不能认定本次注册成功；请先检查当前账号');
      ports.progress('done', '注册完成，邮箱已验证且密码已设置'); return;
    }
    if (submitted.has('create') && !callbackUsed && ports.now() - lastMail >= 5000) {
      lastMail = ports.now(); ports.progress('mail', '等待当前邮箱本次注册的验证邮件…');
      const callback = await ports.mailbox.callback(since, signal); checkAbort(signal);
      if (callback) {
        if (!validCallback(callback)) throw new RegistrationError('验证链接校验失败');
        callbackUsed = true; ports.progress('callback', '已读取验证邮件，正在打开官方验证页面…');
        await ports.navigate(callback); checkAbort(signal);
        await ports.sleep(1000, signal); continue;
      }
    }
    if (page.stage === 'create' && !submitted.has('submitEmail')) throw new RegistrationError('注册表单未与本次邮箱提交关联，已停止');
    if (page.stage === 'verification' && !submitted.has('create')) throw new RegistrationError('已有未完成的邮箱验证，请先人工检查；不会另行提交');
    let action: FormAction | null = null;
    if (page.stage === 'expand') action = 'expand';
    else if (page.stage === 'loggedOut') action = 'openLogin';
    else if (page.stage === 'email') action = submitted.has('fillEmail') ? 'submitEmail' : 'fillEmail';
    else if (page.stage === 'create') action = submitted.has('fillName') ? 'create' : 'fillName';
    else if (page.stage === 'setPassword') {
      if (!callbackUsed) throw new RegistrationError('密码页面未与本次验证邮件关联，已停止');
      action = submitted.has('fillPassword') ? 'submitPassword' : 'fillPassword';
    }
    if (action && !submitted.has(action)) {
      if (action === 'create') since = Math.floor(ports.now() / 1000) * 1000;
      submitted.add(action); submittedAt = ports.now(); // Uncertain actions NEVER replay.
      const data: Record<string, string> = action === 'fillEmail' || action === 'submitEmail' ? { email } : action === 'fillName' || action === 'create' ? { name, email } : action === 'fillPassword' || action === 'submitPassword' ? { password } : {};
      ports.progress('form', action.includes('Password') ? '正在设置注册密码…' : '正在填写并提交注册页面…');
      const result = await ports.page(action, data); checkAbort(signal);
      if (!result.acted && !result.failed && (result.deferred || result.blocker === 'verification')) submitted.delete(action); // Explicit no-action response only.
      else if (!result.acted || result.failed || result.blocker) throw new RegistrationError('网页操作结果未确认，已停止且不会重复提交，请人工核查');
    } else if (action && submitted.has(action) && ports.now() - submittedAt > 90000) {
      throw new RegistrationError('提交后页面未确认进入下一步，已停止；不会重复提交');
    }
    await ports.sleep(1000, signal);
  }
  throw new RegistrationError('注册或收信等待超时，已停止；请先检查网页结果，不会自动重新注册');
}
