// 在模型探针加载前设置选项：插件内不显示探针自带的 HUD（与桌面端 init_script 一致）。
if (location.hostname === 'arena.ai' && !window.__MODEL_PROBE__) {
  window.__MODEL_PROBE_OPTIONS__ = { showHUD: false };
}
