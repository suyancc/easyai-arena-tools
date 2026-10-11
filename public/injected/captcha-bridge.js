// Only inspect visible reCAPTCHA v2 widgets and invoke their uniquely matched callback.
// No API key, cookies, mailbox credentials or arbitrary page text cross this bridge.
(() => {
  if (location.origin !== 'https://arena.ai') return;
  const ids = new WeakMap(), used = new Set();
  const visible = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  function callbackFor(key) {
    const found = [], visited = new Set(); let count = 0;
    function walk(object, depth) {
      if (!object || typeof object !== 'object' || object instanceof Node || visited.has(object) || depth > 8 || ++count > 600) return;
      visited.add(object);
      let props; try { props = Object.getOwnPropertyDescriptors(object); } catch { return; }
      if (props.sitekey?.value === key && typeof props.callback?.value === 'function') found.push({ fn: props.callback.value, owner: object });
      for (const p of Object.values(props).slice(0, 100)) if ('value' in p) walk(p.value, depth + 1);
    }
    walk(window.___grecaptcha_cfg?.clients, 0);
    const unique = found.filter((v, i) => found.findIndex(x => x.fn === v.fn) === i);
    return unique.length === 1 ? unique[0] : null;
  }
  function inspect() {
    const candidates = []; let unsupported = false;
    for (const frame of document.querySelectorAll('iframe[src]')) {
      let u; try { u = new URL(frame.src); } catch { continue; }
      if (u.protocol !== 'https:' || !['www.google.com', 'www.recaptcha.net', 'recaptcha.google.com'].includes(u.hostname) || !/^\/recaptcha\/(api2|enterprise)\/anchor$/.test(u.pathname)) continue;
      const key = u.searchParams.get('k'); if (!key || !/^[a-zA-Z0-9_-]{10,200}$/.test(key)) continue;
      const invisible = u.searchParams.get('size') === 'invisible';
      const dialog = frame.closest('[role="dialog"]');
      if (!visible(frame) && !(invisible && visible(dialog))) { ids.delete(frame); continue; }
      const callback = callbackFor(key); if (!callback) { unsupported = true; continue; } // Fail before billing if callback is ambiguous/unknown.
      if (!ids.has(frame)) ids.set(frame, crypto.randomUUID());
      const id = ids.get(frame);
      if (used.has(id)) continue;
      const s = u.searchParams.get('s') || frame.closest('[data-s]')?.getAttribute('data-s');
      candidates.push({ frame, callback, value: { id, key, enterprise: u.pathname.includes('/enterprise/'), invisible, domain: u.hostname.includes('recaptcha.net') ? 'recaptcha.net' : 'google.com', ...(s ? { s } : {}) } });
    }
    if (candidates.length !== 1) return unsupported || candidates.length > 1 ? { unsupported: true } : null;
    const c = candidates[0];
    try { const api = c.value.enterprise ? window.grecaptcha?.enterprise : window.grecaptcha; if (api?.getResponse?.()) return null; } catch {}
    return c;
  }
  window.__arenaCaptcha = {
    inspect: () => { const c = inspect(); return c?.value || (c?.unsupported ? { unsupported: true } : null); },
    apply: async (id, token) => {
      const current = inspect();
      if (!current?.value || current.value.id !== id || typeof token !== 'string' || !token || token.length > 16384) return { applied: false };
      used.add(id); // Mark BEFORE calling: uncertain callbacks must never replay.
      try { await current.callback.fn.call(current.callback.owner, token); return { applied: true }; }
      catch { return { applied: false }; }
    },
  };
})();
