(() => {
  // Port of the C# PelicanSend.js: fill then click Send once in the CURRENT conversation.
  // Never creates a new chat, never resends; any uncertainty aborts with an error.
  if(window.__arenaPelicanSend)return;
  const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
  const route=s=>{try{const u=new URL(s);const p=u.pathname.replace(/\/+$/,'');return u.protocol==='https:'&&u.hostname==='arena.ai'&&!u.port&&!u.username&&!u.password&&/^\/(?:agent|work)(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i.test(p)?u.origin+p.toLowerCase():null;}catch{return null;}};
  let state=null,lastSentAt=-Infinity;
  window.__arenaPelicanSend=(action,target,token,prompt)=>{
    try{
      if(!token||!prompt||!route(target)||route(location.href)!==route(target))throw Error('当前会话已切换，未继续发送');
      if(state?.token===token&&state.sent)return {submitted:true};
      const v=window.__arenaCompanion?.read(prompt);
      const mains=[...document.querySelectorAll('main')].filter(visible);
      if(!v||!v.main||!v.editor||mains.length!==1||v.generating||v.activity||v.failed||v.blocker)throw Error('请等待当前回答结束，并确认登录及页面状态');
      if([...document.querySelectorAll('[role="dialog"],[role="menu"]')].filter(visible).some(e=>!(e.getAttribute('data-sidebar')==='sidebar'&&e.getAttribute('data-mobile')==='true')))throw Error('请先关闭页面弹窗或菜单');
      const main=mains[0];
      if(v.attachmentNames?.length||[...main.querySelectorAll('[role="progressbar"],.animate-spin,[aria-busy="true"]')].some(visible))throw Error('请先移除待发送附件或等待上传完成');
      const editors=[...main.querySelectorAll('div[contenteditable="true"]')].filter(e=>visible(e)&&!e.closest('[role="log"]'));
      if(editors.length!==1)throw Error('当前输入框不唯一，未操作');
      if(action==='fill'){
        if(Date.now()-lastSentAt<10000)throw Error('刚刚已点击发送，请勿连续重复提交');
        if(v.draft&&v.draft!==prompt)throw Error('当前有其他草稿，已保留；请先自行清空后再发送测试');
        state={token,route:route(target),stamp:v.generationStamp,sent:false};
        if(!v.draft){const el=editors[0];el.focus();const range=document.createRange();range.selectNodeContents(el);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);if(!document.execCommand('insertText',false,prompt))throw Error('提示词未填入，未发送');}
        return {filled:true};
      }
      if(action!=='send'||!state||state.token!==token||state.route!==route(target)||state.stamp!==v.generationStamp)throw Error('会话内容发生变化，未继续发送');
      if(v.draft!==prompt)throw Error('草稿已改变，未发送');
      const buttons=[...main.querySelectorAll('button')].filter(e=>visible(e)&&!e.closest('[role="log"]')&&/^(Send message|发送消息)$/i.test((e.getAttribute('aria-label')||e.textContent||'').trim()));
      if(buttons.length!==1)throw Error('发送按钮不唯一，未发送');
      if(buttons[0].disabled||!v.sendReady)return {pending:true};
      state.sent=true;lastSentAt=Date.now();buttons[0].click();return {submitted:true};
    }catch(e){return {error:e.message};}
  };
})();
