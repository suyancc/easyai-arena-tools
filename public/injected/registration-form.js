// Browser port of src-tauri/src/form_bridge.js. Normal form actions only; CAPTCHA is never operated.
(() => {
  if (location.origin !== 'https://arena.ai') return;
  window.__arenaRegistrationForm = (action, data = {}) => {
    if (location.origin !== 'https://arena.ai') return { stage: 'wrong_origin', blocker: '' };
    const visible = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const text = e => (e?.getAttribute('aria-label') || e?.textContent || '').trim();
    const buttons = [...document.querySelectorAll('button')].filter(visible);
    const unique = list => list.length === 1 ? list[0] : null;
    const find = names => unique(buttons.filter(e => names.includes(text(e))));
    const inputs = [...document.querySelectorAll('input')].filter(visible);
    const headings = [...document.querySelectorAll('h1,h2,h3')].filter(visible).map(text);
    const alerts = [...document.querySelectorAll('[role="alert"],[data-sonner-toast]')].filter(visible).map(text).join(' ');
    const challenge = [...document.querySelectorAll('[role="dialog"]')].filter(visible).some(e => /Security Verification|人机身份验证|Verify you are human/i.test(e.textContent)) || [...document.querySelectorAll('iframe')].filter(visible).some(e => /challenge|挑战/i.test(e.title || ''));
    const blocker = challenge ? 'verification' : /too many requests|rate limit/i.test(alerts) ? 'rate_limit' : /connecting to arena has failed|different device/i.test(alerts) ? 'connect_failed' : /try again later|something went wrong/i.test(alerts) ? 'page_error' : '';
    const form = unique([...document.querySelectorAll('form')].filter(visible));
    const hydrated = !!form && Object.keys(form).some(k => k.startsWith('__reactProps'));
    const accounts = buttons.map(text).filter(t => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t));
    const expand = find(['Open sidebar', 'Expand sidebar', '打开侧边栏', '展开侧边栏']);
    const login = find(['Log In', '登录']), emailButton = find(['Continue with email', '使用邮箱继续']);
    let stage = 'loading';
    if (headings.includes('Invalid Link')) stage = 'invalid';
    else if (accounts.length) stage = 'authenticated';
    else if (headings.some(t => /Verify your email address/i.test(t))) stage = 'verification';
    else if (location.pathname === '/auth/set-password' && inputs.some(e => e.name === 'confirmPassword') && hydrated) stage = 'setPassword';
    else if (inputs.some(e => e.type === 'password') && hydrated) stage = 'loginPassword';
    else if (headings.includes('Create Account')) stage = 'create';
    else if (emailButton) stage = 'email'; else if (login) stage = 'loggedOut'; else if (expand) stage = 'expand';
    const snapshot = { stage, blocker, accountMatches: accounts.length === 1 && accounts[0].toLowerCase() === String(data.email || '').toLowerCase() };
    if (action === 'read' || blocker) return snapshot;
    const editable = e => visible(e) && !e.disabled && !e.readOnly;
    const set = (e, value) => {
      if (!editable(e) || typeof value !== 'string') throw Error();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, value);
      e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const click = e => { if (!visible(e) || e.disabled || e.getAttribute('aria-disabled') === 'true') throw Error(); e.click(); };
    const email = unique(inputs.filter(e => e.type === 'email' || e.placeholder === 'Your email'));
    const name = unique(inputs.filter(e => e.type === 'text' && editable(e)));
    const passwords = form ? [...form.querySelectorAll('input[type="password"]')].filter(visible) : [];
    try {
      if (action === 'expand' && stage === 'expand') click(expand);
      else if (action === 'openLogin' && stage === 'loggedOut') click(login);
      else if (action === 'fillEmail' && stage === 'email') set(email, data.email);
      else if (action === 'submitEmail' && stage === 'email') {
        if (!email || email.value.toLowerCase() !== String(data.email).toLowerCase()) throw Error(); click(emailButton);
      } else if (action === 'fillName' && stage === 'create') set(name, data.name);
      else if (action === 'create' && stage === 'create') {
        if (!name || name.value !== data.name || (email && email.value.toLowerCase() !== String(data.email).toLowerCase())) throw Error(); click(find(['Create Account']));
      } else if (action === 'fillPassword' && stage === 'setPassword') {
        if (passwords.length !== 2 || passwords.some(e => !editable(e))) throw Error();
        passwords.forEach(e => set(e, data.password));
      } else if (action === 'submitPassword' && stage === 'setPassword') {
        if (passwords.length !== 2 || passwords.some(e => !editable(e) || e.value !== data.password)) throw Error();
        const submit = unique([...form.querySelectorAll('button[type="submit"]')].filter(visible));
        // Preserve the site's own submit handler; no preventDefault, synthetic pointers or CAPTCHA clicks.
        click(submit);
      } else return { ...snapshot, deferred: true };
      return { ...snapshot, acted: true };
    } catch { return { ...snapshot, failed: true }; }
  };
})();
