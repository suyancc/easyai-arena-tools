/** 与桌面端 automation/page.rs 的 route/created/is_root_route/stable_route_read 等价。 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ARENA_ORIGIN = 'https://arena.ai';
export const ARENA_MATCH = 'https://arena.ai/*';
export const DEFAULT_ARENA_URL = 'https://arena.ai/work';

/** 官方 Arena Agent/Work 对话路由（根路由或具体会话），否则 null。 */
export function route(url: string | undefined | null): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== 'arena.ai' || u.port || u.username || u.password) return null;
  const path = u.pathname.replace(/\/+$/, '');
  if (path === '/agent') return `${ARENA_ORIGIN}/agent`;
  if (path === '/work') return `${ARENA_ORIGIN}/work`;
  const m = path.match(/^\/(agent|work)\/([^/]+)$/);
  if (!m || !m[1] || !m[2] || !UUID.test(m[2])) return null;
  return `${ARENA_ORIGIN}/${m[1]}/${m[2].toLowerCase()}`;
}

/** 已创建的具体会话路由（/agent/<uuid> 或 /work/<uuid>）。 */
export function created(url: string | undefined | null): string | null {
  const r = route(url);
  return r && (r.startsWith(`${ARENA_ORIGIN}/agent/`) || r.startsWith(`${ARENA_ORIGIN}/work/`)) ? r : null;
}

export function isRootRoute(url: string | undefined | null): boolean {
  const r = route(url);
  return r === `${ARENA_ORIGIN}/agent` || r === `${ARENA_ORIGIN}/work`;
}

/** 读取前后 URL 与 DOM 内 URL 必须一致，才认为这次页面读数可信。 */
export function stableRouteRead(before: string, pageUrl: string, after: string): boolean {
  const b = route(before);
  const p = route(pageUrl);
  const a = route(after);
  if (!p || p !== a) return false;
  return p === b || (b === `${ARENA_ORIGIN}/agent` && p === `${ARENA_ORIGIN}/work`);
}

export function isArenaUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'arena.ai';
  } catch {
    return false;
  }
}
