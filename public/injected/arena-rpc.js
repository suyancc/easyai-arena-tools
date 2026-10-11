// 运行在页面主世界（MAIN world）的 RPC 适配层。
// 隔离世界的内容脚本通过 window.postMessage 调用这里，由这里转调桌面端同款页面脚本：
//   window.__arenaCompanion（page_bridge.js）、window.__arenaModelRename（model_rename.js）、
//   window.__arenaPelicanSend（pelican_send.js）、window.__MODEL_PROBE__（arena-model-probe.js）。
// 只返回状态/标志位，不把 Cookie 或页面正文发往扩展以外的地方。
(() => {
  if (location.hostname !== 'arena.ai' || window.__arenaVxtRpc) return;
  window.__arenaVxtRpc = true;

  const REQ = 'arena-vxt:req';
  const RES = 'arena-vxt:res';

  // 桌面端 automation.rs PROBE_SNAPSHOT 的等价实现。
  const probeSnapshot = () => {
    const a = window.__MODEL_PROBE__;
    if (!a) return { api: false };
    const s = a.runState();
    const h = s.modelHistory || [];
    let name = null, provider = null, tiered = false, foundRunId = s.runId || null;
    const m = String(location.href || '').match(/\/(?:agent|work)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    const currentChatId = m ? m[1].toLowerCase() : null;
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i] && s.runId && h[i].runId === s.runId && h[i].name) {
        name = h[i].arenaName || h[i].name; provider = h[i].name; tiered = !!h[i].arenaName; foundRunId = h[i].runId; break;
      }
    }
    if (!name && currentChatId) {
      for (let i = h.length - 1; i >= 0; i--) {
        if (h[i] && h[i].chatId === currentChatId && h[i].name) {
          name = h[i].arenaName || h[i].name; provider = h[i].name; tiered = !!h[i].arenaName; foundRunId = h[i].runId || foundRunId; break;
        }
      }
    }
    if (!name && s.modelName && (!currentChatId || !s.chatId || s.chatId === currentChatId)) {
      name = s.arenaName || s.modelName; provider = s.modelName; tiered = !!s.arenaName;
    }
    return {
      api: true, name, providerName: provider, runId: foundRunId,
      lastError: s.lastError || null, allowance: s.allowance || null,
      tierPending: name ? !tiered : null,
    };
  };

  // Review replaces or sits beside the editor; never locate it through editor.closest().
  const choiceClicks = new Map();
  const choiceVisible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const locateChoice = () => {
    const closes = [...document.querySelectorAll('main button[aria-label="Close review panel"]')]
      .filter(b => choiceVisible(b) && !b.closest('[role="log"],[role="dialog"]'));
    const panels = [...new Set(closes.map(b => b.closest('div.border-border-medium.bg-surface-secondary.rounded-md.border.shadow-sm')).filter(Boolean))];
    if (!panels.length) return { status: 'none', panelCount: 0 };
    if (panels.length !== 1) return { status: 'blocked', panelCount: panels.length };
    const cards = [...panels[0].querySelectorAll('div.divide-border-faint.border-border-faint.bg-surface-primary.divide-y.overflow-hidden.rounded-md.border')].filter(choiceVisible);
    if (cards.length !== 1) return { status: 'blocked', panelCount: 1 };
    const buttons = [...cards[0].children];
    if (buttons.length !== 3 || buttons.some(b => b.tagName !== 'BUTTON')) return { status: 'blocked', panelCount: 1 };
    const button = buttons[2];
    const label = (button.textContent || '').normalize('NFC').replace(/\s+/g, ' ').trim();
    if (!/^(계속 작업하기|Continue working|Keep working|继续工作|繼續工作|继续处理|繼續處理)$/i.test(label)) return { status: 'blocked', panelCount: 1 };
    if (!choiceVisible(button) || button.disabled || button.getAttribute('aria-disabled') === 'true') return { status: 'pending', panelCount: 1 };
    return { status: 'ready', panelCount: 1, button };
  };
  const inspectChoice = () => { const { status, panelCount } = locateChoice(); return { status, panelCount }; };
  const clickChoice = (options = {}) => {
    const currentRoute = location.origin + location.pathname.replace(/\/+$/, '').toLowerCase();
    if (options.expectedRoute && options.expectedRoute !== currentRoute) return 'blocked';
    const found = locateChoice();
    if (found.status !== 'ready') return found.status;
    const button = found.button;
    const page = window.__arenaCompanion?.read('');
    const network = window.__arenaFingerprintNetwork?.current();
    if (!page?.main || page.blocker || page.generating || page.draft || (!network && (!page.response || page.failed || page.activity)) || (network && (!network.complete || network.failed))) return 'pending';
    const signature = network?.signature || page.responseSignature;
    if (!signature || (options.expectedSignature && options.expectedSignature !== signature)) return 'blocked';
    const key = currentRoute + ':' + signature;
    if (choiceClicks.has(key)) return 'pending';
    if (choiceClicks.size >= 32) choiceClicks.delete(choiceClicks.keys().next().value);
    // Mark before click: a thrown/uncertain action must not be retried.
    choiceClicks.set(key, true);
    button.click();
    return 'clicked';
  };
  window.__arenaChoice = { click: clickChoice, inspect: inspectChoice };

  // 桌面端 quota.rs START/READ：同源读取 /api/me/pulse（剩余额度百分比）。
  const pulse = async () => {
    try {
      const r = await fetch('/api/me/pulse', { credentials: 'include', headers: { accept: 'application/json' } });
      let j = null;
      try { j = await r.json(); } catch { j = null; }
      return {
        status: r.status,
        pulse: j && typeof j.pulse === 'number' ? j.pulse : null,
        refreshedAt: j && typeof j.refreshedAt === 'string' ? j.refreshedAt : null,
      };
    } catch {
      return { status: 0, pulse: null, refreshedAt: null };
    }
  };

  const stamp = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };

  const need = (value, what) => {
    if (!value) throw new Error(what + ' 未加载，请刷新 arena.ai 页面');
    return value;
  };

  const handlers = {
    captchaInspect: () => window.__arenaCaptcha?.inspect() || null,
    captchaApply: (id, token) => need(window.__arenaCaptcha, '验证桥接脚本').apply(id, token),
    registrationForm: (action, data) => need(window.__arenaRegistrationForm, '注册页面脚本')(action, data),
    ping: () => ({
      probe: !!window.__MODEL_PROBE__, companion: !!window.__arenaCompanion,
      rename: !!window.__arenaModelRename, pelican: !!window.__arenaPelicanSend,
    }),
    read: (prompt, options) => need(window.__arenaCompanion, '页面桥接脚本').read(prompt || '', options || {}),
    action: (name, prompt, expectedRoute) => {
      try { return need(window.__arenaCompanion, '页面桥接脚本').action(name, prompt || '', expectedRoute || null); }
      catch (e) { return { error: e && e.message ? e.message : String(e) }; }
    },
    fingerprintContext: claim => need(window.__arenaFingerprintObserver, '指纹观察器').context(claim === true),
    fingerprintRelease: () => { window.__arenaFingerprintObserver?.unclaim(); return true; },
    fingerprintChoice: (prompt, expectedRoute, signature) => need(window.__arenaFingerprintBridge, '指纹桥接脚本').choice(prompt, expectedRoute, signature),
    fingerprintRead: prompt => need(window.__arenaFingerprintBridge, '指纹桥接脚本').read(prompt),
    fingerprintAction: (action, options) => need(window.__arenaFingerprintBridge, '指纹桥接脚本').action(action, options),
    fingerprintAnswer: (prompt, expectedRoute, signature) => need(window.__arenaFingerprintBridge, '指纹桥接脚本').answer(prompt, expectedRoute, signature),
    probe: probeSnapshot,
    beginTurn: (turnId) => {
      window.__arenaFingerprintObserver?.release();
      const a = window.__MODEL_PROBE__;
      if (!a) return { ok: false, reason: 'probe-api-unavailable', chatBound: false };
      if (typeof a.beginTurnInfo === 'function') return a.beginTurnInfo(turnId);
      return { ok: !!a.beginTurn(turnId), reason: 'legacy-api', chatBound: false };
    },
    snapshotTurn: (turnId) => {
      const a = window.__MODEL_PROBE__;
      if (!a || typeof a.snapshotTurn !== 'function') return { probeError: 'turn-api-unavailable' };
      return a.snapshotTurn(turnId);
    },
    endTurn: (turnId) => {
      if (window.__arenaFingerprintObserver?.retain(turnId)) return true;
      const a = window.__MODEL_PROBE__; return !!a && a.endTurn(turnId);
    },
    rename: (action, value, target) => need(window.__arenaModelRename, '重命名脚本')(action, value || '', target || ''),
    pelican: (action, target, token, prompt) => need(window.__arenaPelicanSend, '鹈鹕测试脚本')(action, target, token, prompt),
    choice: clickChoice,
    fingerprintHistory: () => window.__arenaFingerprintNetwork?.history() || null,
    historicalToolFamily: () => {
      const n = window.__arenaFingerprintNetwork?.current();
      if (!n?.complete || n.failed || n.conflict || !n.signature || !n.family) return null;
      const p = window.__arenaFingerprintBridge?.read(n.prompt);
      if (!p?.main || !p.promptConfirmed || p.generating || p.activity || p.blocker || p.draft || p.responseSignature !== n.signature) return null;
      return { family: n.family, signature: n.signature };
    },
    stamp,
    pulse,
    allowance: () => { const a = window.__MODEL_PROBE__; return a ? a.runState().allowance || null : null; },
    setProbePaused: (paused) => { window.__MODEL_PROBE_PAUSED__ = !!paused; return !!paused; },
  };

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.channel !== REQ || typeof data.id !== 'string') return;
    let result = null, error = null;
    try {
      const fn = handlers[data.method];
      if (!fn) throw new Error('未知调用：' + data.method);
      result = await fn(...(Array.isArray(data.args) ? data.args : []));
      result = result === undefined ? null : JSON.parse(JSON.stringify(result));
    } catch (e) {
      error = e && e.message ? e.message : String(e);
      result = null;
    }
    window.postMessage({ channel: RES, id: data.id, result, error }, location.origin);
  });
})();
