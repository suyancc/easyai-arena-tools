/**
 * 后台：
 *  - 点击工具栏图标打开侧边栏（Chrome/Edge 用 sidePanel，Firefox 用 sidebarAction）；
 *  - 没有打开 arena.ai 标签页时，直接带 Cookie 请求 /api/me/pulse 查询额度（兜底）。
 */
import { installCaptcha } from '../utils/captcha/background';
import { browser } from 'wxt/browser';
import { installRegistration } from '../utils/registration/background';
import { createScoringService, type ServiceRequest } from '../utils/fingerprint/service';
import { defineBackground } from 'wxt/utils/define-background';
import type { PulseResponse } from '../utils/quota';
import type { BackgroundRequest } from '../utils/types';

type SidePanelApi = { setPanelBehavior(o: { openPanelOnActionClick: boolean }): Promise<void> };
type SidebarActionApi = { toggle(): Promise<void> };

async function directPulse(): Promise<PulseResponse> {
  try {
    const r = await fetch('https://arena.ai/api/me/pulse', {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    let j: { pulse?: unknown; refreshedAt?: unknown } | null = null;
    try {
      j = await r.json();
    } catch {
      j = null;
    }
    return {
      status: r.status,
      pulse: typeof j?.pulse === 'number' ? j.pulse : null,
      refreshedAt: typeof j?.refreshedAt === 'string' ? j.refreshedAt : null,
    };
  } catch {
    return { status: 0, pulse: null, refreshedAt: null };
  }
}

export default defineBackground(() => {
  installCaptcha();
  installRegistration();
  const fingerprint = createScoringService(async name => {
    // Only the three fixed asset names are ever requested by loadData.
    const response = await fetch(browser.runtime.getURL(`/fingerprint/${name}` as '/'));
    if (!response.ok) throw new Error('离线数据资源不存在');
    return response.arrayBuffer();
  }, browser.runtime.id, id => browser.tabs.get(id));
  browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
    const req = msg as ServiceRequest | null;
    if (!req || !['fingerprint:prepare', 'fingerprint:score'].includes(req.type)) return;
    void fingerprint(req, sender).then(sendResponse, () => sendResponse({ ok: false, error: '离线评分服务不可用' }));
    return true;
  });
  const api = browser as unknown as { sidePanel?: SidePanelApi; sidebarAction?: SidebarActionApi };
  if (api.sidePanel?.setPanelBehavior) {
    api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  } else if (api.sidebarAction?.toggle) {
    browser.action.onClicked.addListener(() => {
      void api.sidebarAction?.toggle();
    });
  }

  browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    const req = msg as BackgroundRequest | null;
    if (req?.type !== 'quota:direct') return;
    directPulse().then(
      (data) => sendResponse({ ok: true, data }),
      (e) => sendResponse({ ok: false, error: String(e) }),
    );
    return true;
  });
});
