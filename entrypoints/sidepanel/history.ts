import type { RoundRecord } from '../../utils/types';
import { route } from '../../utils/arena-route';
import { escapeHtml as esc, modelPresentation } from './presentation';
const lastRender = new WeakMap<HTMLOListElement, string>();
export function renderHistoryList(list: HTMLOListElement, records: RoundRecord[]) {
  const signature = JSON.stringify(records.slice(0, 50));
  if (lastRender.get(list) === signature) return;
  lastRender.set(list, signature);
  const open = new Set(Array.from(list.querySelectorAll<HTMLDetailsElement>('details[open]')).map(el => el.dataset.key));
  if (!records.length) { list.innerHTML = '<li class="empty">暂无结果</li>'; return; }
  list.innerHTML = records.slice(0, 50).map(r => {
    const m = modelPresentation(r.model), key = `${r.at}-${r.round}-${r.kind ?? 'draw'}`;
    const time = new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const detail = [r.kind === 'fingerprint' ? '手动指纹探测' : `第 ${r.round} 轮`, r.model, r.provider && r.provider !== r.model ? r.provider : '', r.note ?? ''].filter(Boolean).join('\n');
    const url = r.conversation && route(r.conversation);
    return `<li class="${r.hit ? 'hit' : ''}"><details data-key="${esc(key)}"${open.has(key) ? ' open' : ''}><summary><span class="history-name" title="${esc(m.full)}">${esc(m.name)}</span>${m.kind ? `<span class="badge ${m.className}">${m.kind}</span>` : ''}<time class="history-time">${time}</time></summary><div class="history-detail">${esc(detail)}${url ? `<br><a href="${esc(url)}" data-open="${esc(url)}">打开会话</a>` : ''}</div></details></li>`;
  }).join('');
}
