import { defineConfig } from 'wxt';

// 页面主世界脚本（顺序有意义）：探针必须在 document_start 最早加载以接管 fetch/XHR/EventSource。
// 所有资源随插件仓库提供；scripts/sync-injected.mjs 仅校验和生成仓库内资源。
const MAIN_WORLD_SCRIPTS = [
  'injected/probe-options.js',
  'injected/tool-family.js',
  'injected/fingerprint-network.js',
  'injected/arena-model-probe.js',
  'injected/page_bridge.js',
  'injected/model_rename.js',
  'injected/pelican_send.js',
  'injected/fingerprint-bridge.js',
  'injected/fingerprint-observer.js',
  'injected/registration-form.js',
  'injected/captcha-bridge.js',
  'injected/arena-rpc.js',
  'injected/review-auto.js',
];

export default defineConfig({
  // 所有浏览器统一使用 MV3（Firefox 128+ 才支持 MAIN world 内容脚本）。
  manifestVersion: 3,
  manifest: ({ browser }) => {
    const firefox = browser === 'firefox';
    return {
      name: 'EASYAI · Arena Tools',
      icons: { 16: 'icon/32.png', 32: 'icon/32.png', 48: 'icon/64.png', 64: 'icon/64.png', 128: 'icon/128.png' },
      short_name: 'Arena Tools',
      description: 'Arena.ai 助手：抽模型、鹈鹕骑车测试、剩余额度查询。',
      permissions: firefox ? ['storage'] : ['storage', 'sidePanel'],
      host_permissions: ['https://arena.ai/*'],
      optional_host_permissions: ['https://tools.oai9.com/*', 'https://api.2captcha.com/*'],
      action: { default_title: 'EASYAI', default_icon: { 16: 'icon/32.png', 32: 'icon/32.png' } },
      ...(firefox
        ? {
            browser_specific_settings: {
              gecko: {
                id: 'arena-web-tools@easyai.local',
                strict_min_version: '128.0',
                data_collection_permissions: { required: ['none'] },
              },
            },
          }
        : {}),
    };
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      manifest.content_scripts ??= [];
      manifest.content_scripts.unshift({
        matches: ['https://arena.ai/*'],
        js: MAIN_WORLD_SCRIPTS,
        run_at: 'document_start',
        all_frames: false,
        // `world: 'MAIN'` 需要 Chrome 111+ / Edge 111+ / Firefox 128+
        world: 'MAIN',
      });
    },
  },
});
