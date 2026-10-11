// Event-driven review dismissal. Independent of model tasks; no network effects.
(() => {
  if (location.hostname !== 'arena.ai' || window.__arenaReviewAuto) return;
  const CLOSE = 'button[aria-label="Close review panel"]';
  const PANEL = 'div.border-border-medium.bg-surface-secondary.rounded-md.border.shadow-sm';
  let timer = null, observer = null, started = false, suspended = false;
  let checks = 0, clicks = 0, status = 'initializing';
  const schedule = () => {
    if (!started || suspended || timer !== null) return;
    timer = setTimeout(() => { timer = null; check(); }, 150);
  };
  const check = () => {
    checks++;
    if (document.visibilityState === 'hidden') { status = 'hidden'; return; }
    if (!/^\/(?:work|agent)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(location.pathname)) { status = 'unsupported-route'; return; }
    try {
      const choice = window.__arenaChoice;
      if (!choice) { status = 'waiting-component'; return; }
      const panel = choice.inspect();
      if (panel.status !== 'ready') { status = panel.status; return; }
      const network = window.__arenaFingerprintNetwork?.current();
      if (!network?.complete || network.failed || !network.signature) { status = 'waiting-network'; return; }
      status = choice.click({ expectedRoute: location.origin + location.pathname.replace(/\/+$/, '').toLowerCase(), expectedSignature: network.signature });
      if (status === 'clicked') clicks++;
    } catch { status = 'error'; } // Never loop/retry after an uncertain click.
  };
  const relevant = records => {
    for (const record of records) {
      const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
      if (target?.closest?.(PANEL)?.querySelector(CLOSE)) return true;
      // Text streaming elsewhere in the chat does not cause repeated whole-page scans.
      for (const node of [...(record.addedNodes || [])].slice(0, 20)) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.(CLOSE) || node.querySelector?.(CLOSE)) return true;
      }
    }
    return false;
  };
  const start = () => {
    if (started || !document.documentElement) return;
    started = true;
    observer = new MutationObserver(records => { if (relevant(records)) schedule(); });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'hidden'] });
    schedule();
  };
  window.__arenaReviewAuto = { diagnostics: () => ({ revision: 'review-auto-v1', started, suspended, scheduled: timer !== null, status, checks, clicks }) };
  window.addEventListener('arena:fingerprint-state', schedule);
  window.addEventListener('pageshow', () => { suspended = false; start(); if (observer && document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'hidden'] }); schedule(); });
  window.addEventListener('pagehide', () => { suspended = true; observer?.disconnect(); if (timer !== null) clearTimeout(timer); timer = null; });
  document.addEventListener('visibilitychange', schedule);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
