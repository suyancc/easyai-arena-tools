/** 侧栏会话重命名流程（移植自 automation/rename.rs，页面动作由 model_rename.js 完成）。 */

export type RenameCall = (action: string, value: string, target: string) => Promise<Record<string, unknown>>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => s.split(/\s+/).filter(Boolean).join(' ');
const flag = (state: Record<string, unknown>, key: string) => state[key] === true;
const hasTitle = (state: Record<string, unknown>, title: string) =>
  state.linkCount === 1 && typeof state.title === 'string' && norm(state.title) === norm(title);

/** 把 target 会话在侧栏中的标题改为 title；isActive() 返回 false 时中止。 */
export async function renameConversation(
  call: RenameCall,
  target: string,
  title: string,
  isActive: () => boolean,
): Promise<void> {
  const check = () => {
    if (!isActive()) throw new Error('已停止');
  };
  const rjs = async (action: string, value = '') => {
    check();
    const r = await call(action, value, target);
    check();
    if (r && typeof r.error === 'string') throw new Error(r.error);
    if (r == null) throw new Error('重命名操作未确认');
    return r;
  };
  const waitFlag = async (key: string) => {
    for (let i = 0; i < 25; i++) {
      check();
      if (flag(await rjs('state'), key)) return;
      await sleep(200);
    }
    await rjs('cleanup').catch(() => undefined);
    throw new Error('等待重命名控件超时');
  };

  const state = await rjs('state');
  if (hasTitle(state, title) && !flag(state, 'renameDialog')) return;
  if (!flag(state, 'renameDialog')) {
    if (!flag(state, 'renameMenu')) {
      const deadline = Date.now() + 10_000;
      let retry = false;
      for (;;) {
        check();
        const r = await rjs('openMenu', retry ? 'retry' : '');
        if (!flag(r, 'pending')) break;
        if (Date.now() >= deadline) throw new Error('等待侧栏中的当前对话入口超时');
        retry = true;
        await sleep(250);
      }
    }
    await waitFlag('renameMenu');
    await rjs('menuRename');
    await waitFlag('renameDialog');
  }
  check();
  await rjs('fill', title);
  // React 受控输入可能晚一帧提交，等待按钮可用。
  const saveDeadline = Date.now() + 5000;
  for (;;) {
    await sleep(150);
    check();
    const saved = await rjs('save');
    if (!flag(saved, 'pending')) break;
    if (Date.now() >= saveDeadline) throw new Error('重命名按钮等待 5 秒后仍不可用');
  }
  const deadline = Date.now() + 30_000;
  for (;;) {
    const s = await rjs('state');
    if (hasTitle(s, title) && !flag(s, 'renameDialog')) return;
    if (Date.now() >= deadline) {
      await rjs('cleanup').catch(() => undefined);
      throw new Error('重命名提交后 30 秒仍未确认');
    }
    await sleep(250);
  }
}
