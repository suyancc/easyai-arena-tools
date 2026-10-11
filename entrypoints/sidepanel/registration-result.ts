import { registrationResult, type RegistrationResult } from '../../utils/registration/contracts';
export function installRegistrationResult(request: (type: string) => Promise<any>) {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T;
  const panel = get('registration-result'), email = get<HTMLInputElement>('registration-result-email'), password = get<HTMLInputElement>('registration-result-password');
  const show = get<HTMLButtonElement>('registration-result-show'), feedback = get('registration-result-feedback');
  let current: RegistrationResult | null = null, loading = false, disposed = false, again = false;
  function mask() { password.type = 'password'; show.textContent = '显示'; }
  function render() {
    panel.hidden = !current; email.value = current?.email ?? ''; password.value = current?.password ?? '';
    get('registration-result-time').textContent = current ? new Date(current.completedAt).toLocaleString('zh-CN', { hour12: false }) : '';
  }
  async function refresh() {
    if (disposed) return;
    if (loading) { again = true; return; }
    loading = true;
    try {
      const next = registrationResult((await request('registration:result')).data);
      if (disposed) return;
      if (next?.completedAt !== current?.completedAt) { mask(); feedback.textContent = ''; }
      current = next; render();
    } catch { if (!disposed) feedback.textContent = '读取注册结果失败，请重新打开面板'; }
    finally { loading = false; if (again && !disposed) { again = false; void refresh(); } }
  }
  async function copy(kind: 'email' | 'password' | 'both') {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(kind === 'email' ? current.email : kind === 'password' ? current.password : `${current.email}----${current.password}`);
      feedback.textContent = kind === 'both' ? '已复制：邮箱----密码' : kind === 'email' ? '已复制邮箱' : '已复制密码';
    } catch { feedback.textContent = '复制失败，请显示密码后手动复制'; }
  }
  show.onclick = () => { password.type = password.type === 'password' ? 'text' : 'password'; show.textContent = password.type === 'password' ? '显示' : '隐藏'; };
  get<HTMLButtonElement>('registration-copy-email').onclick = () => void copy('email');
  get<HTMLButtonElement>('registration-copy-password').onclick = () => void copy('password');
  get<HTMLButtonElement>('registration-copy-both').onclick = () => void copy('both');
  get<HTMLButtonElement>('registration-result-clear').onclick = async () => {
    try { await request('registration:clearResult'); current = null; mask(); render(); feedback.textContent = ''; }
    catch { feedback.textContent = '清除失败，请先等待当前任务结束'; }
  };
  window.addEventListener('pagehide', () => { disposed = true; current = null; email.value = ''; password.value = ''; }, { once: true });
  void refresh(); return { refresh, mask };
}
