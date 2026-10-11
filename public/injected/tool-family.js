// Generated from the shared probe by sync-injected.mjs.
(() => {
if (location.hostname !== 'arena.ai') return;
function classifyStreamFingerprint(f) {
  const ids = f.toolIds || [], reasoning = f.reasoningIds || [], text = f.textIds || [];
  const families = new Set();
  for (const id of ids) {
    if (/^toolu_(?:vrtx_|bdrk_)?01[A-Za-z0-9]{18,}$/.test(id)) families.add('Claude');
    else if (/^call_00_[A-Za-z0-9]{24}$/.test(id)) families.add('DeepSeek');
    else if (/^call_01[0-9a-f]{30}$/.test(id)) families.add('Grok');
    else if (/^call_[0-9a-f]{24}$/.test(id)) families.add('Qwen / GLM');
    else if (/^call_[A-Za-z0-9]{20,36}$/.test(id)) families.add('GPT');
    else if (/^chatcmpl-tool-[0-9a-f]{16}$/i.test(id)) families.add('Hunyuan');
    else if (/^[A-Za-z0-9]{16}$/.test(id) && reasoning.concat(text).some(x => /^\d+$/.test(x))) families.add('Gemini');
  }
  if (reasoning.some(x => /^rs_[0-9a-f]{24}:rs_01[0-9a-f]{30}:\d+$/.test(x))) families.add('Grok');
  if (reasoning.some(x => /^rs_[0-9a-f]{48,52}:\d+$/.test(x)) && !f.reasoningCount) families.add('GPT');
  if (families.size !== 1) return null;
  const family = Array.from(families)[0];
  const answer = f.text || '';
  const cutoff = answer.match(/(20\d{2})\s*(?:年|[-/])\s*(0?[1-9]|1[0-2])(?:月|\b)/);
  return { family, name: family + '（指纹推测）', cutoff: cutoff ? cutoff[1] + '-' + cutoff[2].padStart(2, '0') : null, exact: false };
}


window.__arenaToolFamily = { classify: classifyStreamFingerprint };
})();
