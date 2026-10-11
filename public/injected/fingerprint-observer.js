// Own only passive captures; never steal a turn owned by the automatic Runner.
// No model requests are sent here. Capture starts before the user's Send action.
(() => {
  if (location.hostname !== 'arena.ai' || window.__arenaFingerprintObserver) return;
  let owned = null, expectedPrompt = null, claimed = false, pending = null;
  const probe = () => window.__MODEL_PROBE__;
  const norm = s => String(s || '').normalize('NFC').replace(/\s+/gu, ' ').trim();
  const release = () => {
    window.__arenaFingerprintNetwork?.disarm();
    if (owned) probe()?.endTurn(owned);
    owned = null; expectedPrompt = null; claimed = false; pending = null;
  };
  const begin = () => {
    if (claimed) return;
    const a = probe();
    if (!a || (a.bus.activeTurnId && a.bus.activeTurnId !== owned)) return;
    const input = [...document.querySelectorAll('main [contenteditable="true"]')].find(e => e.getClientRects().length);
    const prompt = norm(input?.innerText || input?.textContent);
    if (!prompt) return;
    release();
    const id = `manual-${crypto.randomUUID()}`;
    if (a.beginTurnInfo(id).ok) { owned = id; expectedPrompt = prompt; }
  };
  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!button || button.disabled) return;
    const label = norm(button.getAttribute('aria-label') || button.textContent);
    if (/^(Send message|发送消息|发送|Send)$/i.test(label)) begin();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.target.closest?.('main [contenteditable="true"]')) begin();
  }, true);
  window.__arenaFingerprintObserver = {
    release,
    // Release the manual lock, retaining the latest bound evidence for another
    // explicit inspection. The next ordinary Send starts a fresh capture.
    unclaim: () => {
      window.__arenaFingerprintNetwork?.disarm();
      claimed = false;
      const snapshot = owned && probe()?.snapshotTurn(owned);
      const prompt = window.__arenaFingerprintBridge?.latestPrompt();
      if (!snapshot?.captureBound || snapshot.routeMatched !== true || !prompt) { release(); return; }
      expectedPrompt = norm(prompt);
    },
    // Automatic completion can hand its still-bound capture to the passive owner.
    // The next automatic beginTurn explicitly releases this owner first.
    retain: turnId => {
      const a = probe();
      if (!a || a.bus.activeTurnId !== turnId || claimed) return false;
      const prompt = window.__arenaFingerprintBridge?.latestPrompt();
      if (!prompt) return false;
      owned = turnId; expectedPrompt = norm(prompt); return true;
    },
    context: claim => {
      const a = probe(), bridge = window.__arenaFingerprintBridge;
      if (!a || !bridge) throw new Error('指纹组件尚未就绪，请刷新页面后重试');
      if (claimed) throw new Error('指纹探测正在进行');
      if (a.bus.activeTurnId && a.bus.activeTurnId !== owned) throw new Error('请先停止当前任务');
      bridge.recordDiagnostic?.(claim ? 'CLAIM' : 'PREFLIGHT');
      const prompt = bridge.latestPrompt();
      if (!prompt) {
        bridge.recordDiagnostic?.('MISSING_PROMPT');
        const reason = bridge.diagnostics?.().reason || 'PROMPT_UNAVAILABLE';
        if (reason === 'WAITING_NETWORK_SNAPSHOT') throw new Error('尚未捕获当前会话的历史快照；请等待加载完成，更新扩展后需刷新 Arena 页面（诊断已输出到控制台）');
        throw new Error(`未能识别当前页面的用户消息（${reason}）；诊断已输出到 Arena 页面控制台`);
      }
      const page = bridge.read(prompt);
      const snapshot = owned && a.bus.activeTurnId === owned ? a.snapshotTurn(owned) : null;
      const reusable = snapshot?.captureBound && snapshot.routeMatched === true && !snapshot.familyConflict &&
        (snapshot.mode === 'RESOLVED' || (snapshot.mode === 'INFERRED' && ['openai', 'gpt', 'anthropic', 'claude', 'google', 'gemini'].includes(String(snapshot.family).toLowerCase())));
      if (reusable && norm(prompt) === expectedPrompt) {
        pending = null;
        if (claim) claimed = true;
        return { turnId: owned, prompt, page, snapshot, bootstrap: false };
      }
      // An old answer is only a DOM anchor, never identity evidence. Preflight
      // allocates a confirmation token but does not start a capture or send.
      if (!pending || pending.url !== page.url || pending.prompt !== prompt || pending.signature !== page.responseSignature) {
        pending = { turnId: `manual-${crypto.randomUUID()}`, url: page.url, prompt, signature: page.responseSignature };
      }
      const turnId = pending.turnId;
      if (!claim) return { turnId, prompt, page, snapshot: null, bootstrap: true };
      // Rechecked again in TypeScript before any fill/send; keep claim atomic.
      const target = pending;
      release();
      if (!a.beginTurnInfo(turnId).ok) throw new Error('无法开始本轮指纹捕获，请停止其他任务后重试');
      owned = turnId; expectedPrompt = norm(prompt); claimed = true;
      pending = target;
      return { turnId, prompt, page, snapshot: a.snapshotTurn(turnId), bootstrap: true };
    },
  };
})();
