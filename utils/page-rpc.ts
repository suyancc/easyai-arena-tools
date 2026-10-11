/** 隔离世界 → 页面主世界（public/injected/arena-rpc.js）的调用通道。 */
import { stableRouteRead } from './arena-route';
import type { PageView } from './types';

const REQ = 'arena-vxt:req';
const RES = 'arena-vxt:res';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
const pending = new Map<string, Pending>();
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    const d = event.data as { channel?: string; id?: string; result?: unknown; error?: string | null } | null;
    if (!d || d.channel !== RES || typeof d.id !== 'string') return;
    const p = pending.get(d.id);
    if (!p) return;
    pending.delete(d.id);
    clearTimeout(p.timer);
    if (d.error) p.reject(new Error(d.error));
    else p.resolve(d.result ?? null);
  });
}

export function rpc<T = unknown>(method: string, args: unknown[] = [], timeoutMs = 12_000): Promise<T> {
  listen();
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('网页响应超时'));
    }, timeoutMs);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    window.postMessage({ channel: REQ, id, method, args }, location.origin);
  });
}

/** 读取页面状态，并按读取前后的 URL 判断读数是否可信（allowed）。 */
export async function readPage(prompt: string): Promise<PageView> {
  const before = location.href;
  const raw = await rpc<Omit<PageView, 'allowed'> | null>('read', [prompt]);
  if (!raw || typeof raw !== 'object') throw new Error('页面状态格式无效');
  const after = location.href;
  return { ...raw, allowed: stableRouteRead(before, raw.url, after) } as PageView;
}
