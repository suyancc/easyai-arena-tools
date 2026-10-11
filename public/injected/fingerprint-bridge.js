// Plugin-only strict adapter. Shared desktop page_bridge.js remains untouched.
(() => {
  if (location.hostname !== 'arena.ai' || window.__arenaFingerprintBridge) return;
  const norm = s => String(s || '').normalize('NFC').replace(/\s+/gu, ' ').trim();
  const visible = el => !!el && !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const selector = '[data-message-author-role],[data-message-role],[data-role],[data-author]';
  const role = el => el.getAttribute('data-message-author-role') || el.getAttribute('data-message-role') || el.getAttribute('data-role') || el.getAttribute('data-author');
  const route = () => {
    const u = new URL(location.href);
    return u.protocol === 'https:' && u.hostname === 'arena.ai' && !u.port && !u.username && !u.password
      ? u.origin + u.pathname.replace(/\/+$/, '').toLowerCase() : null;
  };
  const latestPrompt = () => {
    const network = window.__arenaFingerprintNetwork;
    if (network) return network.current()?.prompt || null;
    const main = [...document.querySelectorAll('main')].find(visible);
    const log = main && [...main.querySelectorAll('[role="log"]')].find(visible);
    const users = log ? [...log.querySelectorAll(selector)].filter(e => role(e) === 'user' && !e.parentElement?.closest(selector)) : [];
    const latest = users.at(-1);
    return latest ? String(latest.innerText || latest.textContent || '').trim() : null;
  };
  // Bounded, allowlisted diagnostics. Never include text, HTML, attribute values,
  // prompt hashes, URLs, conversation IDs, network bodies, or account data.
  const events = [];
  const diagnostics = () => {
    const mains = [...document.querySelectorAll('main')];
    const main = mains.find(visible);
    const logs = main ? [...main.querySelectorAll('[role="log"]')] : [];
    const log = logs.find(visible);
    const nodes = scope => scope ? [...scope.querySelectorAll(selector)] : [];
    const all = nodes(document), inMain = nodes(main), inLog = nodes(log);
    const users = inLog.filter(e => role(e) === 'user');
    const accepted = users.filter(e => !e.parentElement?.closest(selector));
    const latest = accepted.at(-1);
    const hasText = !!latest && !!String(latest.innerText || latest.textContent || '').trim();
    const reason = !main ? 'NO_VISIBLE_MAIN' : !log ? 'NO_VISIBLE_LOG' : !users.length ? 'NO_USER_ROLE' : !accepted.length ? 'ALL_USERS_FILTERED_AS_NESTED' : !hasText ? 'EMPTY_LAST_USER' : 'READY';
    const counts = scope => ({
      messageRoles: scope.length,
      userRoles: scope.filter(e => role(e) === 'user').length,
      assistantRoles: scope.filter(e => role(e) === 'assistant').length,
    });
    return {
      schema: 'arena-fingerprint-diagnostic-v1', adapterRevision: '2026-10-11-history-family-7',
      network: window.__arenaFingerprintNetwork?.diagnostics() || null,
      review: window.__arenaChoice?.inspect() || null,
      reviewAuto: window.__arenaReviewAuto?.diagnostics() || null,
      reason: window.__arenaFingerprintNetwork ? (window.__arenaFingerprintNetwork.current() ? 'NETWORK_READY' : 'WAITING_NETWORK_SNAPSHOT') : reason, documentReady: document.readyState,
      routeKind: /^\/(agent|work)\/[^/]+\/?$/.test(location.pathname) ? 'conversation' : /^\/(agent|work)\/?$/.test(location.pathname) ? 'root' : 'other',
      components: { probe: !!window.__MODEL_PROBE__, companion: !!window.__arenaCompanion, observer: !!window.__arenaFingerprintObserver },
      dom: {
        mains: mains.length, visibleMains: mains.filter(visible).length,
        logsInDocument: document.querySelectorAll('[role="log"]').length,
        logsInSelectedMain: logs.length, visibleLogsInSelectedMain: logs.filter(visible).length,
        document: counts(all), selectedMain: counts(inMain), selectedLog: counts(inLog),
        acceptedUserMessages: accepted.length, filteredNestedUsers: users.length - accepted.length,
        hasLatestPrompt: hasText,
        contenteditableEditors: document.querySelectorAll('main [contenteditable="true"]').length,
        textareasInMain: document.querySelectorAll('main textarea').length,
        busyIndicatorsInMain: document.querySelectorAll('main [aria-busy="true"], main [role="progressbar"]').length,
        roleAttributeCounts: Object.fromEntries(['data-message-author-role', 'data-message-role', 'data-role', 'data-author'].map(name => [name, document.querySelectorAll('[' + name + ']').length])),
      },
      events: events.map(e => ({ ...e })),
    };
  };
  const recordDiagnostic = code => {
    if (!['PREFLIGHT', 'MISSING_PROMPT', 'CLAIM'].includes(code)) return;
    const report = diagnostics();
    events.push({ at: new Date().toISOString(), code, reason: report.reason });
    if (events.length > 20) events.shift();
    if (code === 'MISSING_PROMPT') console.warn('[arena-fingerprint]', JSON.stringify(diagnostics()));
  };
  const exactLatest = prompt => typeof prompt === 'string' && !!norm(prompt) && norm(latestPrompt()) === norm(prompt);
  const read = (prompt, includeResponseText = false) => {
    const network = window.__arenaFingerprintNetwork;
    const v = window.__arenaCompanion.read(network ? '' : prompt, { includeResponseText: !network && includeResponseText });
    if (network) {
      const n = network.current();
      v.conversation = !!n;
      v.promptConfirmed = !!n && norm(prompt) === norm(n.prompt);
      // Completed tool-only/artifact replies are valid anchors, not numeric samples.
      v.response = !!n && (!!n.text || n.oversize || (n.complete && !!n.signature)) && !n.failed;
      v.responseSignature = n?.signature || null;
      v.progressSignature = n?.signature || null;
      v.completionConfirmed = !!n?.complete;
      v.fingerprintInputBound = n?.inputBound === true;
      v.failed = !!n?.failed;
      v.generating = v.generating || !!n?.pending;
      v.activity = v.generating;
      if (includeResponseText && n) { v.responseText = n.text; v.responseTextOversize = n.oversize; }
    }
    v.reviewChoiceReady = window.__arenaChoice?.inspect().status === 'ready';
    if (!exactLatest(prompt)) {
      v.promptConfirmed = false; v.response = false; v.responseSignature = null;
      delete v.responseText;
    }
    return v;
  };
  const stable = v => v.main && v.conversation && v.promptConfirmed && v.response && !v.generating && !v.activity && !v.failed && !v.blocker;
  window.__arenaFingerprintBridge = {
    latestPrompt,
    diagnostics,
    recordDiagnostic,
    read: prompt => read(prompt),
    choice: (prompt, expectedRoute, signature) => {
      if (route() !== expectedRoute) return 'blocked';
      const v = read(prompt);
      if (!stable(v) || v.responseSignature !== signature || v.draft) return 'pending';
      return window.__arenaChoice?.click({ expectedRoute, expectedSignature: signature }) || 'none';
    },
    action: (action, options) => {
      if (!options || !['fill', 'send'].includes(action) || typeof options.prompt !== 'string' || options.prompt.length > 8000 || route() !== options.expectedRoute) throw new Error('指纹动作参数或会话无效');
      if (!exactLatest(options.previousPrompt)) throw new Error('上一条问题无法精确关联，未执行挑战');
      let result;
      const network = window.__arenaFingerprintNetwork;
      if (network) {
        const v = read(options.previousPrompt);
        if (!stable(v) || v.responseSignature !== options.expectedResponseSignature || !v.editor) throw new Error('发送前会话或回答状态已变化');
        const input = [...document.querySelectorAll('main [contenteditable="true"]')].filter(visible);
        if (input.length !== 1) throw new Error('输入框未能唯一确认');
        const main = input[0].closest('main');
        const attached = [...main.querySelectorAll('button')].some(b => visible(b) && /^(Remove |移除附件|删除附件)/.test(b.getAttribute('aria-label') || b.textContent || ''));
        if (attached) throw new Error('请先移除输入框中的附件，未发送挑战');
        if (action === 'fill') {
          if (v.draft) throw new Error('发现非空草稿，未执行指纹挑战');
          input[0].focus();
          const range = document.createRange(); range.selectNodeContents(input[0]);
          const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
          if (!document.execCommand('insertText', false, options.prompt)) throw new Error('未能填入提示词');
        } else {
          if (v.draft !== options.prompt || !v.sendReady) throw new Error('发送前草稿或输入框状态改变');
          const sends = [...main.querySelectorAll('button')].filter(b => visible(b) && !b.disabled && /^(Send message|发送消息|发送|Send)$/i.test(norm(b.getAttribute('aria-label') || b.textContent)));
          if (sends.length !== 1) throw new Error('发送按钮未能唯一确认');
          network.arm(options.prompt, options.expectedResponseSignature);
          sends[0].click(); // Never retry an uncertain click/request.
        }
        result = { ok: true };
      } else result = window.__arenaCompanion.fingerprintAction(action, options);
      if (route() !== options.expectedRoute) throw new Error('指纹动作期间会话变化');
      return result;
    },
    answer: (prompt, expectedRoute, signature) => {
      if (route() !== expectedRoute) throw new Error('指纹回答会话不匹配');
      const v = read(prompt, true);
      if (route() !== expectedRoute || !stable(v) || v.responseSignature !== signature || v.draft) throw new Error('指纹回答未能精确关联或尚未稳定');
      const text = typeof v.responseText === 'string' ? v.responseText : null;
      const oversize = v.responseTextOversize === true || (text !== null && new TextEncoder().encode(text).byteLength > 65536);
      return { text: oversize ? null : text, oversize };
    },
  };
})();
