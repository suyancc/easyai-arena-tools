(()=>{
  // 只做一件事：把当前对话在 arena 侧栏里重命名。
  // 从原筛选助手的 CandidateBridge.js 里抽出，去掉了图集/文件/生成戳相关动作。
  // 两个必须保留的坑：Radix 菜单要用合成 pointerdown 打开；
  // 名称输入框是 React 受控输入，必须用原生 setter 写值再派发 input。
  const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
  const label=e=>(e.getAttribute('aria-label')||e.textContent||'').trim();
  const all=(q,root=document)=>[...root.querySelectorAll(q)].filter(visible);
  const key=value=>{try{const u=new URL(value,location.href);const path=u.pathname.replace(/\/+$/,'');return u.origin==='https://arena.ai'&&/^\/(?:agent|work)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path)?u.origin+path.toLowerCase():null;}catch{return null;}};
  const normalize=s=>(s||'').normalize('NFC').replace(/\s+/gu,' ').trim();
  const conversationTitle=e=>{
    // Read the complete DOM text, not a link's accessibility label or CSS ellipsis.
    const copy=e.cloneNode(true);
    copy.querySelectorAll('svg,button,[role=tooltip],[aria-hidden="true"]').forEach(n=>n.remove());
    return normalize(copy.textContent);
  };
  const renameDialog=()=>{const ds=all('[role=dialog]').filter(e=>/^Rename chat\b/.test(e.innerText));return ds.length===1?ds[0]:null;};
  // Below Tailwind's md breakpoint (<768px) arena renders the sidebar as a Radix Sheet:
  // a role=dialog carrying data-sidebar="sidebar" data-mobile="true". It is the sidebar
  // itself, not a foreign popup. Only that exact shape is exempt; anything else stays blocking.
  const isMobileSidebar=e=>e.getAttribute('data-sidebar')==='sidebar'&&e.getAttribute('data-mobile')==='true';
  const foreign=q=>all(q).filter(e=>!isMobileSidebar(e));
  window.__arenaModelRename=(action,value,target)=>{try{
   const expected=key(target||location.href);
   const links=expected?all('a[href]').filter(e=>key(e.href)===expected):[];
   if(action!=='cleanup'&&(!expected||location.origin!=='https://arena.ai'))throw Error('无法确认待重命名会话身份');
   if(action==='state')return {
    title:links.length===1?conversationTitle(links[0]):'',
     target:expected,linkCount:links.length,routeMatches:key(location.href)===expected,
    renameDialog:!!renameDialog(),
    renameMenu:all('[role=menuitem]').some(e=>label(e)==='Rename')
   };
   if(action==='cleanup') {
    const ds=foreign('[role=dialog],[role=alertdialog]'),menus=all('[role=menu]');
    if(!ds.length&&!menus.length)return {ok:true};
    if(ds.length===1&&/^Rename chat\b/.test(ds[0].innerText)&&!menus.length) {
     const bs=all('button',ds[0]).filter(e=>label(e)==='Cancel'&&!e.disabled);
     if(bs.length!==1)throw Error('无法安全关闭重命名窗口');bs[0].click();return {ok:true};
    }
    if(!ds.length&&menus.length===1&&all('[role=menuitem]',menus[0]).some(e=>label(e)==='Rename')) {
     menus[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));return {ok:true};
    }
    throw Error('存在未确认窗口，未继续自动操作');
   }
   if(action==='openMenu') {
     if(key(location.href)!==expected)throw Error('当前页面已切换，未操作其他对话');
     if(value!=='retry'||window.__arenaRenameSidebarAttempt?.target!==expected)
       window.__arenaRenameSidebarAttempt={target:expected,expanded:false};
     const attempt=window.__arenaRenameSidebarAttempt;
     if(foreign('[role=dialog],[role=alertdialog],[role=menu]').length)
       throw Error('存在未确认窗口或菜单，未展开侧栏或点击其他对话');
     if(links.length===0){
       const opener=all('button').filter(e=>!e.disabled&&(
         /^(Expand sidebar|Open sidebar|Show sidebar|展开侧边栏|打开侧边栏|展开侧栏|打开侧栏)$/i.test(label(e))||
         (/^(Toggle sidebar|切换侧边栏|切换侧栏)$/i.test(label(e))&&e.getAttribute('aria-expanded')==='false')));
       if(opener.length>1)throw Error('展开侧栏按钮不唯一，未点击');
       if(opener.length===1&&!attempt.expanded){attempt.expanded=true;opener[0].click();}
       return {pending:true};
     }
    if(links.length>1)throw Error('当前对话在侧栏中不唯一，无法定位菜单');
    links[0].scrollIntoView({block:'nearest'});
    const b=all('button',links[0].parentElement).filter(e=>label(e)==='More options');
    if(b.length!==1)throw Error('未找到当前对话的 More options 菜单');
    b[0].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse',ctrlKey:false}));
    return {ok:true};
   }
   if(action==='menuRename') {
    const b=all('[role=menuitem]').filter(e=>label(e)==='Rename');
    if(b.length!==1)throw Error('重命名菜单项不唯一或尚未出现');b[0].click();return {ok:true};
   }
   if(action==='fill') {
    const d=renameDialog();if(!d)throw Error('当前没有唯一的重命名对话框');
    if(!value||value.length>100)throw Error('名称长度错误');
    const inputs=all('input',d).filter(e=>e.type==='text');
    if(inputs.length!==1)throw Error('名称输入框不唯一');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inputs[0],value);
    inputs[0].dispatchEvent(new Event('input',{bubbles:true}));inputs[0].dispatchEvent(new Event('change',{bubbles:true}));inputs[0].focus();return {ok:true};
   }
   if(action==='save') {
    const d=renameDialog();if(!d)throw Error('当前没有唯一的重命名对话框');
    const b=all('button',d).filter(e=>label(e)==='Rename');
    if(b.length!==1)throw Error('未找到唯一的重命名按钮');if(b[0].disabled)return {pending:true};b[0].click();return {ok:true};
   }
   throw Error('未知重命名操作');
  }catch(e){return {error:e.message};}};
})();
