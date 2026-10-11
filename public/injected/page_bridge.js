(() => {
  const routeKey=value=>{try{const u=new URL(value);if(u.protocol!=='https:'||u.port||u.username||u.password||!['arena.ai','arena-demo.local'].includes(u.hostname))return null;const p=u.pathname.replace(/\/+$/,'');const chat=/^\/(?:agent|work)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p);if(p==='/agent'||p==='/work'||chat)return u.origin+p.toLowerCase();if(u.hostname==='arena-demo.local'&&/^\/(?:agent|work)\/demo-[1-9][0-9]*$/.test(p))return u.origin+p;return null;}catch{return null;}};
  const routeOriginKey=value=>{try{const k=routeKey(value);return k?new URL(k).origin:null;}catch{return null;}};
  const routeModeKey=value=>{try{const k=routeKey(value);return k?new URL(k).pathname.split('/')[1].toLowerCase():null;}catch{return null;}};
  const isRootRouteKey=value=>{try{const k=routeKey(value);return !!k&&/^\/(?:agent|work)$/i.test(new URL(k).pathname);}catch{return false;}};

  const visible = el => !!el && !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const label = el => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ');
  const buttons = scope => [...scope.querySelectorAll('button')].filter(visible);
  const find = (name, scope = document) => buttons(scope).find(e => label(e) === name);
  const findSend = (scope = document) => buttons(scope).find(e => /^(Send message|发送消息|发送|Send)$/i.test(label(e)));
  // Transformed/off-screen navigation can still have client rects. Count only
  // exposed links; a mobile toggle may retain its "Expand sidebar" label when open.
  const navVisible = el => {
    if(!visible(el)||el.closest('[aria-hidden="true"],[inert]'))return false;
    const r=el.getBoundingClientRect();
    return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;
  };
  const newChatLinks = () => {const origin=routeOriginKey(location.href);if(!origin)return [];const mode=routeModeKey(location.href);const links=[...document.querySelectorAll('a[href]')].filter(e=>navVisible(e)&&isRootRouteKey(e.href)&&routeOriginKey(e.href)===origin&&/^(New Chat|新对话)$/i.test(label(e)));const sameMode=links.filter(e=>routeModeKey(e.href)===mode);return sameMode.length?sameMode:links;};
  const sidebarOpener = () => {
    if(newChatLinks().length||buttons(document).some(e=>navVisible(e)&&/^(Collapse sidebar|Close sidebar)$/.test(label(e))))return null;
    const matches=buttons(document).filter(e=>navVisible(e)&&!e.disabled&&/^(Expand sidebar|Open sidebar)$/.test(label(e))&&e.getAttribute('aria-expanded')!=='true');
    return matches.length===1?matches[0]:null;
  };
  const dialogs = () => [...document.querySelectorAll('[role="dialog"]')].filter(visible);
  const termsDialog = () => {const matches=dialogs().filter(e=>/Terms of Use & Privacy Policy/.test(e.innerText));return matches.length===1?matches[0]:null;};
  const termsButton = () => {const d=termsDialog();const matches=d?buttons(d).filter(e=>label(e)==='Agree'&&!e.disabled):[];return matches.length===1?matches[0]:null;};
  const norm=s=>(s||'').normalize('NFC').replace(/\s+/gu,' ').trim();
  const roleOf=e=>e.getAttribute('data-message-author-role')||e.getAttribute('data-message-role')||e.getAttribute('data-role')||e.getAttribute('data-author');
  const messageNodes=log=>log?[...log.querySelectorAll('[data-message-author-role],[data-message-role],[data-role],[data-author]')].filter(e=>['user','assistant'].includes(roleOf(e))&&!e.parentElement?.closest('[data-message-author-role],[data-message-role],[data-role],[data-author]')):[];
  const input = () => [...document.querySelectorAll('main div[contenteditable="true"]')].find(visible);
  const stagedNames = main => main ? buttons(main).filter(e=>!e.closest('[role="log"]')).map(label).filter(t=>t.startsWith('Remove ')).map(t=>t.slice(7)) : [];
  const writeDraft = value => {
    const el=input();if(!el)throw new Error('输入框尚未就绪');el.focus();
    const range=document.createRange();range.selectNodeContents(el);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    if(!document.execCommand('insertText',false,value))throw new Error('未能填入提示词');
  };
  // Per-document submission revision closes the identical-prompt/re-generation gap.
  if(!window.__arenaGenerationTracker) {
    const t=window.__arenaGenerationTracker={nonce:crypto.randomUUID(),revision:0,lastGenerating:false};
    document.addEventListener('click',e=>{const b=e.target.closest?.('button');if(b&&/^(Send message|发送消息|发送|Regenerate|Regenerate response|Retry response|重新生成)$/i.test(label(b)))t.revision++;},true);
    document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.target.closest?.('main [contenteditable="true"]'))t.revision++;},true);
  }
  const digest=text=>{let a=2166136261,b=5381;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b,33)^c;}return text.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16);};

  const matchPrompt = (text, prompt) => {
    if (!prompt) return true;
    const nText = norm(text);
    const nPrompt = norm(prompt);
    if (!nPrompt) return true;
    if (nText === nPrompt || nText.startsWith(nPrompt) || nText.includes(nPrompt)) return true;
    if (nPrompt.length > 25 && nText.includes(nPrompt.slice(0, 25))) return true;
    return false;
  };

  const view = (prompt, options = {}) => {
    const main = [...document.querySelectorAll('main')].find(visible);
    const log = main && [...main.querySelectorAll('[role="log"]')].find(visible);
    const text = log?.innerText.trim() || '';
    const dialog = dialogs()[0];
    const challenge = dialogs().some(e=>/Security Verification|人机身份验证/.test(e.innerText));
    const alerts = [...document.querySelectorAll('[role="alert"]')].filter(visible).map(e => e.innerText).join('\n');
    const messages = messageNodes(log);
    const users = messages.filter(e => roleOf(e) === 'user');
    const expected = norm(prompt);
    let user = users.at(-1);
    if (expected && users.length > 0) {
      const match = users.slice().reverse().find(u => matchPrompt(u.innerText || u.textContent || '', expected));
      if (match) user = match;
    }
    const userIndex = user ? messages.indexOf(user) : -1;
    const answer = userIndex >= 0 ? messages.slice(userIndex + 1).filter(e => roleOf(e) === 'assistant').at(0) : (messages.filter(e => roleOf(e) === 'assistant').at(-1) || null);
    const normalized = norm(text);
    const promptConfirmed = !expected ? true : (
      user ? matchPrompt(user.innerText || user.textContent || '', expected) :
      (normalized === expected || normalized.startsWith(expected + ' ') || normalized.includes(expected))
    );
    const response = answer ? (answer.innerText || answer.textContent || '').trim() :
      (promptConfirmed && expected ? (normalized.startsWith(expected) ? normalized.slice(expected.length).trim() : normalized) : (normalized || ''));
    const scope = answer || log;
    const generating = !!main && buttons(main).some(e => /^(Stop generating|Stop generation|Stop|停止生成|停止回答|停止)$/i.test(label(e)) && !e.disabled);
    const activity = generating || (!!scope && [...scope.querySelectorAll('[aria-busy="true"],[role="progressbar"],.animate-spin')].some(e => visible(e) && !e.closest('pre,code')));
    const answerControls = answer ? buttons(answer).filter(e => !e.closest('pre,code')) : [];
    const sendBtn = main ? (findSend(main) || find('Send message', main)) : null;
    const sendReady = !!sendBtn && !sendBtn.disabled;
    const hasCopyOrFeedback = answerControls.some(e => {
      const l = label(e);
      const aria = e.getAttribute('aria-label') || '';
      return /copy|复制|thumb|赞|踩|like|dislike|good response|bad response|regenerate|retry|重试/i.test(l) ||
             /copy|复制|thumb|赞|踩|like|dislike/i.test(aria) ||
             !!e.querySelector('svg');
    });
    const answerState = (answer?.getAttribute('data-state') || answer?.getAttribute('data-status') || '').toLowerCase();
    const isStateCompleted = /^(complete|completed|finished|done|idle)$/.test(answerState);

    const completionConfirmed = !generating && !activity && response.length > 0 && promptConfirmed && (
      isStateCompleted ||
      hasCopyOrFeedback ||
      sendReady
    );

    const errorNodes = scope ? [scope, ...scope.querySelectorAll('[role="alert"],[role="status"],[data-state="error"],[data-status="error"],[data-state="stopped"],[data-status="stopped"]')].filter(e => visible(e) && !e.closest('pre,code')) : [];
    const failed = errorNodes.some(e => /^(error|stopped|failed)$/.test(e.getAttribute('data-state') || e.getAttribute('data-status') || '') ||
      (e.getAttribute('role') === 'alert' && /stopped|error|something went wrong|failed|出错|失败|已停止/i.test(e.innerText)) ||
      (e.getAttribute('role') === 'status' && /^(Stopped|Generation stopped|Error|Something went wrong|已停止|生成已停止|生成失败)[.!。！]?$/i.test(norm(e.innerText))));

    // Observe the entire answer, not just its tail. No answer text is sent to diagnostics.
    let h1=2166136261,h2=5381;for(let i=0;i<response.length;i++){const c=response.charCodeAt(i);h1=Math.imul(h1^c,16777619);h2=Math.imul(h2,33)^c;}
    const responseSignature=response.length+':'+(h1>>>0).toString(16)+':'+(h2>>>0).toString(16);
    const includeResponseText=options&&options.includeResponseText===true;
    let responseTextOversize=false;
    if(includeResponseText){try{responseTextOversize=new TextEncoder().encode(response).byteLength>65536;}catch{responseTextOversize=true;}}
    const responseTextReady=includeResponseText&&promptConfirmed&&response.length>0&&!generating&&!activity&&!failed;
    const tracker=window.__arenaGenerationTracker;
    if(generating&&!tracker.lastGenerating)tracker.revision++;
    tracker.lastGenerating=generating;
    const generationStamp=tracker.nonce+':'+tracker.revision+':'+users.length+':'+(user?.getAttribute('data-message-id')||'')+':'+(answer?.getAttribute('data-message-id')||'')+':'+responseSignature;
    const meaningful=scope?.cloneNode(true);
    meaningful?.querySelectorAll('button,[role="status"],[role="progressbar"],time').forEach(e=>e.remove());
    const progressSignature=digest(norm(meaningful?.textContent||''));
    const blocked = challenge ? '需要人机验证' :
      find('Log In') || (dialog && /Log In to your account|Log In or Create Account/.test(dialog.innerText)) ? '请先登录 Arena' :
      /too many requests|rate limit|try again later|quota exceeded|limit reached/i.test(alerts) ? '网站限流，请稍后继续' :
      termsDialog() ? '正在处理网站首次使用条款' : '';
    return {
      url: location.href, main: !!main, conversation: !!text, promptConfirmed, generationStamp, progressSignature,
      messageIdentity:user?.getAttribute('data-message-id')||null, completionConfirmed, activity,
      thinking: !!scope && buttons(scope).filter(e=>!e.closest('pre,code')).some(e => /^(Thinking\b|Thought\b|思考|已思考)/i.test(label(e))),
      generating,
      failed,
      response: response.length > 0 && !/^(finding|waiting|initializ|starting)/i.test(response),
      responseSignature,
      draft: input()?.innerText.trim() || '', editor: !!input(), blocker: blocked,
      termsPending: !!termsButton() && blocked==='正在处理网站首次使用条款',
      sendReady,
      newLinks: newChatLinks().length,
      canExpand: !!sidebarOpener(),
      attachmentNames: stagedNames(main),
      conversationAttachments: log ? [...log.querySelectorAll('img')].filter(visible).map(e=>e.alt).filter(Boolean) : [],
      ...(includeResponseText?{responseTextOversize,...(responseTextReady&&!responseTextOversize?{responseText:response}:{})}:{}),
    };
  };
    window.__arenaCompanion = {
    extractChallenges: (prompts) => {
      if(!Array.isArray(prompts)||!prompts.length)return null;
      const main=[...document.querySelectorAll('main')].find(visible);
      const log=main&&[...main.querySelectorAll('[role="log"]')].find(visible);
      if(!log)return null;
      const msgs=messageNodes(log);
      const out=[];
      for(let i=0;i<prompts.length;i++){
        const p=prompts[i];
        const userMsg=msgs.find(m=>roleOf(m)==='user'&&matchPrompt(m.innerText||m.textContent||'',p));
        if(!userMsg)return null;
        const uIdx=msgs.indexOf(userMsg);
        const ansMsg=msgs.slice(uIdx+1).find(m=>roleOf(m)==='assistant');
        if(!ansMsg)return null;
        const text=(ansMsg.innerText||ansMsg.textContent||'').trim();
        if(!text)return null;
        out.push(text);
      }
      return out;
    },
    read: view,
    attachmentsReady: names => {
      if(!names.length)return true;
      const main=[...document.querySelectorAll('main')].find(visible);
      if(!main)return false;
      const attached=stagedNames(main);
      const busy=[...main.querySelectorAll('[role="progressbar"],.animate-spin')].some(visible);
      return !busy&&attached.length===names.length&&names.every(name=>attached.includes(name));
    },
    replaceDraft: (expected,replacement) => {
      const v=view(replacement);
      if(!v.main||v.conversation||v.generating||!v.editor||v.draft!==expected)throw new Error('草稿与预期不同，已保留');
      writeDraft(replacement);return {ok:true};
    },
    fingerprintAction: (action, opts = {}) => {
      const {prompt,previousPrompt,expectedRoute,expectedResponseSignature}=opts;
      if(!['fill','send'].includes(action)||typeof prompt!=='string'||!prompt||typeof previousPrompt!=='string'||!expectedRoute||!expectedResponseSignature)throw new Error('指纹挑战参数无效');
      if(routeKey(location.href)!==expectedRoute)throw new Error('页面在操作前发生切换，未执行指纹挑战');
      const v=view(previousPrompt);
      if(!v.main||!v.conversation||!v.promptConfirmed||!v.response||v.generating||v.activity||v.failed||v.responseSignature!==expectedResponseSignature||v.blocker)throw new Error('上一条回答或会话状态已变化，未执行指纹挑战');
      if(!v.editor)throw new Error('当前输入框尚未就绪');
      if(action==='fill'){
        if(v.draft!=='')throw new Error('发现非空草稿，未执行指纹挑战');
        writeDraft(prompt);
        return {ok:true};
      }
      if(v.draft!==prompt||!v.sendReady||!window.__arenaCompanion.attachmentsReady([]))throw new Error('发送前草稿或页面状态改变，已暂停');
      if(routeKey(location.href)!==expectedRoute)throw new Error('页面在发送前发生切换，未发送指纹挑战');
      const send=findSend(document.querySelector('main'))||find('Send message',document.querySelector('main'));
      if(!send||send.disabled)throw new Error('发送按钮未就绪');
      send.click();
      return {ok:true};
    },
    action: (name, prompt, expectedRoute) => {
      if(expectedRoute&&routeKey(location.href)!==expectedRoute)throw new Error('页面在操作前发生切换，未执行操作');
      const v = view(prompt);
      if(name==='terms'||name==='dismissTerms') {
        if(name==='terms'&&!v.termsPending)throw new Error('当前不能确认使用条款');
        const dialog=termsDialog();
        const b=name==='terms'?termsButton():dialog&&find('Close',dialog);
        if(!b)throw new Error('当前没有待处理的使用条款窗口');b.click();return {ok:true};
      }
      const rateLimitRetry=name==='retryFill'||name==='retrySend';
      if(rateLimitRetry&&termsDialog())throw new Error('使用条款尚未确认');
      if (v.blocker&&!(rateLimitRetry&&v.blocker==='网站限流，请稍后继续')) throw new Error(v.blocker);
      if(rateLimitRetry)name=name==='retryFill'?'fill':'send';
      if (!v.main) throw new Error('页面尚未就绪');
      if (name === 'expand') {
        const b = sidebarOpener(); if (b) b.click();
      } else if (name === 'stop') {
        const matches=buttons(document.querySelector('main')).filter(e=>/^(Stop generating|Stop generation|Stop|停止生成|停止回答|停止)$/i.test(label(e))&&!e.disabled);
        if(matches.length!==1)throw new Error('停止生成按钮未能唯一确认');const b=matches[0];
        if (b) b.click();
      } else if (name === 'new') {
        if (v.generating) throw new Error('请先停止当前生成');
        const links = newChatLinks();
        if (links.length !== 1) throw new Error('请展开左侧栏，显示 New Chat 按钮');
        links[0].click();
      } else if (name === 'fill') {
        if (v.conversation || v.generating || !v.editor) throw new Error('当前不是可填写的新对话');
        if (v.draft && v.draft !== prompt) throw new Error('发现不同草稿，已保留，请自行处理');
        if (!v.draft) {
          writeDraft(prompt);
        }
      } else if (name === 'send') {
        if(!window.__arenaCompanion.attachmentsReady(window.__arenaRequiredAttachments||[]))throw new Error('发送瞬间附件未确认，已暂停');
        if (v.conversation || v.generating || v.draft !== prompt || !v.sendReady) throw new Error('发送前页面状态改变，已暂停');
        const send=findSend(document.querySelector('main'))||find('Send message', document.querySelector('main'));
        if(!send||send.disabled)throw new Error('发送按钮未就绪');
        send.click();
      } else throw new Error('未知操作');
      return {ok:true};
    },
  };
})();