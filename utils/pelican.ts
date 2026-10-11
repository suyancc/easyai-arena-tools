/** 鹈鹕骑车测试（移植自 automation/manual.rs pelican_send）：在当前会话中填入并点击发送一次。 */
import { route } from './arena-route';
import type { PageView } from './types';

export const PELICAN_PROMPT =
  '创建一个新 HTML，使用 SVG 绘制一个鹈鹕骑自行车的 2D 动画。页面中只展示自动播放、循环播放的动画，不要解释、说明文字、按钮、菜单或任何交互功能，不需要任何测试。';

export interface PelicanApi {
  read(prompt: string): Promise<PageView>;
  pelican(action: 'fill' | 'send', target: string, token: string, prompt: string): Promise<Record<string, unknown> | null>;
  uuid(): string;
  sleep(ms: number): Promise<void>;
}

/** 成功返回 undefined；失败抛出带原因的 Error。从不自动重发。 */
export async function sendPelican(api: PelicanApi, prompt = PELICAN_PROMPT): Promise<void> {
  const p = await api.read(prompt);
  if (!p.allowed) throw new Error('当前页面正在跳转或不是受支持的 Arena Agent/Work 对话页，请等待页面稳定后重试');
  if (p.generating || p.activity) throw new Error('当前回答仍在生成，请等待回答结束后再发送测试');
  if (!p.main || !p.editor || (p.blocker ?? '') !== '') {
    throw new Error('未检测到已登录且可用的 Arena 对话输入框，请确认登录并关闭页面提示后重试');
  }
  const target = route(p.url);
  if (!target) throw new Error('当前不是 Arena 对话页');
  const token = api.uuid();
  for (let i = 0; i < 24; i++) {
    const action = i === 0 ? 'fill' : 'send';
    const r = await api.pelican(action, target, token, prompt);
    if (r && typeof r.error === 'string') throw new Error(r.error);
    if (r && 'submitted' in r) return;
    if (r == null) throw new Error('操作结果不明确，请检查页面；不会自动重发');
    await api.sleep(250);
  }
  throw new Error('发送按钮未就绪，提示词留在输入框中；请检查后手动发送');
}
