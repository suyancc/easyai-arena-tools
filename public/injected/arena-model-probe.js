/* arena-model-probe v1.0.0+ff86425a — 单文件注入版 (CDP / DevTools Snippet) */
(function () {
"use strict";
var __mods = {}, __cache = {};
function __req(id) {
  if (__cache[id]) return __cache[id].exp;
  var m = __mods[id]; if (!m) throw new Error("module not found: " + id);
  var exp = {}; __cache[id] = { exp: exp };
  m.fn(exp);
  return exp;
}
__mods["registry"] = { fn: function (exp) {
/**
 * registry.js — 模型指纹注册表
 *
 * 【重要】本表已用 arena.ai 排行榜的真实目录校准（966 个模型名，见 recon/catalog-full.json）。
 * 此前靠经验写的正则有明显滞后，实测发现真实代号与代际：
 *   - GPT-6 真实名：gpt-6-astra-{low,medium,max}        （代号 astra）
 *   - GPT-5.6 真实名：gpt-5.6-{sol,luna,terra}-{low,medium,high,xhigh}
 *   - Claude 5 真实名：claude-opus-5-max / claude-sonnet-5 / claude-fable-5.1-high（代号 fable、mythos）
 *   - Gemini 已到 3.8；DeepSeek 已到 v4.1；GLM 已到 5.3；Kimi 已到 K3
 *   - 另有腾讯 hunyuan、百度 ernie、stepfun、minimax-h3、字节 seed/seedream/seedance 等家族
 *
 * 三个层次：
 *  1) MODEL_PATTERNS   —— 模型 id 正则（精确命中）
 *  2) FAMILY_PROTOCOLS —— 协议/字段级指纹（model 字段被抹掉时判家族）
 *  3) CODENAME_HINTS   —— 内部代号线索（astra/fable/sol/luna/terra/mythos…）
 *
 * 未命中的未知模型由 learned.js 自动建档（支持未来新模型的核心机制）。
 */
const REGISTRY_VERSION = '2026.09.2';

/* ------------------------------------------------------------------ *
 * 1. 模型 id 正则表
 *    gen 用于代际排序；codename 记录内部代号
 * ------------------------------------------------------------------ */
const MODEL_PATTERNS = [
  // ---------- OpenAI ----------
  { family: 'openai', gen: 'gpt-6', label: 'GPT-6 系列', codename: 'astra',
    re: /\bgpt[-\s]?6(?:[-\s]?(?:astra|luna|sol|terra|nova|orion|turbo|mini|nano|pro|max|xhigh|high|medium|low|thinking|chat))?/i, weight: 0.99 },
  { family: 'openai', gen: 'gpt-5.6', label: 'GPT-5.6 系列', codename: 'sol/luna/terra',
    re: /\bgpt[-\s]?5[.\-]?6(?:[-\s]?(?:sol|luna|terra|astra))?(?:[-\s]?(?:xhigh|high|medium|low|max|instant|search|agent|text|vision|document|webdev))?/i, weight: 0.98 },
  { family: 'openai', gen: 'gpt-5.5', label: 'GPT-5.5 系列',
    re: /\bgpt[-\s]?5[.\-]?5(?:[-\s]?(?:xhigh|high|medium|low|instant|search|agent|text|vision|document|webdev|codex))?/i, weight: 0.97 },
  { family: 'openai', gen: 'gpt-5.4', label: 'GPT-5.4 系列',
    re: /\bgpt[-\s]?5[.\-]?4(?:[-\s]?(?:xhigh|high|medium|low|mini|nano|search|codex|instant|text|vision))?/i, weight: 0.96 },
  { family: 'openai', gen: 'gpt-5.3', label: 'GPT-5.3 系列',
    re: /\bgpt[-\s]?5[.\-]?3(?:[-\s]?(?:codex|chat|instant|high|medium|low))?/i, weight: 0.95 },
  { family: 'openai', gen: 'gpt-5.2', label: 'GPT-5.2 系列',
    re: /\bgpt[-\s]?5[.\-]?2(?:[-\s]?(?:codex|code|chat|high|medium|low|search|instant))?/i, weight: 0.94 },
  { family: 'openai', gen: 'gpt-5.1', label: 'GPT-5.1 系列',
    re: /\bgpt[-\s]?5[.\-]?1(?:[-\s]?(?:codex|code|chat|high|medium|low|search|instant))?/i, weight: 0.93 },
  { family: 'openai', gen: 'gpt-5', label: 'GPT-5 系列',
    re: /\bgpt[-\s]?5(?![.\-]?\d)(?:[-\s]?(?:chat|high|medium|low|mini|nano|xhigh|search|turbo))?/i, weight: 0.92 },
  { family: 'openai', gen: 'gpt-oss', label: 'GPT-OSS 开源系',
    re: /\bgpt[-\s]?oss(?:[-\s]?(?:\d+b))?/i, weight: 0.88 },
  { family: 'openai', gen: 'gpt-4.5', label: 'GPT-4.5',
    re: /\bgpt[-\s]?4[.\-]?5(?:[-\s]?(?:preview|turbo))?/i, weight: 0.9 },
  { family: 'openai', gen: 'gpt-4o', label: 'GPT-4o 系列',
    re: /\bgpt[-\s]?4o(?:[-\s]?(?:mini|realtime|audio|search|transcribe|tts|latest|\d{4}[-\d]*))?/i, weight: 0.88 },
  { family: 'openai', gen: 'gpt-image', label: 'GPT-Image 系列',
    re: /\bgpt[-\s]?image[-\s]?[\d.]+(?:[-\s]?(?:mini|high[-\s]?fidelity|flare|sunburst|medium))?/i, weight: 0.86 },
  { family: 'openai', gen: 'gpt-4', label: 'GPT-4 系列',
    re: /\bgpt[-\s]?4(?:[-\s]?(?:turbo|32k|0613|1106|0125|vision|preview|\d{4}[-\d]*))?/i, weight: 0.85 },
  { family: 'openai', gen: 'o-series', label: 'o 系列推理模型',
    re: /\bo[1-9](?:[-\s]?(?:mini|preview|pro|high|low|medium|image|video))?(?:[-\s]?\d{4}[-\d]*)?/i, weight: 0.88 },

  // ---------- Anthropic ----------
  { family: 'anthropic', gen: 'claude-5', label: 'Claude 5 代', codename: 'fable/mythos',
    re: /\bclaude[-\s]?(?:opus|sonnet|haiku|fable|mythos)?[-\s]?5(?:[.\d]+)?(?:[-\s]?(?:max|high|medium|low|xhigh|thinking|preview|latest|agent|text|vision|document|webdev|search))?/i, weight: 0.99 },
  { family: 'anthropic', gen: 'claude-4.8', label: 'Claude Opus 4.8',
    re: /\bclaude[-\s]?(?:opus|sonnet|haiku)[-\s]?4[.\-]?8(?:[-\s]?(?:thinking|vertex))?/i, weight: 0.96 },
  { family: 'anthropic', gen: 'claude-4', label: 'Claude 4 代',
    re: /\bclaude[-\s]?(?:opus|sonnet|haiku)[-\s]?4(?:[.\-][\d]+){0,2}(?:[-\s]?(?:thinking|latest|preview|vertex|search|\d{8}))?/i, weight: 0.94 },
  { family: 'anthropic', gen: 'claude-3', label: 'Claude 3 代',
    re: /\bclaude[-\s]?3(?:[.\-][\d]+)?(?:[-\s]?(?:opus|sonnet|haiku)[-\s]?\d*)?/i, weight: 0.9 },

  // ---------- Google ----------
  { family: 'google', gen: 'gemini-3.8', label: 'Gemini 3.8 代',
    re: /\bgemini[-\s]?3[.\-]?8(?:[-\s]?(?:flash|pro|lite))?(?:[-\s]?(?:high|thinking|minimal|grounding))?/i, weight: 0.98 },
  { family: 'google', gen: 'gemini-3.7', label: 'Gemini 3.7 代',
    re: /\bgemini[-\s]?3[.\-]?7(?:[-\s]?(?:flash|pro|lite))?(?:[-\s]?(?:high|thinking|minimal|grounding))?/i, weight: 0.97 },
  { family: 'google', gen: 'gemini-3.6', label: 'Gemini 3.6 代',
    re: /\bgemini[-\s]?3[.\-]?6(?:[-\s]?(?:flash|pro|lite))?(?:[-\s]?(?:high|thinking|minimal|grounding))?/i, weight: 0.96 },
  { family: 'google', gen: 'gemini-3.5', label: 'Gemini 3.5 代',
    re: /\bgemini[-\s]?3[.\-]?5(?:[-\s]?(?:flash|pro|lite))?(?:[-\s]?(?:high|thinking|minimal|grounding))?/i, weight: 0.95 },
  { family: 'google', gen: 'gemini-3.1', label: 'Gemini 3.1 代',
    re: /\bgemini[-\s]?3[.\-]?1(?:[-\s]?(?:flash|pro|lite))?(?:[-\s]?(?:image|thinking|minimal))?/i, weight: 0.94 },
  { family: 'google', gen: 'gemini-3', label: 'Gemini 3 代',
    re: /\bgemini[-\s]?3(?![.\-]?\d)(?:[-\s]?(?:flash|pro|lite|ultra|thinking|image|grounding|preview|exp))?(?:[-\s]?(?:minimal|fixed[-\s]?\d{8}))?/i, weight: 0.93 },
  { family: 'google', gen: 'gemini-2.5', label: 'Gemini 2.5 代',
    re: /\bgemini[-\s]?2[.\-]?5(?:[-\s]?(?:flash|pro|lite|image|thinking|grounding))?(?:[-\s]?(?:preview|\d{2}[-\s]?\d{2,4}|no[-\s]?system))?/i, weight: 0.9 },
  { family: 'google', gen: 'gemini-2', label: 'Gemini 2 代',
    re: /\bgemini[-\s]?2(?:[.\-]?0)?(?:[-\s]?(?:flash|pro|lite|preview))?(?:[-\s]?\d{3})?/i, weight: 0.88 },
  { family: 'google', gen: 'gemma', label: 'Gemma 开源系',
    re: /\bgemma[-\s]?[\d.]+/i, weight: 0.85 },

  // ---------- xAI ----------
  { family: 'xai', gen: 'grok-5', label: 'Grok 5 代',
    re: /\bgrok[-\s]?5(?:[.\d]+)?(?:[-\s]?(?:mini|fast|think|heavy|reasoning|search|agent))?/i, weight: 0.97 },
  { family: 'xai', gen: 'grok-4.6', label: 'Grok 4.6',
    re: /\bgrok[-\s]?4[.\-]?6(?:[-\s]?(?:reasoning|search|agent|text|vision|webdev|document))?/i, weight: 0.96 },
  { family: 'xai', gen: 'grok-4.5', label: 'Grok 4.5',
    re: /\bgrok[-\s]?4[.\-]?5(?:[-\s]?(?:reasoning|search|agent|text|vision|webdev|document))?/i, weight: 0.95 },
  { family: 'xai', gen: 'grok-4.3', label: 'Grok 4.3',
    re: /\bgrok[-\s]?4[.\-]?3(?:[-\s]?(?:reasoning|search|agent|text|vision|webdev|high))?/i, weight: 0.94 },
  { family: 'xai', gen: 'grok-4.20', label: 'Grok 4.20 (beta)',
    re: /\bgrok[-\s]?4[.\-]?20(?:[-\s]?(?:beta\d?|reasoning|multi[-\s]?agent|code))?/i, weight: 0.93 },
  { family: 'xai', gen: 'grok-4', label: 'Grok 4 代',
    re: /\bgrok[-\s]?4(?:[.\-]?1)?(?:[-\s]?(?:fast|mini|thinking|reasoning|search|chat|\d{4}))?/i, weight: 0.91 },
  { family: 'xai', gen: 'grok-3', label: 'Grok 3 代',
    re: /\bgrok[-\s]?3(?:[-\s]?(?:mini|fast|think|high|preview))?(?:[-\s]?\d{2}[-\s]?\d{2})?/i, weight: 0.88 },

  // ---------- DeepSeek ----------
  { family: 'deepseek', gen: 'v4.1', label: 'DeepSeek V4.1 代',
    re: /\bdeepseek[-\s]?v?4[.\-]?1(?:[-\s]?(?:flash|pro|max|thinking|high|text|webdev))?/i, weight: 0.98 },
  { family: 'deepseek', gen: 'v4', label: 'DeepSeek V4 代',
    re: /\bdeepseek[-\s]?v?4(?![.\-]?\d)(?:[-\s]?(?:flash|pro|max|high|thinking|text|webdev|ch\d|internal|dlp|preview))?(?:[-\s]?\d{4})?/i, weight: 0.96 },
  { family: 'deepseek', gen: 'v3.2', label: 'DeepSeek V3.2',
    re: /\bdeepseek[-\s]?v?3[.\-]?2(?:[-\s]?(?:exp|thinking))?/i, weight: 0.93 },
  { family: 'deepseek', gen: 'v3', label: 'DeepSeek V3 代',
    re: /\bdeepseek[-\s]?(?:v3|r1|coder|llm)(?:[.\-]?[\d]+)?(?:[-\s]?(?:terminus|thinking|chat))?(?:[-\s]?\d{4})?/i, weight: 0.91 },

  // ---------- 阿里 Qwen ----------
  { family: 'qwen', gen: 'qwen3.8', label: 'Qwen3.8',
    re: /\bqwen[-\s]?3[.\-]?8(?:[-\s]?(?:max|plus|turbo|flash|thinking|preview|\d+b))?/i, weight: 0.97 },
  { family: 'qwen', gen: 'qwen3.7', label: 'Qwen3.7',
    re: /\bqwen[-\s]?3[.\-]?7(?:[-\s]?(?:max|plus|turbo|flash|thinking|preview))?/i, weight: 0.96 },
  { family: 'qwen', gen: 'qwen3.5', label: 'Qwen3.5',
    re: /\bqwen[-\s]?3[.\-]?5(?:[-\s]?(?:max|plus|turbo|flash|thinking|\d+b|a\d+b))?/i, weight: 0.95 },
  { family: 'qwen', gen: 'qwen3', label: 'Qwen3 系',
    re: /\bqwen[-\s]?3(?![.\-]?\d)(?:[-\s]?(?:max|plus|turbo|flash|thinking|instruct|omni|coder|next|vl))?(?:[-\s]?(?:a?\d+b|instruct|thinking))?/i, weight: 0.93 },
  { family: 'qwen', gen: 'qwen2.5', label: 'Qwen2.5',
    re: /\bqwen[-\s]?2[.\-]?5(?:[-\s]?(?:max|plus|turbo|coder|math|vl|instruct|\d+b))?/i, weight: 0.9 },
  { family: 'qwen', gen: 'qwen-image', label: 'Qwen-Image',
    re: /\bqwen[-\s]?image(?:[-\s]?(?:edit|prompt[-\s]?extend|pro))?(?:[-\s]?[\d.]+)?(?:[-\s]?\d{4}[-\d]*)?/i, weight: 0.86 },

  // ---------- 月之暗面 / 智谱 / MiniMax / 字节 ----------
  { family: 'moonshot', gen: 'kimi-k3', label: 'Kimi K3 系',
    re: /\bkimi[-\s]?k3(?:[-\s]?(?:gateway|max|official|quickstart|v\d|code|text|webdev|thinking))?/i, weight: 0.97 },
  { family: 'moonshot', gen: 'kimi-k2.6', label: 'Kimi K2.6',
    re: /\bkimi[-\s]?k2[.\-]?6(?:[-\s]?(?:code|text|vision|document))?/i, weight: 0.96 },
  { family: 'moonshot', gen: 'kimi-k2.5', label: 'Kimi K2.5',
    re: /\bkimi[-\s]?k2[.\-]?5(?:[-\s]?(?:thinking|instant|text|vision|document|webdev|imageto[-\s]?webdev))?/i, weight: 0.95 },
  { family: 'moonshot', gen: 'kimi-k2', label: 'Kimi K2 系',
    re: /\b(?:kimi[-\s]?k2|moonshot[-\s]?v?\d)(?:[-\s]?(?:thinking|turbo|instruct|preview|\d{4}))?/i, weight: 0.93 },
  { family: 'zhipu', gen: 'glm-5.3', label: 'GLM 5.3',
    re: /\bglm[-\s]?5[.\-]?3(?:[-\s]?(?:flash|max|agent|text|vision|code|image[-\s]?to[-\s]?webdev|webdev))?/i, weight: 0.97 },
  { family: 'zhipu', gen: 'glm-5.2', label: 'GLM 5.2',
    re: /\bglm[-\s]?5[.\-]?2(?:[-\s]?(?:max|agent|code|text|flash))?/i, weight: 0.96 },
  { family: 'zhipu', gen: 'glm-5.1', label: 'GLM 5.1',
    re: /\bglm[-\s]?5[.\-]?1(?:[-\s]?(?:code|text|v))?/i, weight: 0.95 },
  { family: 'zhipu', gen: 'glm-5', label: 'GLM 5 代',
    re: /\bglm[-\s]?5(?![.\-]?\d)(?:[-\s]?(?:plus|air|flash|free|chat|thinking|v|turbo|webdev))?/i, weight: 0.93 },
  { family: 'zhipu', gen: 'glm-4', label: 'GLM 4 代',
    re: /\bglm[-\s]?4(?:[.\-][\d]+)?(?:[-\s]?(?:plus|air|flash|free|chat|v))?/i, weight: 0.88 },
  { family: 'minimax', gen: 'minimax-m3', label: 'MiniMax M3',
    re: /\bminimax[-\s]?m3(?:[-\s]?(?:first[-\s]?party))?/i, weight: 0.96 },
  { family: 'minimax', gen: 'minimax-m2', label: 'MiniMax M2 系',
    re: /\bminimax[-\s]?m2(?:[.\-]?\d)?(?:[-\s]?preview)?/i, weight: 0.94 },
  { family: 'minimax', gen: 'minimax-h3', label: 'MiniMax H3',
    re: /\bminimax[-\s]?h3(?:[-\s]?(?:max|community))?(?:[-\s]?(?:text[-\s]?to[-\s]?video|image[-\s]?to[-\s]?video))?/i, weight: 0.93 },
  { family: 'minimax', gen: 'minimax-m', label: 'MiniMax M 系',
    re: /\bminimax[-\s]?m1(?:[-\s]?preview)?|\bminimax[-\s]?(?:hailuo|abab)/i, weight: 0.88 },
  { family: 'bytedance', gen: 'seed-2.1', label: '字节 Seed 2.1',
    re: /\bseed[-\s]?2[.\-]?1(?:[-\s]?(?:pro|preview))?/i, weight: 0.95 },
  { family: 'bytedance', gen: 'seed-2.0', label: '字节 Seed 2.0',
    re: /\bseed[-\s]?2[.\-]?0(?:[-\s]?(?:pro|preview))?(?:[-\s]?(?:text|vision))?/i, weight: 0.94 },
  { family: 'bytedance', gen: 'seedream', label: '字节 Seedream',
    re: /\bseedream[-\s]?[\d._]+(?:[-\s]?(?:pro|lite|high[-\s]?res|fal))?/i, weight: 0.9 },
  { family: 'bytedance', gen: 'seedance', label: '字节 Seedance',
    re: /\bseedance(?:[-\s]?v?[\d._]+)?(?:[-\s]?(?:pro|lite|\d{3}p|text[-\s]?to|image[-\s]?to))?/i, weight: 0.88 },
  { family: 'bytedance', gen: 'doubao', label: '豆包 / Skylark',
    re: /\b(?:doubao|skylark|seededit)(?:[-\s]?[a-z0-9.\-]+)?/i, weight: 0.87 },

  // ---------- 腾讯 / 百度 / StepFun ----------
  { family: 'tencent', gen: 'hunyuan-hy3', label: '腾讯混元 HY3',
    re: /\bhunyuan[-\s]?hy3(?:[-\s]?(?:preview|code|text))?/i, weight: 0.94 },
  { family: 'tencent', gen: 'hunyuan-t1', label: '腾讯混元 T1',
    re: /\bhunyuan[-\s]?t1(?:[-\s]?\d{8})?/i, weight: 0.92 },
  { family: 'tencent', gen: 'hunyuan', label: '腾讯混元',
    re: /\bhunyuan(?:[-\s]?(?:large|standard|turbo|turbos|vision|image|video|community|default))?(?:[-\s]?[\d.]+)?(?:[-\s]?\d{4}[-\d]*)?/i, weight: 0.88 },
  { family: 'baidu', gen: 'ernie-5.1', label: '文心 ERNIE 5.1',
    re: /\bernie[-\s]?5[.\-]?1(?:[-\s]?\d{4})?(?:[-\s]?release)?/i, weight: 0.94 },
  { family: 'baidu', gen: 'ernie-5.0', label: '文心 ERNIE 5.0',
    re: /\bernie[-\s]?5[.\-]?0(?:[-\s]?(?:preview|release))?(?:[-\s]?\d{4})?/i, weight: 0.93 },
  { family: 'baidu', gen: 'ernie', label: '文心 ERNIE',
    re: /\bernir?ie(?:[-\s]?(?:exp|turbo|speed|tiny|vl))?(?:[-\s]?\d{4,6})?|\bwenxin\b/i, weight: 0.86 },
  { family: 'stepfun', gen: 'step-3.7', label: '阶跃 Step 3.7',
    re: /\bstep[-\s]?3[.\-]?7(?:[-\s]?flash)?/i, weight: 0.94 },
  { family: 'stepfun', gen: 'step-3.5', label: '阶跃 Step 3.5',
    re: /\bstep[-\s]?3[.\-]?5(?:[-\s]?flash)?/i, weight: 0.93 },
  { family: 'stepfun', gen: 'step', label: '阶跃 StepFun',
    re: /\bstep(?:fun)?[-\s]?(?:1o|1v|2|3)[-\s]?[a-z0-9\-]*/i, weight: 0.86 },

  // ---------- 其他厂商 ----------
  { family: 'meta', gen: 'llama-5', label: 'Llama 5 代',
    re: /\bllama[-\s]?5(?:[.\d]+)?(?:[-\s]?(?:scout|maverick|behemoth|instruct|vision))?/i, weight: 0.94 },
  { family: 'meta', gen: 'llama-4', label: 'Llama 4 代',
    re: /\bllama[-\s]?4(?:[.\d]+)?(?:[-\s]?(?:scout|maverick|instruct|vision))?/i, weight: 0.92 },
  { family: 'meta', gen: 'llama-3', label: 'Llama 3 代',
    re: /\bllama[-\s]?3(?:[._\-]?[\d]+)?(?:[-\s]?(?:instruct|\d+b|vision|nemotron|tulu))?/i, weight: 0.89 },
  { family: 'meta', gen: 'llama-2', label: 'Llama 2 代',
    re: /\bllama[-\s]?2(?:[-\s]?(?:chat|\d+b))?/i, weight: 0.85 },
  { family: 'mistral', gen: 'mistral-3', label: 'Mistral 3',
    re: /\bmistral[-\s]?(?:large|medium|small)[-\s]?3(?:[.\-]?\d)?(?:[-\s]?(?:v\d|text|agent|vision|webdev))?/i, weight: 0.94 },
  { family: 'mistral', gen: 'mistral', label: 'Mistral 系',
    re: /\b(?:mistral|mixtral|codestral|magistral|devstral)(?:[-\s]?[a-z0-9.\-]+)?/i, weight: 0.88 },
  { family: 'cohere', gen: 'command', label: 'Cohere Command',
    re: /\bcommand[-\s]?(?:a|r|r\+|light|nightly)(?:[-\s]?[a-z0-9.\-]*)?/i, weight: 0.88 },
  { family: 'nvidia', gen: 'nemotron-3.5', label: 'NVIDIA Nemotron 3.5',
    re: /\bnemotron[-\s]?3[.\-]?5(?:[-\s]?lightning)?(?:[-\s]?\d+b)?/i, weight: 0.93 },
  { family: 'nvidia', gen: 'nemotron-3', label: 'NVIDIA Nemotron 3',
    re: /\bnemotron[-\s]?3(?:[-\s]?(?:nano|super|ultra))?(?:[-\s]?\d+b[-\s]?a?\d+b?)?/i, weight: 0.91 },
  { family: 'nvidia', gen: 'nemotron', label: 'NVIDIA Nemotron',
    re: /\bnemotron(?:[-\s]?[a-z0-9.\-]+)?/i, weight: 0.86 },
  { family: 'microsoft', gen: 'phi', label: 'Microsoft Phi',
    re: /\bphi[-\s]?[3-9](?:[.\d]+)?(?:[-\s]?(?:mini|small|medium|vision|instruct|\d+k))?/i, weight: 0.87 },
  { family: 'ai21', gen: 'jamba', label: 'AI21 Jamba',
    re: /\bjamba(?:[-\s]?[a-z0-9.\-]+)?/i, weight: 0.86 },
  { family: 'amazon', gen: 'nova', label: 'Amazon Nova',
    re: /\b(?:amazon[-\s]?)?nova[-\s]?(?:pro|premier|lite|micro|canvas|reel|sonic)(?:[-\s]?v?\d)?/i, weight: 0.86 },
  { family: 'perplexity', gen: 'sonar', label: 'Perplexity Sonar',
    re: /\bsonar(?:[-\s]?(?:pro|reasoning|deep[-\s]?research))?/i, weight: 0.85 },

  // ---------- 网关 / 聚合层（提示是聚合而非真身）----------
  { family: '__gateway', gen: 'gateway', label: '网关/聚合层前缀',
    re: /\b(?:openrouter|azure|vertex|bedrock|together|fireworks|groq|deepinfra|perplexity|poe|you\.com|gateway|dlp[-\s]?test)\b/i, weight: 0.35 },
];

/* ------------------------------------------------------------------ *
 * 2. 协议 / 字段级指纹
 * ------------------------------------------------------------------ */
const FAMILY_PROTOCOLS = [
  {
    family: 'anthropic', weight: 0.72, label: 'Anthropic Messages API',
    tests: [
      { name: 'message_start 帧', re: /"type"\s*:\s*"message_start"/ },
      { name: 'content_block_delta 帧', re: /"type"\s*:\s*"content_block_delta"/ },
      { name: 'thinking_delta 帧', re: /"type"\s*:\s*"thinking_delta"/ },
      { name: 'stop_reason 枚举', re: /"stop_reason"\s*:\s*"(?:end_turn|max_tokens|stop_sequence|tool_use|refusal)"/ },
      { name: 'usage.cache_creation_input_tokens', re: /"cache_creation_input_tokens"/ },
      { name: 'toolu_ 工具 id', re: /\btoolu_[A-Za-z0-9]{6,}/ },
      { name: 'Anthropic 版本头', re: /anthropic-version/i },
    ],
  },
  {
    family: 'openai', weight: 0.7, label: 'OpenAI Chat Completions（协议层）',
    note: 'object/choices 等同为「OpenAI 兼容协议」共有，故单条命中权重低；'
        + '真正可区分 OpenAI 的是 chatcmpl- id 与 system_fingerprint 这类厂商独有特征',
    tests: [
      // Hunyuan's tool IDs use chatcmpl-tool-<16 hex>; don't treat that adapter prefix as OpenAI.
      { name: 'chatcmpl- id（厂商独有）', re: /\bchatcmpl-(?!tool-)[A-Za-z0-9]{6,}/i },
      { name: 'system_fingerprint（厂商独有）', re: /"system_fingerprint"\s*:\s*"/ },
      { name: 'prompt_tokens_details.cached_tokens', re: /"cached_tokens"\s*:/ },
      // Match the GPT adapter shape without reclassifying Qwen/GLM or Grok IDs.
      // A generic call_ prefix is shared by multiple providers, not vendor identity.
      { name: 'GPT 适配器工具 id（家族推测）', re: /\bcall_(?![0-9a-f]{24}\b|01[0-9a-f]{30}\b)[A-Za-z0-9]{20,36}\b/ },
      { name: 'logprobs 字段', re: /"logprobs"\s*:\s*(?:null|\[|\{)/ },
      { name: 'object=chat.completion.chunk（兼容层共有）', re: /"object"\s*:\s*"chat\.completion(?:\.chunk)?"/ },
      { name: 'choices[].delta（兼容层共有）', re: /"choices"\s*:\s*\[\s*\{[^}]*"delta"/ },
    ],
  },
  {
    family: 'openai', weight: 0.75, label: 'OpenAI Responses API',
    tests: [
      { name: 'response.created 帧', re: /"type"\s*:\s*"response\.created"/ },
      { name: 'response.output_text.delta', re: /"type"\s*:\s*"response\.output_text\.delta"/ },
      { name: 'resp_ id', re: /\bresp_[A-Za-z0-9]{6,}/ },
      { name: 'reasoning.summary 帧', re: /"type"\s*:\s*"response\.reasoning\.summary_text\.delta"/ },
    ],
  },
  {
    family: 'google', weight: 0.72, label: 'Google Generative Language API',
    tests: [
      { name: 'candidates[].content.parts', re: /"candidates"\s*:\s*\[\s*\{[^}]*"content"/ },
      { name: 'parts[].text', re: /"parts"\s*:\s*\[\s*\{[^}]*"text"/ },
      { name: 'finishReason 枚举', re: /"finishReason"\s*:\s*"(?:STOP|MAX_TOKENS|SAFETY|RECITATION|OTHER)"/ },
      { name: 'usageMetadata', re: /"usageMetadata"\s*:\s*\{/ },
      { name: 'thought:true 思维链', re: /"thought"\s*:\s*true/ },
      { name: 'generateContent 路径', re: /:generateContent|:streamGenerateContent/ },
    ],
  },
  {
    // 修正：这【不是】模型家族指纹，而是传输层指纹。
    //
    // 原实现把它标成 family:'openai'，weight:0.78 —— 这是一个严重的范畴错误：
    //   Vercel AI SDK 是厂商无关的序列化/传输层，同时封装 OpenAI、Anthropic、
    //   Google、Qwen、DeepSeek 等所有 provider。用帧类型判"openai 家族"，
    //   等于用 HTTP 判网站用哪个数据库。
    //
    // 实测反证：某次 Agent Mode 实际用的是 qwen-latest-series-invite-202608-m4
    //   （由 Trigger.dev run trace 的 span 标签证实），
    //   但原始流里 'qwen' 与 'openai' 各出现 0 次 —— 双向证据都不存在，
    //   而探针却报出「openai 家族 / 74.1%」。即：纯属假阳性。
    //
    // 因此改为 family:'__sdk_wire'，只用于识别【传输层形态】，
    // 不参与模型家族判定（classify 会忽略 __ 前缀的家族）。
    family: '__sdk_wire', weight: 0.30, label: 'Vercel AI SDK UI Message Stream（传输层）',
    note: '厂商无关的传输层：仅说明用了 AI SDK，不能推断模型家族',
    tests: [
      { name: 'start 帧', re: /"type"\s*:\s*"start"/ },
      { name: 'start-step 帧', re: /"type"\s*:\s*"start-step"/ },
      { name: 'finish-step 帧', re: /"type"\s*:\s*"finish-step"/ },
      { name: 'finish 帧带 finishReason', re: /"type"\s*:\s*"finish"[^}]*"finishReason"/ },
      { name: 'text-start 帧', re: /"type"\s*:\s*"text-start"/ },
      { name: 'text-delta 帧', re: /"type"\s*:\s*"text-delta"/ },
      { name: 'text-end 帧', re: /"type"\s*:\s*"text-end"/ },
      { name: 'reasoning-start 帧', re: /"type"\s*:\s*"reasoning-start"/ },
      { name: 'reasoning-delta 帧', re: /"type"\s*:\s*"reasoning-delta"/ },
      { name: 'tool-input-available 帧', re: /"type"\s*:\s*"tool-input-available"/ },
    ],
  },
  {
    family: '__realtime_batch', weight: 0.3, label: '自定义 realtime batch 传输层',
    note: 'arena.ai 专用：event: batch + body 内嵌 JSON 字符串',
    tests: [
      { name: 'event: batch', re: /^event:\s*batch/m },
      { name: 'records[].seq_num', re: /"records"\s*:\s*\[\s*\{[^}]*"seq_num"/ },
      { name: 'tail.seq_num', re: /"tail"\s*:\s*\{\s*"seq_num"/ },
      { name: 'ai-proxy/realtime', re: /ai-proxy\/realtime/ },
      { name: 'event: ping', re: /^event:\s*ping/m },
    ],
  },
  {
    family: 'xai', weight: 0.5, label: 'xAI (OpenAI 兼容但有独有字段)',
    tests: [
      { name: 'grok 端点', re: /api\.x\.ai|grok/i },
      { name: 'reasoning_content 字段', re: /"reasoning_content"\s*:/ },
      { name: 'search_parameters', re: /"search_parameters"\s*:/ },
    ],
  },
  {
    family: 'deepseek', weight: 0.5, label: 'DeepSeek 风格',
    tests: [
      { name: 'deepseek 端点', re: /api\.deepseek\.com|deepseek/i },
      { name: 'reasoning_content 字段', re: /"reasoning_content"\s*:/ },
      { name: 'prompt_cache_hit_tokens', re: /"prompt_cache_(?:hit|miss)_tokens"/ },
    ],
  },
  {
    // 通义千问：DashScope 原生协议与 OpenAI 兼容模式差异明显。
    //
    // 注意（实测教训）：通用字段不能用作家族指纹。
    //   曾经把 request_id、code+message 当 qwen 特征，结果任何通用 JSON
    //   （包括 Datadog 遥测上报）都能命中，造成假阳性。
    //   下面只保留真正与 DashScope 强绑定的特征。
    family: 'qwen', weight: 0.72, label: '通义千问 / DashScope',
    tests: [
      { name: 'qwen 模型名', re: /\bqwen[\w.\-]*/i },
      { name: 'DashScope 端点', re: /dashscope|aliyuncs\.com|bailian/i },
      { name: 'enable_thinking 参数（阿里独有）', re: /"enable_thinking"\s*:/ },
      { name: 'enable_search 参数（阿里独有）', re: /"enable_search"\s*:/ },
      { name: 'output.choices 结构（DashScope 独有）', re: /"output"\s*:\s*\{[^}]*"choices"/ },
      { name: 'output.finish_reason（DashScope 独有）', re: /"finish_reason"\s*:\s*"(?:stop|null|length|tool_calls)"[^}]*"output"/ },
      { name: 'usage.output_tokens+input_tokens（DashScope 命名）', re: /"output_tokens"\s*:\s*\d+[^}]*"input_tokens"\s*:\s*\d+/ },
    ],
  },
  {
    family: '__sse_generic', weight: 0.2, label: '通用 SSE（无家族特征）',
    tests: [{ name: 'SSE 分帧', re: /^\s*data:\s*\{/m }],
  },
];

/* ------------------------------------------------------------------ *
 * 3. 端点主机 → 厂商
 * ------------------------------------------------------------------ */
const HOST_VENDOR = [
  [/api\.openai\.com|openai\.azure\.com|\.openai\.azure\.com/i, 'openai', 0.85],
  [/api\.anthropic\.com|claude\.ai/i, 'anthropic', 0.85],
  [/generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com|makersuite|aistudio/i, 'google', 0.85],
  [/api\.x\.ai|x\.ai/i, 'xai', 0.85],
  [/api\.deepseek\.com|deepseek/i, 'deepseek', 0.85],
  [/dashscope|aliyuncs\.com|bailian/i, 'qwen', 0.8],
  [/api\.moonshot\.(?:cn|ai)|kimi\.com/i, 'moonshot', 0.8],
  [/open\.bigmodel\.cn|zhipu/i, 'zhipu', 0.8],
  [/minimax(?:i)?\.(?:com|chat|io)/i, 'minimax', 0.8],
  [/ark\.cn-beijing\.volces\.com|volces\.com|doubao/i, 'bytedance', 0.8],
  [/hunyuan\.tencent\.com|tencent/i, 'tencent', 0.8],
  [/ernie\.baidu\.com|baidubce/i, 'baidu', 0.8],
  [/stepfun\.(?:ai|com)/i, 'stepfun', 0.8],
  [/api\.mistral\.ai/i, 'mistral', 0.8],
  [/api\.cohere\.ai/i, 'cohere', 0.8],
  [/openrouter\.ai/i, '__gateway:openrouter', 0.6],
  [/api\.together\.xyz/i, '__gateway:together', 0.6],
  [/api\.groq\.com/i, '__gateway:groq', 0.6],
  [/api\.fireworks\.ai/i, '__gateway:fireworks', 0.6],
  [/api\.perplexity\.ai/i, '__gateway:perplexity', 0.6],
];

/* ------------------------------------------------------------------ *
 * 4. 匿名槽位 / 代号线索
 * ------------------------------------------------------------------ */
const ANON_SLOT_RE = /\b(?:model[-\s]?[abAB]\b|assistant[-\s]?[abAB]\b|side[-\s]?(?:by[-\s]?side|[abAB])\b|匿名模型\s*[AB]|模型\s*[AB]\b|slot[-\s]?[abAB]\b)/;

/** 实测收集到的内部代号（来自 arena.ai 排行榜），用于识别"未公开名" */
const KNOWN_CODENAMES = {
  astra: 'openai', luna: 'openai', sol: 'openai', terra: 'openai',
  fable: 'anthropic', mythos: 'anthropic',
  'ch1': 'deepseek', 'ch3': 'deepseek',
};

/* ------------------------------------------------------------------ *
 * 5. 响应头 / JSON 键
 * ------------------------------------------------------------------ */
const MODEL_HEADER_RE = /^(?:x-)?(?:upstream-)?(?:served-|resolved-)?model(?:-id|-name|-slug)?$|^openai-model$|^x-model$|^x-llm-model$|^x-upstream$/i;
const MODEL_KEY_RE = /^(?:model|model_id|modelId|model_name|modelName|model_slug|modelSlug|resolved_model|resolved_model_id|served_model|engine|deployment|deployment_name|upstream_model|backend_model|base_model|provider_model|publicName|winningModelId|modelAId|modelBId|selected_model_id|resolved_model_id)$/;
const USAGE_KEYS = [
  'prompt_tokens', 'completion_tokens', 'total_tokens',
  'input_tokens', 'output_tokens',
  'prompt_tokens_details', 'completion_tokens_details',
  'cached_tokens', 'reasoning_tokens', 'cache_creation_input_tokens',
  'cache_read_input_tokens', 'prompt_cache_hit_tokens', 'usageMetadata',
];

/* ------------------------------------------------------------------ *
 * 6. 代际排序（判断"是不是最新一代"）
 * ------------------------------------------------------------------ */
const GEN_ORDER = {
  openai: ['gpt-4', 'gpt-4o', 'gpt-4.5', 'o-series', 'gpt-5', 'gpt-5.1', 'gpt-5.2', 'gpt-5.3', 'gpt-5.4', 'gpt-5.5', 'gpt-5.6', 'gpt-6'],
  anthropic: ['claude-3', 'claude-4', 'claude-4.8', 'claude-5'],
  google: ['gemini-2', 'gemini-2.5', 'gemini-3', 'gemini-3.1', 'gemini-3.5', 'gemini-3.6', 'gemini-3.7', 'gemini-3.8'],
  xai: ['grok-3', 'grok-4', 'grok-4.20', 'grok-4.3', 'grok-4.5', 'grok-4.6', 'grok-5'],
  deepseek: ['v3', 'v3.2', 'v4', 'v4.1'],
  qwen: ['qwen2.5', 'qwen3', 'qwen3.5', 'qwen3.7', 'qwen3.8'],
  meta: ['llama-2', 'llama-3', 'llama-4', 'llama-5'],
  moonshot: ['kimi-k2', 'kimi-k2.5', 'kimi-k2.6', 'kimi-k3'],
  zhipu: ['glm-4', 'glm-5', 'glm-5.1', 'glm-5.2', 'glm-5.3'],
  minimax: ['minimax-m', 'minimax-h3', 'minimax-m2', 'minimax-m3'],
  bytedance: ['doubao', 'seed-2.0', 'seed-2.1'],
  tencent: ['hunyuan', 'hunyuan-t1', 'hunyuan-hy3'],
  baidu: ['ernie', 'ernie-5.0', 'ernie-5.1'],
  stepfun: ['step', 'step-3.5', 'step-3.7'],
  mistral: ['mistral', 'mistral-3'],
  nvidia: ['nemotron', 'nemotron-3', 'nemotron-3.5'],
};

/** 该 family 已知最新代际，用于标注"前沿/非前沿" */
function isFrontier(family, gen) {
  const list = GEN_ORDER[family];
  if (!list || !gen) return null;
  return list[list.length - 1] === gen;
}

  exp.REGISTRY_VERSION = REGISTRY_VERSION;
  exp.MODEL_PATTERNS = MODEL_PATTERNS;
  exp.FAMILY_PROTOCOLS = FAMILY_PROTOCOLS;
  exp.HOST_VENDOR = HOST_VENDOR;
  exp.ANON_SLOT_RE = ANON_SLOT_RE;
  exp.KNOWN_CODENAMES = KNOWN_CODENAMES;
  exp.MODEL_HEADER_RE = MODEL_HEADER_RE;
  exp.MODEL_KEY_RE = MODEL_KEY_RE;
  exp.USAGE_KEYS = USAGE_KEYS;
  exp.GEN_ORDER = GEN_ORDER;
  exp.isFrontier = isFrontier;
} };
__mods["classify"] = { fn: function (exp) {
  var MODEL_PATTERNS = __req("registry").MODEL_PATTERNS;
  var FAMILY_PROTOCOLS = __req("registry").FAMILY_PROTOCOLS;
  var HOST_VENDOR = __req("registry").HOST_VENDOR;
  var MODEL_KEY_RE = __req("registry").MODEL_KEY_RE;
  var USAGE_KEYS = __req("registry").USAGE_KEYS;
  var MODEL_HEADER_RE = __req("registry").MODEL_HEADER_RE;
  var isFrontier = __req("registry").isFrontier;
/**
 * classify.js — 证据融合与判定引擎
 *
 * 原理：模型身份不是"猜"出来的，是从多层证据里"收敛"出来的。
 * 每一条证据 = { source, weight, modelId?, family?, detail }
 * 判定 = 按 modelId 聚合 → 取最高权重链路 → 用来源权威性折算置信度。
 *
 * 关键设计：区分两类判定
 *   - RESOLVED  ：拿到权威 model 字符串（请求体/响应体/响应头）→ 高置信
 *   - INFERRED  ：只拿到协议/行为指纹 → 家族级判定 + 代际推断，不谎报具体版本
 */

/* ------------------------------------------------------------------ *
 * 证据来源权威性权重（上限，实际取 min(上限, 该来源具体权重)）
 * ------------------------------------------------------------------ */
const SOURCE_WEIGHTS = {
  // 真实模型名：来自 Trigger.dev run 的 streamText span 标签，由 worker 写入，
  // 不经任何网关改写 —— 这是当前能拿到的最权威来源，故置于最高权重。
  'run.trace.model':           1.00,
  'request.body.model':        1.00, // 我们发出去的请求体，同样可信
  'response.header.model':     0.95,
  'response.json.model':       0.93,
  'idmap.resolve':             0.92, // UUID → 官方模型名（来自排行榜 initialModels 映射）
  'sse.chunk.model':           0.90,
  'url.path.model':            0.85,
  'response.header.provider':  0.80,
  'url.host.vendor':           0.80,
  'protocol.framing':          0.72,
  'request.header':            0.60,
  'dom.text':                  0.45,
  'behavior.probe':            0.35,
  'self.report':               0.15,
};

/* ------------------------------------------------------------------ *
 * 工具：深度遍历 JSON，收集所有疑似模型标识
 * ------------------------------------------------------------------ */
function collectModelFields(node, path = '$', out = [], depth = 0, maxDepth = 12) {
  if (depth > maxDepth || node == null) return out;
  if (typeof node !== 'object') return out;

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) collectModelFields(node[i], `${path}[${i}]`, out, depth + 1, maxDepth);
    return out;
  }

  for (const [k, v] of Object.entries(node)) {
    const p = `${path}.${k}`;
    if (MODEL_KEY_RE.test(k) && typeof v === 'string' && v.length >= 2 && v.length <= 120) {
      out.push({ path: p, key: k, value: v });
    } else if (k === 'model' && Array.isArray(v)) {
      v.forEach((m, i) => { if (typeof m === 'string') out.push({ path: `${p}[${i}]`, key: 'model', value: m }); });
    } else if (v && typeof v === 'object') {
      collectModelFields(v, p, out, depth + 1, maxDepth);
    }
  }
  return out;
}

/** 从原始文本里正则兜底抓 model 字符串（应对截断的 SSE / 非 JSON 响应） */
function scanTextForModel(text) {
  const found = [];
  // 后台空闲标签已暂停:跳过逐帧正则扫描(SSE/WS 每条消息都会走到这里)。
  if (window.__MODEL_PROBE_PAUSED__) return found;
  if (typeof text !== 'string' || !text) return found;
  const re = /"(?:model|model_id|modelId|model_name|served_model|upstream_model|resolved_model)"\s*:\s*"([^"\\]{2,120})"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!found.includes(m[1])) found.push(m[1]);
  }
  return found;
}

/** 从 URL 主机名推断厂商 */
function vendorFromUrl(url) {
  if (!url) return null;
  let host = url;
  try { host = new URL(url, 'https://x.invalid').host || url; } catch { /* keep raw */ }
  for (const [re, vendor, weight] of HOST_VENDOR) {
    if (re.test(host) || re.test(url)) return { vendor, weight, host };
  }
  return { vendor: null, weight: 0, host };
}

/** 匹配所有已知模型正则，返回按权重排序的候选 */
function matchKnownModels(str, cap = 6) {
  const out = [];
  if (!str || typeof str !== 'string') return out;
  for (const p of MODEL_PATTERNS) {
    const m = str.match(p.re);
    if (m) out.push({
      family: p.family, gen: p.gen, label: p.label,
      matched: m[0], weight: p.weight, modelId: str,
      frontier: isFrontier(p.family, p.gen),
    });
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, cap);
}

/** 协议指纹：判断一段流/JSON 属于哪个家族 */
function protocolFingerprint(text) {
  // 与 scanTextForModel 同一开关:暂停时不做协议指纹匹配。
  if (window.__MODEL_PROBE_PAUSED__) return [];
  if (!text || typeof text !== 'string') return [];

  // 关键：arena.ai 的 realtime batch 把真实帧作为「JSON 字符串」嵌在 body 里，
  // 于是文本中的引号是转义形态 \"type\":\"start\"。
  // 只按未转义文本匹配会全部漏判（实测踩过：完整解出了 start/text-delta 等帧，
  // 但家族判定仍是「通用 SSE」）。因此这里同时匹配原始文本与反转义文本。
  const unescaped = text.includes('\\"') ? text.replace(/\\"/g, '"') : null;

  const hits = [];
  for (const proto of FAMILY_PROTOCOLS) {
    const matched = proto.tests
      .filter(t => t.re.test(text) || (unescaped && t.re.test(unescaped)))
      .map(t => t.name);
    if (!matched.length) continue;
    // 命中测试越多越可信；单条命中按 60% 折算，避免"reasoning_content"这类共用字段误判
    const ratio = matched.length / proto.tests.length;
    const conf = proto.weight * (matched.length >= 2 ? (0.75 + 0.25 * ratio) : 0.6);
    hits.push({ family: proto.family, label: proto.label, matched, score: +conf.toFixed(4) });
  }
  return hits.sort((a, b) => b.score - a.score);
}

/** 响应头 → 证据 */
function evidenceFromHeaders(headerObj, url = '') {
  const ev = [];
  if (!headerObj) return ev;
  const entries = headerObj instanceof Map ? [...headerObj.entries()]
    : Array.isArray(headerObj) ? headerObj
    : Object.entries(headerObj);

  for (const [k, v] of entries) {
    if (v == null) continue;
    const key = String(k).toLowerCase();
    if (MODEL_HEADER_RE.test(key) && typeof v === 'string') {
      ev.push({ source: 'response.header.model', weight: SOURCE_WEIGHTS['response.header.model'], modelId: v, detail: `${key}: ${v}` });
    }
    if (key === 'server' || key === 'x-served-by' || key === 'via') {
      const vd = vendorFromUrl(String(v));
      if (vd.vendor) ev.push({ source: 'response.header.provider', weight: 0.5, family: vd.vendor, detail: `${key}: ${v}` });
    }
  }
  const vd = vendorFromUrl(url);
  if (vd.vendor) ev.push({ source: 'url.host.vendor', weight: vd.weight, family: vd.vendor, detail: `host ${vd.host}` });
  return ev;
}

/* ------------------------------------------------------------------ *
 * 证据 → 判定
 * ------------------------------------------------------------------ */
function classify(evidence = []) {
  const byModel = new Map();   // modelId -> {score, sources[], family, gen}
  const familyAgg = new Map(); // family -> score

  const list = Array.isArray(evidence) ? evidence : [];
  const wireAgg = new Map();   // 传输层标记（__ 前缀），不参与模型家族判定
  for (const e of list) {
    if (!e || typeof e !== 'object' || e.weight == null) continue;

    // 家族级累积。
    //
    // 关键修正：以 __ 开头的条目表示【传输层/网关形态】（如 __sdk_wire、
    // __realtime_batch、__sse_generic），它们与"是哪个模型"无关——
    // Vercel AI SDK 同时封装 OpenAI/Anthropic/Google/Qwen 等所有 provider。
    // 若把它们并入家族判定，就会用"传输协议"冒充"模型家族"，产生假阳性
    // （实测踩过：真身是 qwen，却报出 openai 家族 74.1%）。
    if (e.family && String(e.family).startsWith('__')) {
      const w = wireAgg.get(e.family) || { family: e.family, score: 0, sources: [] };
      w.score = Math.max(w.score, e.weight);
      w.sources.push(e.source);
      wireAgg.set(e.family, w);
      continue;
    }

    if (e.family) {
      const f = familyAgg.get(e.family) || { family: e.family, score: 0, sources: [] };
      f.score = Math.max(f.score, e.weight);
      f.sources.push(e.source);
      familyAgg.set(e.family, f);
    }

    // 模型串级累积（只对"名字像模型"的串做正则归类）
    if (e.modelId) {
      const known = matchKnownModels(e.modelId);
      const key = e.modelId.trim();
      if (!key || key.length > 120) continue;
      const rec = byModel.get(key) || { modelId: key, score: 0, sources: [], matches: known };
      rec.score = Math.max(rec.score, Math.min(e.weight, SOURCE_WEIGHTS[e.source] ?? e.weight));
      rec.sources.push({ source: e.source, detail: e.detail || '' });
      if (!rec.matches.length && known.length) rec.matches = known;
      byModel.set(key, rec);
    }
  }

  const candidates = [...byModel.values()].sort((a, b) => b.score - a.score);
  const top = candidates[0] || null;

  // ---- 判定 1：拿到权威模型串 ----
  if (top && top.score >= 0.55) {
    const best = top.matches[0] || null;
    const agree = candidates.filter(c => c.matches[0]
      && best && c.matches[0].family === best.family && c.matches[0].gen === best.gen).length;
    const agreeBoost = Math.min(0.05, Math.max(0, agree - 1) * 0.02);

    return {
      mode: 'RESOLVED',
      modelId: top.modelId,
      family: best ? best.family : null,
      gen: best ? best.gen : null,
      label: best ? best.label : null,
      frontier: best ? best.frontier : null,
      confidence: +Math.min(0.99, top.score + agreeBoost).toFixed(3),
      evidence: top.sources,
      protocol: null,
      alternatives: candidates.slice(1, 5).map(c => ({
        modelId: c.modelId, confidence: +c.score.toFixed(3),
        family: c.matches[0] ? c.matches[0].family : null,
        gen: c.matches[0] ? c.matches[0].gen : null,
      })),
    };
  }

  // ---- 判定 2：只有家族级证据 ----
  const famTop = [...familyAgg.values()].sort((a, b) => b.score - a.score)[0];
  const wireTop = [...wireAgg.values()].sort((a, b) => b.score - a.score)[0];
  const protoEv = evidence.filter(e => e && e.source === 'protocol.framing');
  if (famTop && famTop.score >= 0.4) {
    return {
      mode: 'INFERRED',
      modelId: null,
      family: famTop.family,
      gen: null,
      label: `${famTop.family} 家族（具体版本未暴露）`,
      frontier: null,
      confidence: +Math.min(0.85, famTop.score).toFixed(3),
      evidence: protoEv.length ? protoEv : [{ source: 'family.aggregate', detail: famTop.sources.join(',') }],
      protocol: wireTop ? wireTop.family : null,
      wire: wireTop ? wireTop.family : null,
      alternatives: [],
      note: '上游 model 字段被网关抹除。可读取 Trigger.dev run trace 的 span 标签获得真实模型名。',
    };
  }

  // ---- 判定 2b：只有传输层证据 → 必须明说「模型家族未知」----
  //
  // 这是修正后的诚实行为。之前会把传输层当成 openai 家族报出去，
  // 属于用协议冒充模型身份。现在改为：说明用了什么传输层，
  // 但明确 modelFamily 未知，不给出任何家族猜测。
  if (wireTop) {
    const WIRE_LABEL = {
      '__sdk_wire': 'Vercel AI SDK UI Message Stream',
      '__realtime_batch': '自定义 realtime batch 传输',
      '__sse_generic': '通用 SSE',
    };
    return {
      mode: 'UNKNOWN',
      modelId: null,
      family: null,
      gen: null,
      label: '模型家族未知（仅识别出传输层）',
      frontier: null,
      confidence: 0,
      evidence: protoEv,
      protocol: wireTop.family,
      wire: wireTop.family,
      wireLabel: WIRE_LABEL[wireTop.family] || wireTop.family,
      alternatives: [],
      note: '传输层与模型家族无关（同一协议可封装任意厂商模型），'
          + '因此不据此推断家族。'
          + '如需真实模型名，读取 Trigger.dev run trace 的 span 标签。',
    };
  }

  return {
    mode: 'UNKNOWN', modelId: null, family: null, gen: null, label: '未识别',
    frontier: null, confidence: 0, evidence, protocol: null, alternatives: [],
    note: '尚未捕获到可判定的网络证据。请在页面发一条消息后重试。',
  };
}

/* ------------------------------------------------------------------ *
 * 指纹向量：用于未知模型自动建档与相似度比对
 *   —— 这是"支持未来新模型"的核心机制：
 *      不靠写死 GPT-6 的正则，而是把每次观测变成向量，落到本地 learned.json。
 *      下次遇到同源模型即命中；遇到新模型则新建档并标记 NEW。
 * ------------------------------------------------------------------ */
const FP_DIMS = [
  'ttft_ms', 'tok_per_sec', 'out_in_ratio', 'len_chars',
  'p_openai_chat', 'p_openai_resp', 'p_anthropic', 'p_google',
  'has_reasoning_field', 'has_cached_tokens', 'has_cache_creation',
  'has_system_fingerprint', 'has_toolu', 'has_call', 'has_fc',
  'prompt_tokens', 'completion_tokens', 'reasoning_ratio',
];
function fingerprintVector(obs = {}) {
  const t = obs.text || '';
  const n = (v, d) => (Number.isFinite(v) ? v : d);
  const promptTok = n(obs.promptTokens, 0);
  const compTok = n(obs.completionTokens, 0);
  const reasonTok = n(obs.reasoningTokens, 0);

  // 关键：时序维度必须饱和归一化到 0~1。
  // 否则 tok_per_sec 可以到 6+，在余弦相似度里单维压过其余 17 维，
  // 一点网络抖动就把同一模型判成"没见过的新模型"。
  const sat = (x, scale) => 1 - Math.exp(-Math.max(0, x) / scale);
  const decodeMs = n(obs.totalMs, 0) - n(obs.ttftMs, 0);
  const tps = decodeMs > 0 ? compTok / (decodeMs / 1000) : 0;

  return {
    ttft_ms: sat(n(obs.ttftMs, 0), 1500),
    tok_per_sec: sat(tps, 80),
    out_in_ratio: Math.min(1, compTok / Math.max(1, promptTok) / 4),
    len_chars: sat(t.length, 20000),
    p_openai_chat: /"object"\s*:\s*"chat\.completion|chatcmpl-(?!tool-)/.test(t) ? 1 : 0,
    p_openai_resp: /response\.(created|output_text\.delta)|resp_/.test(t) ? 1 : 0,
    p_anthropic: /message_start|content_block_delta|toolu_/.test(t) ? 1 : 0,
    p_google: /"candidates"|usageMetadata|finishReason/.test(t) ? 1 : 0,
    has_reasoning_field: /"reasoning_content"|"reasoning"\s*:|thinking_delta/.test(t) ? 1 : 0,
    has_cached_tokens: /"cached_tokens"\s*:/.test(t) ? 1 : 0,
    has_cache_creation: /cache_creation_input_tokens/.test(t) ? 1 : 0,
    has_system_fingerprint: /"system_fingerprint"\s*:\s*"/.test(t) ? 1 : 0,
    has_toolu: /toolu_/.test(t) ? 1 : 0,
    has_call: /call_[A-Za-z0-9]{6,}/.test(t) ? 1 : 0,
    has_fc: /"fc_[A-Za-z0-9]{4,}"|functionCall/.test(t) ? 1 : 0,
    prompt_tokens: sat(promptTok, 4000),
    completion_tokens: sat(compTok, 4000),
    reasoning_ratio: Math.min(1, reasonTok / Math.max(1, compTok)),
  };
}

/**
 * 加权余弦相似度：结构性维度（协议/字段）权重高于时序维度。
 * 原因：结构是"型号"级别的稳定特征，时序只是"负载"级别的噪声特征。
 */
const FP_WEIGHTS = {
  ttft_ms: 0.4, tok_per_sec: 0.4, out_in_ratio: 0.6, len_chars: 0.4,
  p_openai_chat: 2.0, p_openai_resp: 2.0, p_anthropic: 2.0, p_google: 2.0,
  has_reasoning_field: 1.5, has_cached_tokens: 1.2, has_cache_creation: 1.5,
  has_system_fingerprint: 1.5, has_toolu: 1.5, has_call: 1.2, has_fc: 1.2,
  prompt_tokens: 0.4, completion_tokens: 0.5, reasoning_ratio: 1.0,
};
function cosineSim(a, b, dims = FP_DIMS) {
  let dot = 0, na = 0, nb = 0;
  for (const d of dims) {
    const w = FP_WEIGHTS[d] || 1;
    const x = (a[d] || 0) * w, y = (b[d] || 0) * w;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

  exp.USAGE_KEYS = USAGE_KEYS;
  exp.isFrontier = isFrontier;
  exp.SOURCE_WEIGHTS = SOURCE_WEIGHTS;
  exp.collectModelFields = collectModelFields;
  exp.scanTextForModel = scanTextForModel;
  exp.vendorFromUrl = vendorFromUrl;
  exp.matchKnownModels = matchKnownModels;
  exp.protocolFingerprint = protocolFingerprint;
  exp.evidenceFromHeaders = evidenceFromHeaders;
  exp.classify = classify;
  exp.FP_DIMS = FP_DIMS;
  exp.fingerprintVector = fingerprintVector;
  exp.cosineSim = cosineSim;
} };
__mods["interceptor"] = { fn: function (exp) {
  var collectModelFields = __req("classify").collectModelFields;
  var scanTextForModel = __req("classify").scanTextForModel;
  var evidenceFromHeaders = __req("classify").evidenceFromHeaders;
  var protocolFingerprint = __req("classify").protocolFingerprint;
/**
 * interceptor.js — 页面内网络采集层（passive, 零侵入）
 *
 * 原理：模型身份最硬的证据是"页面自己发出去/收回来的网络流量"。
 * 所以我们在页面最早的时机接管 fetch / XHR / EventSource，旁路读取（clone），
 * 不改变任何请求行为，避免破坏页面。
 *
 * 目标：< 800ms 内给出首判（第一个 SSE chunk 到达即可判定）。
 */
const BUS = {
  evidence: [],      // 结构化证据
  observations: [],  // 每次完整对话的观测（用于指纹建档）
  listeners: [],
  activeTurnId: null,
  activeTurnChatId: null,
  bindTurnChatId(turnId, url) {
    if (!turnId || turnId !== this.activeTurnId) return false;
    const m = String(url || '').match(/\/sessions\/([^/?#]+)\/out(?:[/?#]|$)/i);
    if (!m) return false;
    const chatId = m[1].toLowerCase();
    if (this.activeTurnChatId && this.activeTurnChatId !== chatId) return false;
    this.activeTurnChatId = chatId;
    return true;
  },
  on(fn) { this.listeners.push(fn); },
  emit(evt, turnId) {
    const id = turnId === undefined ? this.activeTurnId : turnId;
    this.bindTurnChatId(id, evt && evt.data && evt.data.url);
    if (evt && evt.data && !Object.prototype.hasOwnProperty.call(evt.data, 'turnId')) evt.data = { ...evt.data, turnId: id || null };
    if (evt && !Object.prototype.hasOwnProperty.call(evt, 'turnId')) evt.turnId = id || null;
    for (const fn of this.listeners) { try { fn(evt); } catch { /* noop */ } }
  },
  push(e) {
    if (e && !Object.prototype.hasOwnProperty.call(e, 'turnId')) e = { ...e, turnId: this.activeTurnId || null };
    if (e) this.bindTurnChatId(e.turnId || this.activeTurnId, e.url);
    this.evidence.push(e);
    if (this.evidence.length > 500) this.evidence.splice(0, 200);
    this.emit({ kind: 'evidence', data: e });
  },
};

const now = () => performance.now();

/**
 * 判断是否像 AI 推理请求（避免把静态资源也解析）
 *
 * 两层判定：
 *  - URL 层：路径含 completions/chat/messages 等，或主机是已知厂商/网关
 *  - 内容类型层：text/event-stream 本身就是强信号（匿名网关路径不可预测）
 *
 * 三层排除（每一层都是实测踩坑后加的）：
 *  1. 静态资源
 *  2. 遥测/分析/监控域 —— 这类端点 URL 里常含 /api/，会被"疑似 LLM"规则误收，
 *     而它们的 payload 是通用 JSON（含 code/message/request_id 等），
 *     足以命中错误的协议指纹，制造假阳性。
 *     实测事故：Datadog RUM 上报被当成模型响应，导致误报 qwen 家族。
 *  3. 同域但明确与推理无关的路径
 */
const TELEMETRY_RE = /(?:datadoghq|datadog|posthog|sentry|amplitude|mixpanel|segment\.io|segment\.com|google-analytics|googletagmanager|hotjar|clarity\.ms|fullstory|logrocket|newrelic|nr-data|bugsnag|rollbar|trackjs|raygun|elastic\.co|honeycomb|lightstep|opentelemetry|otlp|statsig|launchdarkly|optimizely|split\.io|vwo\.com|matomo|plausible\.io|umami|vercel-insights|vercel\.com\/_vercel\/insights)/i;

const IRRELEVANT_PATH_RE = /(?:rum\/|_vercel\/insights|\/cdn-cgi\/|\/survey|\/feedback\/|\/beacon|\/log\/|\/logs\/|\/metrics\/|\/trace\/|\/analytics|\/telemetry)/i;

function isLikelyLLMUrl(url) {
  if (!url) return false;
  // 1) 静态资源
  if (/\.(?:js|css|png|jpe?g|gif|svg|woff2?|ttf|ico|map|mp4|webp|avif)(?:\?|$)/i.test(url)) return false;
  // 2) 遥测/监控域（关键排除：否则会把分析上报当成模型响应）
  if (TELEMETRY_RE.test(url)) return false;
  // 3) 与推理无关的路径
  if (IRRELEVANT_PATH_RE.test(url)) return false;

  return /(?:completions?|chat|messages|generate|generateContent|streamGenerateContent|converse|invoke|agent|run|responses|assistant|thread|conversation|inference|chatbot|api\/v\d|\/api\/|\/rpc\/|\/graphql)/i.test(url)
    || /(?:openai|anthropic|generativelanguage|deepseek|x\.ai|openrouter|groq|together|mistral|cohere|dashscope|moonshot|bigmodel|volces|minimax)/i.test(url);
}

/** 响应是否值得解析：URL 像 LLM，或内容类型是流式 */
function shouldInspect(url, contentType) {
  if (TELEMETRY_RE.test(url || '')) return false;
  if (isStreamCT(contentType)) return true;
  if (/application\/json|text\/json/i.test(contentType || '') && isLikelyLLMUrl(url)) return true;
  return isLikelyLLMUrl(url);
}

function isStreamCT(ct) {
  return /text\/event-stream|application\/x-ndjson|application\/stream\+json|text\/plain/i.test(ct || '');
}

/** 读取 Headers 为普通对象 */
function headersToObj(h) {
  const o = {};
  try {
    if (h && typeof h.forEach === 'function') h.forEach((v, k) => { o[k.toLowerCase()] = v; });
    else if (Array.isArray(h)) for (const [k, v] of h) o[String(k).toLowerCase()] = v;
    else if (h && typeof h === 'object') for (const [k, v] of Object.entries(h)) o[String(k).toLowerCase()] = v;
  } catch { /* noop */ }
  return o;
}

/* ------------------------------------------------------------------ *
 * SSE 增量解析器：边流边解析，首帧即判定（"快速"的关键）
 * ------------------------------------------------------------------ */
class SSETap {
  constructor(ctx, onChunk) {
    this.ctx = ctx;               // { url, requestModel, slot }
    this.onChunk = onChunk;
    this.buf = '';
    this.text = '';
    this.decoder = new TextDecoder('utf-8', { fatal: false });
    this.t0 = now();
    this.ttft = 0;
    this.chunks = 0;
    this.promptTokens = null;
    this.completionTokens = null;
    this.reasoningTokens = null;
    this.modelSeen = null;
    this.done = false;
  }

  feed(bytes) {
    if (this.done) return;
    const s = typeof bytes === 'string' ? bytes : this.decoder.decode(bytes, { stream: true });
    if (!s) return;
    if (!this.ttft) this.ttft = now() - this.t0;
    this.chunks++;
    this.text += s;
    if (this.text.length > 400000) this.text = this.text.slice(-200000);

    this.buf += s;
    const lines = this.buf.split('\n');
    this.buf = lines.pop();
    for (const line of lines) this.handleLine(line.trim());
    this.scanUsage();
  }

  handleLine(line) {
    if (!line || line.startsWith(':')) return;
    // 记录事件名（realtime batch 协议靠 event: batch 识别）
    if (line.startsWith('event:')) {
      const ev = line.slice(6).trim();
      if (ev) {
        this.events = this.events || [];
        if (!this.events.includes(ev)) this.events.push(ev);
      }
      return;
    }
    let payload = line;
    if (line.startsWith('data:')) payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;

    let obj = null;
    try { obj = JSON.parse(payload); } catch { /* 非 JSON，交给正则兜底 */ }

    if (obj) {
      BUS.emit({ kind: 'sse-fingerprint-frame', data: { url: this.ctx.url, frame: obj, turnId: this.ctx.turnId || null } }, this.ctx.turnId || null);
      // ---- arena.ai realtime batch：records[].body 是「JSON 字符串里再套 JSON」----
      // 必须二次解包，否则模型字段与帧类型都看不见（实测踩过的坑）。
      if (Array.isArray(obj.records)) {
        for (const rec of obj.records) {
          // headers 帧里带 public-access-token —— 这是读取真实模型名的钥匙。
          // 结构：{"seq_num":N,"headers":[["public-access-token","eyJ..."]],...}
          if (Array.isArray(rec.headers)) {
            // 实测 2026-09-30：令牌与 turn-complete 同帧下发：
            //   {"headers":[["trigger-control","turn-complete"],["public-access-token","eyJ..."]],...}
            let turnDone = false;
            for (const h of rec.headers) {
              if (Array.isArray(h) && typeof h[0] === 'string' && typeof h[1] === 'string') {
                BUS.emit({ kind: 'stream-header', data: { name: h[0], value: h[1], url: this.ctx.url, turnId: this.ctx.turnId || null } }, this.ctx.turnId || null);
                if (/^trigger-control$/i.test(h[0]) && /^turn-complete$/i.test(h[1])) turnDone = true;
              }
            }
            if (turnDone) BUS.emit({ kind: 'turn-complete', data: { url: this.ctx.url, turnId: this.ctx.turnId || null } }, this.ctx.turnId || null);
          }
          if (typeof rec.body !== 'string') continue;
          let inner = null;
          try { inner = JSON.parse(rec.body); } catch { continue; }
          this.consumeFrame(inner, `seq${rec.seq_num}`);
        }
      }
      // 顶层也可能直接带 headers
      if (Array.isArray(obj.headers)) {
        let turnDoneTop = false;
        for (const h of obj.headers) {
          if (Array.isArray(h) && typeof h[0] === 'string' && typeof h[1] === 'string') {
            BUS.emit({ kind: 'stream-header', data: { name: h[0], value: h[1], url: this.ctx.url, turnId: this.ctx.turnId || null } }, this.ctx.turnId || null);
            if (/^trigger-control$/i.test(h[0]) && /^turn-complete$/i.test(h[1])) turnDoneTop = true;
          }
        }
        if (turnDoneTop) BUS.emit({ kind: 'turn-complete', data: { url: this.ctx.url, turnId: this.ctx.turnId || null } }, this.ctx.turnId || null);
      }
      this.consumeFrame(obj, `chunk${this.chunks}`);
    } else {
      for (const v of scanTextForModel(payload)) {
        if (!this.modelSeen) this.modelSeen = v;
        BUS.push({ source: 'sse.chunk.model', weight: 0.82, modelId: v, detail: 'regex-fallback', url: this.ctx.url, slot: this.ctx.slot, t: now(), turnId: this.ctx.turnId || null });
      }
    }

    if (this.chunks <= 3 && this.onChunk) this.onChunk(this); // 首帧快判钩子
  }

  /**
   * consumeFrame — 处理一个（可能嵌套的）协议帧
   *
   * 为什么要递归：arena.ai 的 realtime batch 把真实帧放在 records[].body 里，
   * 而 body 本身又是一段 JSON 字符串；某些网关还会再包一层 data。
   * 不递归就会漏掉 type/model 等关键字段。
   */
  consumeFrame(obj, where, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 4) return;

    // 1) 模型字段
    const hits = collectModelFields(obj);
    for (const h of hits) {
      if (!this.modelSeen) this.modelSeen = h.value;
      BUS.push({
        source: 'sse.chunk.model', weight: 0.90, modelId: h.value,
        detail: `${h.path} @${where}`, url: this.ctx.url,
        slot: this.ctx.slot, t: now(), turnId: this.ctx.turnId || null,
      });
    }

    // 1b) 内嵌访问令牌：部分协议把 public-access-token 放在 body JSON 字段里
    for (const k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      const v = obj[k];
      if (typeof v === 'string' && /access-token/i.test(k) && /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(v)) {
        BUS.emit({ kind: 'stream-header', data: { name: k, value: v, url: this.ctx.url, turnId: this.ctx.turnId || null } }, this.ctx.turnId || null);
      }
    }

    // 2) 协议帧类型（Vercel AI SDK stream parts 与各家原生帧）
    this.frames = this.frames || [];
    const tag = obj.type || obj.object || (Array.isArray(obj.candidates) ? 'candidates' : null);
    if (typeof tag === 'string' && !this.frames.includes(tag)) this.frames.push(tag);

    // 3) 递归解包常见的嵌套容器
    for (const key of ['data', 'delta', 'message', 'response', 'payload', 'event']) {
      const v = obj[key];
      if (v && typeof v === 'object') this.consumeFrame(v, `${where}.${key}`, depth + 1);
      else if (typeof v === 'string' && v.length > 2 && v[0] === '{') {
        try { this.consumeFrame(JSON.parse(v), `${where}.${key}`, depth + 1); } catch { /* 非 JSON */ }
      }
    }
  }

  scanUsage() {
    const t = this.text;
    const pick = (re) => { const m = t.match(re); return m ? Number(m[1]) : null; };
    const p = pick(/"prompt_tokens"\s*:\s*(\d+)/) ?? pick(/"input_tokens"\s*:\s*(\d+)/) ?? pick(/"promptTokenCount"\s*:\s*(\d+)/);
    const c = pick(/"completion_tokens"\s*:\s*(\d+)/) ?? pick(/"output_tokens"\s*:\s*(\d+)/) ?? pick(/"candidatesTokenCount"\s*:\s*(\d+)/);
    const r = pick(/"reasoning_tokens"\s*:\s*(\d+)/) ?? pick(/"thoughtsTokenCount"\s*:\s*(\d+)/);
    if (p != null) this.promptTokens = p;
    if (c != null) this.completionTokens = c;
    if (r != null) this.reasoningTokens = r;
  }

  finish() {
    if (this.done) return;
    this.done = true;
    if (this.buf) this.handleLine(this.buf.trim());

    const obs = {
      url: this.ctx.url,
      requestModel: this.ctx.requestModel || null,
      slot: this.ctx.slot || null,
      turnId: this.ctx.turnId || null,
      tStart: this.ctx.requestT || this.t0,
      ttftMs: Math.round(this.ttft),
      totalMs: Math.round(now() - this.t0),
      chunks: this.chunks,
      text: this.text,
      frames: this.frames || [],
      events: this.events || [],
      modelSeen: this.modelSeen,
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      reasoningTokens: this.reasoningTokens,
    };

    const proto = protocolFingerprint(this.text);
    for (const p of proto) {
      BUS.push({ source: 'protocol.framing', weight: p.score, family: p.family, detail: `${p.label} [${p.matched.join('|')}]`, url: this.ctx.url, slot: this.ctx.slot, t: now(), turnId: this.ctx.turnId || null });
    }

    BUS.observations.push(obs);
    if (BUS.observations.length > 100) BUS.observations.shift();
    BUS.emit({ kind: 'observation', data: obs, turnId: this.ctx.turnId || null }, this.ctx.turnId || null);
  }
}

/* ------------------------------------------------------------------ *
 * 槽位（Model A / Model B）推断：
 *   盲测站点会把两个模型并列，我们通过"哪个 DOM 子树里触发了这次请求"来归属。
 * ------------------------------------------------------------------ */
function inferSlot() {
  try {
    const el = document.activeElement;
    let node = el;
    let i = 0;
    while (node && i++ < 12) {
      const attrs = [
        node.getAttribute && node.getAttribute('data-testid'),
        node.getAttribute && node.getAttribute('data-slot'),
        node.getAttribute && node.getAttribute('aria-label'),
        node.id, node.className && String(node.className).slice(0, 120),
      ].filter(Boolean).join(' ');
      const m = attrs.match(/\b(?:model|side|slot|assistant|panel|column|pane)[-_ ]?([abAB])\b/);
      if (m) return m[1].toUpperCase();
      node = node.parentElement;
    }
    // 退路：按可见面板水平位置猜（左 A 右 B）
    const act = document.activeElement;
    if (act && act.getBoundingClientRect) {
      const r = act.getBoundingClientRect();
      if (r.width > 0 && window.innerWidth > 0) return r.left + r.width / 2 < window.innerWidth / 2 ? 'A' : 'B';
    }
  } catch { /* noop */ }
  return null;
}

/* ------------------------------------------------------------------ *
 * 安装 fetch 钩子
 * ------------------------------------------------------------------ */
function installFetchHook() {
  const origFetch = window.fetch;
  if (!origFetch || origFetch.__probeWrapped) return;
  const wrapped = function (input, init) {
    let url = '', reqModel = null, reqHeaders = {};
    const turnId = BUS.activeTurnId || null;
    const requestT = now();
    try {
      url = typeof input === 'string' ? input : (input && input.url) || '';
      const body = init && init.body;
      if (typeof body === 'string') {
        reqHeaders = headersToObj(init.headers);
        try {
          const j = JSON.parse(body);
          const hits = collectModelFields(j);
          if (hits.length) { reqModel = hits[0].value; }
          if (!reqModel && typeof j.model === 'string') reqModel = j.model;
          if (j.model) BUS.push({ source: 'request.body.model', weight: 1.0, modelId: j.model, detail: `fetch body .model`, url, slot: inferSlot(), t: now(), turnId });
        } catch { /* 非 JSON */ }
      }
    } catch { /* noop */ }

    const slot = inferSlot();
    const p = origFetch.apply(this, arguments);
    if (!url) return p;

    return p.then((res) => {
      try {
        const hdrs = headersToObj(res.headers);
        const ct = hdrs['content-type'] || '';
        if (!shouldInspect(res.url || url, ct)) return res;

        for (const e of evidenceFromHeaders(hdrs, res.url || url)) {
          BUS.push({ ...e, slot, t: now(), turnId });
        }
        if (isStreamCT(ct) || !ct) {
          const tap = new SSETap({ url: res.url || url, requestModel: reqModel, slot, turnId, requestT }, (t) => {
            // 首帧快判：把证据立刻喂给判定器并由 UI 呈现
            BUS.emit({ kind: 'fast-verdict', data: { url: res.url || url, slot, modelSeen: t.modelSeen, turnId } }, turnId);
          });
          if (res.body && typeof res.body.getReader === 'function') {
            const [a, b] = res.body.tee();
            (async () => {
              const reader = b.getReader();
              try {
                for (;;) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  tap.feed(value);
                }
              } catch { /* stream aborted */ } finally { tap.finish(); }
            })();
            return new Response(a, { status: res.status, statusText: res.statusText, headers: res.headers });
          }
          // 无 body 流：退化为整体文本读取
          res.clone().text().then(t => { tap.feed(t); tap.finish(); }).catch(() => {});
          return res;
        }
        res.clone().json().then(j => {
          for (const h of collectModelFields(j)) {
            BUS.push({ source: 'response.json.model', weight: 0.93, modelId: h.value, detail: h.path, url: res.url || url, slot, t: now(), turnId });
          }
          const txt = JSON.stringify(j).slice(0, 300000);
          for (const p2 of protocolFingerprint(txt)) {
            BUS.push({ source: 'protocol.framing', weight: p2.score, family: p2.family, detail: p2.label, url, slot, t: now(), turnId });
          }
        }).catch(() => {});
        return res;
      } catch { return res; }
    });
  };
  wrapped.__probeWrapped = true;
  wrapped.__orig = origFetch;
  window.fetch = wrapped;
}

/* ------------------------------------------------------------------ *
 * 安装 XHR 钩子
 * ------------------------------------------------------------------ */
function installXHRHook() {
  const XO = window.XMLHttpRequest;
  if (!XO || XO.__probeWrapped) return;
  const origOpen = XO.prototype.open;
  const origSend = XO.prototype.send;

  XO.prototype.open = function (method, url) {
    this.__probeUrl = url;
    return origOpen.apply(this, arguments);
  };
  XO.prototype.send = function (body) {
    const url = this.__probeUrl || '';
    const slot = inferSlot();
    const turnId = BUS.activeTurnId || null;
    const tStart = now();
    // 注意：send 阶段拿不到响应头，所以不能在这里用内容类型过滤，
    // 否则匿名网关路径的 XHR 会被整体漏掉。改为广挂 load 监听，
    // 真正的过滤放在 load 里按 content-type 做（成本可忽略）。
    if (url) {
      if (isLikelyLLMUrl(url)) {
        try {
          if (typeof body === 'string') {
            const j = JSON.parse(body);
            if (j && typeof j.model === 'string') {
              BUS.push({ source: 'request.body.model', weight: 1.0, modelId: j.model, detail: 'xhr body .model', url, slot, t: now(), turnId });
            }
          }
        } catch { /* noop */ }
      }

      this.addEventListener('load', () => {
        try {
          const hdrs = {};
          (this.getAllResponseHeaders() || '').split(/\r?\n/).forEach(l => {
            const i = l.indexOf(':');
            if (i > 0) hdrs[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
          });
          if (!shouldInspect(this.responseURL || url, hdrs['content-type'])) return;
          for (const e of evidenceFromHeaders(hdrs, this.responseURL || url)) BUS.push({ ...e, slot, t: now(), turnId });
          const text = typeof this.responseText === 'string' ? this.responseText : '';
          if (text) {
            for (const v of scanTextForModel(text)) {
              BUS.push({ source: 'response.json.model', weight: 0.88, modelId: v, detail: 'xhr regex', url, slot, t: now(), turnId });
            }
            for (const p of protocolFingerprint(text)) {
              BUS.push({ source: 'protocol.framing', weight: p.score, family: p.family, detail: p.label, url, slot, t: now(), turnId });
            }
            BUS.observations.push({
              url, slot, turnId, tStart, ttftMs: 0, totalMs: Math.round(now() - tStart), text,
              promptTokens: null, completionTokens: null, reasoningTokens: null,
              modelSeen: scanTextForModel(text)[0] || null, frames: [],
            });
            BUS.emit({ kind: 'observation', data: BUS.observations[BUS.observations.length - 1], turnId }, turnId);
          }
        } catch { /* noop */ }
      });
    }
    return origSend.apply(this, arguments);
  };
  XO.__probeWrapped = true;
  window.XMLHttpRequest = XO;
}

/* ------------------------------------------------------------------ *
 * 安装 WebSocket / EventSource 钩子
 * ------------------------------------------------------------------ */
function installSocketHook() {
  if (window.WebSocket && !window.WebSocket.__probeWrapped) {
    const OW = window.WebSocket;
    const W = function (url, protocols) {
      const ws = new OW(url, protocols);
      const slot = inferSlot();
      const turnId = BUS.activeTurnId || null;
      try {
        ws.addEventListener('message', (ev) => {
          const d = typeof ev.data === 'string' ? ev.data : '';
          if (!d || d.length < 4) return;
          for (const v of scanTextForModel(d)) {
            BUS.push({ source: 'sse.chunk.model', weight: 0.85, modelId: v, detail: 'ws message', url, slot, t: now(), turnId });
          }
          for (const p of protocolFingerprint(d)) {
            BUS.push({ source: 'protocol.framing', weight: p.score, family: p.family, detail: p.label, url, slot, t: now(), turnId });
          }
        });
      } catch { /* noop */ }
      return ws;
    };
    W.prototype = OW.prototype;
    W.__probeWrapped = true;
    window.WebSocket = W;
  }

  if (window.EventSource && !window.EventSource.__probeWrapped) {
    const OE = window.EventSource;
    const E = function (url, cfg) {
      const es = new OE(url, cfg);
      const slot = inferSlot();
      const turnId = BUS.activeTurnId || null;
      try {
        es.addEventListener('message', (ev) => {
          const d = typeof ev.data === 'string' ? ev.data : '';
          if (!d) return;
          for (const v of scanTextForModel(d)) {
            BUS.push({ source: 'sse.chunk.model', weight: 0.86, modelId: v, detail: 'eventsource', url, slot, t: now(), turnId });
          }
          for (const p of protocolFingerprint(d)) {
            BUS.push({ source: 'protocol.framing', weight: p.score, family: p.family, detail: p.label, url, slot, t: now(), turnId });
          }
        });
      } catch { /* noop */ }
      return es;
    };
    E.prototype = OE.prototype;
    E.__probeWrapped = true;
    window.EventSource = E;
  }
}

  exp.BUS = BUS;
  exp.SSETap = SSETap;
  exp.installFetchHook = installFetchHook;
  exp.installXHRHook = installXHRHook;
  exp.installSocketHook = installSocketHook;
} };
__mods["idmap"] = { fn: function (exp) {
  var BUS = __req("interceptor").BUS;
/**
 * idmap.js — UUID → 模型名 映射解析（揭示机制的核心组件）
 *
 * 背景（逆向得出的事实）：
 *   arena.ai 的消息对象携带的是 modelId（UUID），而不是模型名：
 *     message.participantPosition === 'a' && (modelAId = message.modelId)
 *     message.participantPosition === 'b' && (modelBId = message.modelId)
 *   模型名需要通过「UUID → publicName」映射表还原。
 *
 *   这份映射来自排行榜页面的 RSC 载荷（initialModels 数组），每条形如：
 *     {id:"01a07d42-...", organization:"openai", provider:"openaiResponses",
 *      publicName:"gpt-6-astra-medium", userSelectable:false, capabilities:{...}}
 *
 * 为什么放在探针里：
 *   1. 网络层/消息层拿到的往往是 UUID，必须还原才能给出人类可读的模型名
 *   2. 映射表随官方更新变化，所以运行时可重新拉取（refresh）
 *   3. 映射表也能反查：拿到模型名 → 找到它的所有 UUID（便于比对）
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let MAP = Object.create(null);      // uuid -> {name, org, provider}
let NAME_INDEX = Object.create(null); // name(lower) -> [uuid]
let META = { loaded: 0, builtAt: 0, source: null };
function isUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s.trim());
}

/** 用已解析的模型数组装载映射表 */
function loadModelMap(models, source = 'inline') {
  if (!Array.isArray(models)) return 0;
  let n = 0;
  for (const m of models) {
    if (!m || !m.id) continue;
    const name = m.publicName || m.name || m.displayName;
    if (!name) continue;
    MAP[m.id] = { name, org: m.organization || null, provider: m.provider || null, selectable: m.userSelectable };
    const k = String(name).toLowerCase();
    (NAME_INDEX[k] = NAME_INDEX[k] || []).push(m.id);
    n++;
  }
  META = { loaded: n, builtAt: Date.now(), source };
  return n;
}

/** UUID → 模型名 */
function resolveModelId(id) {
  if (!id) return null;
  const k = String(id).trim();
  const hit = MAP[k];
  if (hit) return { id: k, name: hit.name, org: hit.org, provider: hit.provider, selectable: hit.selectable };
  return isUuid(k) ? { id: k, name: null, org: null, provider: null, unknown: true } : null;
}

/** 模型名 → 所有 UUID（反查，用于比对同一模型的不同快照） */
function uuidsForName(name) {
  if (!name) return [];
  return (NAME_INDEX[String(name).toLowerCase()] || []).slice();
}
function mapStats() {
  return { ...META, names: Object.keys(NAME_INDEX).length };
}

/**
 * 从排行榜页面在线拉取并装载映射表。
 *
 * 解析方式说明（关键）：
 *   排行榜的 RSC 载荷形如 self.__next_f.push([1,"<转义JSON>"])，
 *   其中引号是双重转义。直接正则切对象很脆弱（实测两次失败），
 *   因此这里改为「反转义后用括号配平 + JSON.parse 逐个尝试」，
 *   并且只在解析成功且含 publicName/provider 时才采纳。
 */
async function refreshModelMap() {
  const pages = ['/leaderboard/agent', '/leaderboard/text', '/leaderboard'];
  const all = [];
  for (const p of pages) {
    try {
      const r = await fetch(p, { credentials: 'include' });
      if (!r.ok) continue;
      const html = await r.text();
      all.push(...parseInitialModels(html));
    } catch { /* 忽略单页失败 */ }
  }
  const n = loadModelMap(all, 'leaderboard-rsc');
  return { loaded: n, pages: pages.length };
}

/** 从页面 HTML 里解析 initialModels 数组 */
function parseInitialModels(html) {
  if (typeof html !== 'string' || !html) return [];
  const out = [];
  // 1) 取出 RSC 载荷字符串并反转义
  let text = '';
  const pushRe = /self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\s*\]\)/g;
  let m;
  while ((m = pushRe.exec(html)) !== null) {
    try { text += JSON.parse('"' + m[1] + '"'); } catch { text += m[1]; }
  }
  if (!text) text = html.replace(/\\"/g, '"');

  // 2) 对每个 {"id" 锚点做括号配平 + JSON.parse
  let i = 0;
  while (true) {
    const j = text.indexOf('{"id"', i);
    if (j < 0) break;
    i = j + 1;
    const end = balancedEnd(text, j);
    if (end < 0) continue;
    const frag = text.slice(j, end);
    if (!/"publicName"|"provider"|"organization"/.test(frag)) continue;
    try {
      const o = JSON.parse(frag);
      if (o && o.id && (o.publicName || o.provider || o.organization)) out.push(o);
    } catch { /* 片段不完整 */ }
  }
  return out;
}

/** 从 start（'{'）开始找配平的对象结尾，正确处理字符串与转义 */
function balancedEnd(s, start) {
  let depth = 0, inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return i + 1; }
    }
  }
  return -1;
}

/**
 * 扫描 BUS 里的证据，把所有 UUID 形态的 modelId 还原成模型名，
 * 并把还原结果作为高权重证据回灌（source: 'idmap.resolve'）。
 *
 * 这是「拿到具体版本号」的落地环节：只要上游给出了 UUID，
 * 这里就能把它变成 gpt-6-astra-high / claude-opus-5-max 这样的真名。
 */
function resolveEvidence(evidence) {
  const list = Array.isArray(evidence) ? evidence : [];
  let resolved = 0;
  const seen = new Set();
  for (const e of list) {
    if (!e || !e.modelId || !isUuid(e.modelId)) continue;
    const r = resolveModelId(e.modelId);
    if (!r || !r.name || seen.has(r.id)) continue;
    seen.add(r.id);
    resolved++;
    BUS.push({
      source: 'idmap.resolve',
      weight: 0.92,
      modelId: r.name,
      detail: `${r.id} → ${r.name}${r.org ? ' [' + r.org + ']' : ''}（UUID 还原）`,
      url: e.url,
      slot: e.slot,
      turnId: Object.prototype.hasOwnProperty.call(e, 'turnId') ? e.turnId : null,
      t: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    });
  }
  return resolved;
}
function exportMap() {
  return JSON.stringify({ meta: META, map: MAP }, null, 2);
}

  exp.isUuid = isUuid;
  exp.loadModelMap = loadModelMap;
  exp.resolveModelId = resolveModelId;
  exp.uuidsForName = uuidsForName;
  exp.mapStats = mapStats;
  exp.refreshModelMap = refreshModelMap;
  exp.parseInitialModels = parseInitialModels;
  exp.resolveEvidence = resolveEvidence;
  exp.exportMap = exportMap;
} };
__mods["runmodel"] = { fn: function (exp) {
  var BUS = __req("interceptor").BUS;
/**
 * runmodel.js — 从 Trigger.dev run trace 提取【真实模型名】
 *
 * 为什么需要这个模块：
 *   Agent Mode 的响应流里不含模型名（实测：请求体无 modelId、响应体穷举
 *   搜索 model/provider/harness 键名 0 个）。但服务端会下发一个
 *   public-access-token（JWT, pub:true），其 scope 明确包含
 *   read:runs:<runId> —— 即授予客户端读取该 run 的权限。
 *   读该 run 的 trace，里面 ai.streamText.doStream span 的标签
 *   就是 worker 自己写入的**真实模型名**，例如：
 *       qwen3.8-max-0902
 *       qwen-latest-series-invite-202608-m4
 *
 * 本模块把这些步骤全部自动化，让探针直接显示真实模型名，
 * 而不是只报"家族未知"。
 */

const TRIGGER_API = 'https://api.trigger.dev';
// 同源代理（2026-09-30 实测与直连等价：/ai-proxy/api/v1/runs/<rid>/{events,spans/<id>}
// 返回数据一致，代理需要 Cookie+Bearer）；直连被掐（网络/跨域/封锁）时自动切换。
const PROXY_API = ((typeof location !== 'undefined' && location && location.origin && /^https?:$/.test(location.origin)) ? location.origin : 'https://arena.ai') + '/ai-proxy/api/v1';

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */
const STATE = {
  token: null,
  runId: null,
  tokenAt: 0,
  tokenExp: 0,
  lastFetchAt: 0,
  lastError: null,
  modelName: null,
  modelHistory: [],       // [{name, arenaName, all, at, runId, tokens}]
  arenaName: null,        // Arena 内部模型名（含档位后缀，如 gpt-6-luna-high）
  allowance: null,        // 账号额度（spend.recorded span；账号级，跨 run 保留）
  detailTries: 0,         // 当前 run 等待回合结束 span 的次数
  fetching: false,
  fetchCount: 0,
  staleTurn: false,       // 本回合未拿到令牌：清空旧值，不把上一回合的模型冒充为当前
  turnSeq: 0,             // 见到的 turn-complete 计数（回合边界）
  rescannedAt: 0,         // 上次主动重扫 /out 回放的时间（限速用）
};
const RUN_TURN_IDS = new Map();
const RUN_TURN_TIMES = new Map();
function bindRunTurn(runId, turnId) {
  if (!runId || typeof turnId !== 'string' || !turnId) return;
  RUN_TURN_IDS.set(runId, turnId);
  RUN_TURN_TIMES.set(runId, typeof performance !== 'undefined' ? performance.now() : Date.now());
  while (RUN_TURN_IDS.size > 100) {
    const oldest = RUN_TURN_IDS.keys().next().value;
    RUN_TURN_IDS.delete(oldest);
    RUN_TURN_TIMES.delete(oldest);
  }
}

/* ------------------------------------------------------------------ *
 * JWT 解码
 * ------------------------------------------------------------------ */
function b64urlDecode(s) {
  let t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  try {
    if (typeof atob === 'function') {
      const bin = atob(t);
      // atob 返回 latin1，需按 UTF-8 还原
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    }
  } catch { /* noop */ }
  return null;
}
function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const head = b64urlDecode(parts[0]);
  const body = b64urlDecode(parts[1]);
  let h = null, p = null;
  try { h = head ? JSON.parse(head) : null; } catch { /* noop */ }
  try { p = body ? JSON.parse(body) : null; } catch { /* noop */ }
  return { header: h, payload: p };
}

/** 从 JWT 的 scopes 里提取 run id */
function runIdFromPayload(payload) {
  if (!payload) return null;
  const scopes = payload.scopes || [];
  for (const s of scopes) {
    const m = String(s).match(/(?:read|write):[a-zA-Z]+:(run_[A-Za-z0-9]+)/);
    if (m) return m[1];
  }
  const m2 = JSON.stringify(payload).match(/(run_[A-Za-z0-9]{10,})/);
  return m2 ? m2[1] : null;
}

/* ------------------------------------------------------------------ *
 * 接收 token（由 interceptor 的 stream-header 事件触发）
 * ------------------------------------------------------------------ */
function acceptToken(name, value, turnId = null) {
  if (!name || !value) return false;
  if (!/access-token/i.test(name)) return false;
  if (!/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(value)) return false;

  const dec = decodeJwt(value);
  const rid = runIdFromPayload(dec && dec.payload);
  const exp = (dec && dec.payload && dec.payload.exp) || 0;

  // 回放里会混入已过期的旧令牌：直接忽略，不覆盖有效令牌
  if (exp && exp * 1000 <= Date.now()) return false;

  if (!rid) return false; // Session-scoped JWTs cannot authorize run trace reads.

  bindRunTurn(rid, turnId);

  // 同一 run 且 token 未过期 → 忽略
  if (STATE.token === value) {
    if (turnId && rid === STATE.runId) {
      STATE.staleTurn = false;
      BUS.emit({ kind: 'run-token', data: { runId: rid, turnId, pub: dec && dec.payload ? dec.payload.pub : null, expiresInSec: exp ? Math.round(exp - Date.now() / 1000) : null, scopes: (dec && dec.payload && dec.payload.scopes) || [] } }, turnId);
      return true;
    }
    return false;
  }

  // 换 run 时同步清掉上一回合的模型名（不冻结旧值）
  if (rid && rid !== STATE.runId) { STATE.arenaName = null; STATE.modelName = null; STATE.detailTries = 0; }
  STATE.token = value;
  STATE.staleTurn = false;
  STATE.runId = rid || STATE.runId;
  STATE.tokenAt = Date.now();
  STATE.tokenExp = exp * 1000;
  STATE.lastError = null;

  BUS.emit({
    kind: 'run-token',
    data: {
      runId: STATE.runId,
      turnId: turnId || null,
      pub: dec && dec.payload ? dec.payload.pub : null,
      expiresInSec: exp ? Math.round(exp - Date.now() / 1000) : null,
      scopes: (dec && dec.payload && dec.payload.scopes) || [],
    },
  });
  return true;
}
function state() {
  checkFingerprintSession();
  return { ...STATE, turnId: RUN_TURN_IDS.get(STATE.runId) || null, turnTokenAt: RUN_TURN_TIMES.get(STATE.runId) || 0, modelHistory: STATE.modelHistory.slice(-20) };
}

/* ------------------------------------------------------------------ *
 * 读取 run trace 并提取模型名
 * ------------------------------------------------------------------ */
/**
 * 从 trace 文本里抽取模型标签。
 * span 结构（实测）：
 *   "message":"ai.streamText.doStream","style":{"icon":"hero-sparkles",
 *     "accessory":{"style":"pills","items":[
 *        {"text":"qwen3.8-max-0902","icon":"tabler-cube"},   <- 模型
 *        {"text":"7.0k","icon":"tabler-hash"}]}}
 */
function extractModelLabels(traceText) {
  const models = [];
  const tokens = [];
  if (typeof traceText !== 'string' || !traceText) return { models, tokens };
  const re = /"text"\s*:\s*"([^"]{1,80})"\s*,\s*"icon"\s*:\s*"([^"]{1,40})"/g;
  let m;
  while ((m = re.exec(traceText)) !== null) {
    const text = m[1], icon = m[2];
    if (icon.indexOf('cube') >= 0) models.push(text);
    else if (icon.indexOf('hash') >= 0) tokens.push(text);
  }
  return { models, tokens };
}

/* ------------------------------------------------------------------ *
 * 回合结束 span：Arena 内部模型名（含档位）+ 账号额度
 *
 * /events 只返回 span 摘要（无 properties）。doStream 药丸给的是供应商 id
 * （如 gpt-6-luna），而 worker 在回合结束（worker.turn_complete）时写入的
 * spend.recorded / token.usage.recorded / compaction.context_usage 三个 span
 * 的 properties.modelName 才是 Arena 内部名（如 gpt-6-luna-high）；
 * spend.recorded 另含账号额度：allowanceTier / allowanceUsd /
 * balanceRemainingUsd / chargedUserTotalUsd / overLimit / windowStartAtMs。
 * 需再 GET /api/v1/runs/<runId>/spans/<spanId>（同一 run 令牌）；返回体的
 * properties 是嵌套对象，无点号的键（modelName 等）位于顶层。
 * 实测 2026-09-30：三个 span 的 modelName 完全一致，doStream 侧没有档位。
 * ------------------------------------------------------------------ */
const DETAIL_SPANS = ['spend.recorded', 'token.usage.recorded', 'compaction.context_usage'];
const DETAIL_MAX_TRIES = 3;
const DETAIL_RETRY_MS = 1500;

/** 从 /events 文本里找出回合结束 span 的 spanId（每种取最后一个） */
function findDetailSpans(traceText) {
  const out = {};
  if (typeof traceText !== 'string' || !traceText) return out;
  let events = null;
  try {
    const j = JSON.parse(traceText);
    events = Array.isArray(j) ? j : (j && Array.isArray(j.events) ? j.events : null);
  } catch { /* noop */ }
  if (events) {
    for (const ev of events) {
      if (ev && typeof ev.spanId === 'string' && DETAIL_SPANS.indexOf(ev.message) >= 0) out[ev.message] = ev.spanId;
    }
  }
  return out;
}

/** 像模型名：含字母且含数字/点/横线；排除 arenaGateway 路由下的不透明短 id（如 dxzui） */
function looksLikeModelName(s) {
  if (typeof s !== 'string') return false;
  const v = s.trim();
  if (v.length < 3 || v.length > 80) return false;
  if (!/^[A-Za-z0-9][\w.\-\/:+]*$/.test(v)) return false;
  return /[A-Za-z]/.test(v) && /[\d.\-]/.test(v);
}

function numberOf(o, k) {
  const v = o ? o[k] : undefined;
  return typeof v === 'number' && isFinite(v) ? v : null;
}

/**
 * 双路取数：先直连 api.trigger.dev，失败（网络/跨域/4xx）再走 arena.ai 同源代理。
 * 代理路径带 Cookie（同源自动携带）+ Bearer run 令牌，2026-09-30 实测两路数据一致。
 */
async function fetchEither(urls, headers, timeoutMs) {
  let lastErr = null;
  for (const u of urls) {
    if (!u) continue;
    const via = u.indexOf('api.trigger.dev') >= 0 ? 'direct' : 'proxy';
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, timeoutMs);
    try {
      const res = await fetch(u, {
        method: 'GET',
        headers: headers,
        credentials: via === 'proxy' ? 'include' : 'omit',
        signal: ctrl ? ctrl.signal : undefined,
      });
      const text = await res.text();
      if (!res.ok) { lastErr = `http-${res.status}`; continue; }
      return { ok: true, text, status: res.status, via };
    } catch (e) {
      lastErr = String((e && e.message) || e);
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, reason: lastErr || 'fetch-failed' };
}

/** 从 /out 记录文本里捞 public-access-token（兼容 headers 数组与 JSON 字段两种形态） */
function scanTokensInText(text) {
  const out = [];
  if (typeof text !== 'string' || !text) return out;
  const re = /\\?["']public-access-token\\?["']\s*[,:]\s*\\?["'](eyJ[\w.-]+)\\?["']/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

/** 从 Agent / Work URL 解析会话 id（/<mode>/<uuid>） */
function pickChatId(href) {
  const m = String(href || '').match(/\/(?:agent|work)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i);
  if (m) return m[1].toLowerCase();
  return BUS.activeTurnId && BUS.activeTurnChatId ? BUS.activeTurnChatId : null;
}

/**
 * 主动重扫 /out 记录回放补令牌（同源：/api/chat/<id> 取会话令牌 → /out/records 扫令牌）。
 * 令牌缺失/临近过期、或回合结束未见令牌时调用；≥10 秒限速。
 */
// SSE identifiers identify an adapter/family, not an exact model or reasoning tier.
function canonicalFamily(f) {
  if (!f) return null;
  const s = String(f).trim().toLowerCase();
  if (/^(openai|gpt|chatgpt|o1|o3|o4)/i.test(s)) return 'openai';
  if (/^(anthropic|claude)/i.test(s)) return 'claude';
  if (/^(google|gemini)/i.test(s)) return 'gemini';
  if (/^(xai|grok)/i.test(s)) return 'grok';
  if (/^deepseek/i.test(s)) return 'deepseek';
  // Keep the shared adapter signature ambiguous instead of silently choosing Qwen.
  if (/^qwen\s*\/\s*glm$/.test(s)) return 'qwen/glm';
  if (/^(qwen|alibaba|aliyun)/i.test(s)) return 'qwen';
  if (/^(zhipu|glm)/i.test(s)) return 'glm';
  if (/^(moonshot|kimi)/i.test(s)) return 'kimi';
  if (/^minimax/i.test(s)) return 'minimax';
  if (/^(bytedance|doubao|seed)/i.test(s)) return 'doubao';
  if (/^(tencent|hunyuan)/i.test(s)) return 'hunyuan';
  if (/^(baidu|ernie)/i.test(s)) return 'ernie';
  return s;
}

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

function extractStreamFingerprint(input) {
  const fresh = () => ({ toolIds: [], reasoningIds: [], textIds: [], inputs: [], runTokens: [], reasoningCount: 0, reasoning: '', text: '', nodeId: null, attemptId: null, turnKey: null, settled: false });
  let f = fresh(), boundary = false, count = 0;
  const seen = new Set();
  function walk(x, depth) {
    if (depth > 12 || x == null || ++count > 200000) return;
    if (typeof x === 'string') {
      try { walk(JSON.parse(x), depth + 1); } catch { /* not a JSON wrapper */ }
      return;
    }
    if (Array.isArray(x)) { for (const item of x) walk(item, depth + 1); return; }
    if (typeof x !== 'object') return;
    if (x.seq_num != null) { if (seen.has(x.seq_num)) return; seen.add(x.seq_num); }
    if (x.type && /^(reasoning-|tool-input-|text-|data-agent-dispatch|start$|finish$)/.test(x.type)) {
      const attempt = x.type === 'data-agent-dispatch' && (x.attemptId || x.data && x.data.attemptId);
      if (boundary || (attempt && f.attemptId && attempt !== f.attemptId)) { f = fresh(); boundary = false; }
      if (x.type === 'reasoning-start' && typeof x.id === 'string') f.reasoningIds.push(x.id);
      if (x.type === 'reasoning-delta') { f.reasoningCount++; f.reasoning = (f.reasoning + (x.delta || '')).slice(0, 12000); }
      if (x.type === 'tool-input-start' && typeof x.toolCallId === 'string') f.toolIds.push(x.toolCallId);
      if (x.type === 'tool-input-available') { if (typeof x.toolCallId === 'string' && !f.toolIds.includes(x.toolCallId)) f.toolIds.push(x.toolCallId); f.inputs.push(x.input); }
      if (x.type === 'text-start' && typeof x.id === 'string') f.textIds.push(x.id);
      if (x.type === 'text-delta') f.text = (f.text + (x.delta || '')).slice(0, 12000);
      if (x.type === 'finish') f.nodeId = x.messageMetadata && x.messageMetadata.nodeId || f.nodeId;
      if (x.type === 'data-agent-dispatch') f.attemptId = x.attemptId || x.data && x.data.attemptId || f.attemptId;
      if (!f.turnKey) f.turnKey = x.messageId || x.toolCallId || x.id || null;
    }
    for (const key of ['records', 'body', 'data']) if (x[key] != null) walk(x[key], depth + 1);
    if (Array.isArray(x.headers)) for (const h of x.headers) {
      if (Array.isArray(h) && h[0] === 'public-access-token' && typeof h[1] === 'string') f.runTokens.push(h[1]);
    }
    if (Array.isArray(x.headers) && x.headers.some(h => Array.isArray(h) && h[0] === 'trigger-control' && h[1] === 'turn-complete')) { f.settled = true; boundary = true; }
  }
  if (typeof input === 'string') {
    try { walk(JSON.parse(input), 0); } catch {
      for (const line of input.split(/\r?\n/)) if (line.startsWith('data:')) walk(line.slice(5).trim(), 0);
    }
  } else walk(input, 0);
  f.turnKey = f.attemptId || f.nodeId || f.turnKey;
  return f;
}

let fingerprintChat = null, fingerprintEpoch = 0, fingerprintBusy = false;
const liveFingerprintFrames = new Map();
function checkFingerprintSession() {
  const chat = pickChatId(typeof location !== 'undefined' ? location.href : '');
  if (chat !== fingerprintChat) {
    fingerprintChat = chat; fingerprintEpoch++; liveFingerprintFrames.clear();
    STATE.token = null; STATE.tokenAt = 0; STATE.tokenExp = 0;
    STATE.runId = null; STATE.modelName = null; STATE.arenaName = null;
    STATE.staleTurn = true; STATE.rescannedAt = 0;
  }
  if (chat && !fingerprintBusy && Date.now() - STATE.rescannedAt >= RESCAN_MIN_GAP_MS) void rescanSessionTokens();
}
function resolveStreamFingerprint(text, chatId, currentRunId) {
  const normalizedChatId = String(chatId || '').toLowerCase();
  if (!normalizedChatId) return false;
  const currentChat = pickChatId(typeof location !== 'undefined' ? location.href : '');
  if (currentChat && normalizedChatId !== currentChat && (!BUS.activeTurnChatId || BUS.activeTurnChatId !== normalizedChatId)) return false;
  if (BUS.activeTurnId && BUS.activeTurnChatId && BUS.activeTurnChatId !== normalizedChatId) return false;
  const activeTurnId = BUS.activeTurnId && (!BUS.activeTurnChatId || BUS.activeTurnChatId === normalizedChatId) ? BUS.activeTurnId : null;
  const f = extractStreamFingerprint(text), model = classifyStreamFingerprint(f);
  if (!model) return false;
  const turnKey = f.turnKey || (f.toolIds && f.toolIds[0]) || 'stream_turn';
  // A session may reuse currentRunId across turns. Use the stream turn identity.
  const runId = `session_${normalizedChatId}:${turnKey}`;
  // Never replace an official trace name with a heuristic for the same turn.
  const official = STATE.modelHistory.find(h => (h.runId === runId || h.runId === currentRunId) && h.name && h.source !== 'sse-fingerprint');
  if (official && STATE.runId === official.runId && STATE.modelName && !STATE.staleTurn) return true;
  STATE.runId = runId; STATE.modelName = model.name;
  // Explicit uncertainty in the label replaces the misleading "tier pending" suffix.
  STATE.arenaName = model.name; STATE.staleTurn = false; STATE.lastError = null;
  const history = STATE.modelHistory.find(h => h.runId === runId && h.source === 'sse-fingerprint');
  if (history) {
    history.name = model.name;
    history.arenaName = model.name;
    history.family = model.family;
    history.chatId = normalizedChatId;
    if (activeTurnId) history.turnId = activeTurnId;
  } else {
    STATE.modelHistory.push({ runId, name: model.name, arenaName: model.name, family: model.family, chatId: normalizedChatId, turnId: activeTurnId, at: Date.now(), source: 'sse-fingerprint', currentRunId, cutoff: model.cutoff, exact: false, features: f });
  }
  STATE.modelHistory = STATE.modelHistory.slice(-20);
  BUS.emit({ kind: 'run-model-resolved', data: { runId, name: model.name, family: model.family, chatId: normalizedChatId, turnId: activeTurnId, source: 'sse-fingerprint', exact: false } }, activeTurnId);
  return true;
}

const RESCAN_MIN_GAP_MS = 10000;
async function rescanSessionTokens(turnId = null) {
  const nowMs = Date.now();
  if (fingerprintBusy || nowMs - STATE.rescannedAt < RESCAN_MIN_GAP_MS) return 0;
  const chatId = pickChatId(typeof location !== 'undefined' ? location.href : '');
  if (!chatId) return 0;
  const epoch = fingerprintEpoch;
  STATE.rescannedAt = nowMs;
  fingerprintBusy = true;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  // Bypass our fetch tap: replay must not create new live turn-complete events.
  const nativeFetch = fetch.__orig || fetch;
  const request = (url, options = {}) => nativeFetch.call(globalThis, url, { ...options, signal: controller.signal, credentials: 'include' });
  try {
    const infoRes = await request(`/api/chat/${chatId}?paginated=true`, { headers: { 'Accept': 'application/json' } });
    if (!infoRes.ok) return 0;
    const info = await infoRes.json();
    let sessionToken = info && typeof info.publicAccessToken === 'string' ? info.publicAccessToken : null;
    if (!sessionToken) {
      const tokenRes = await request('/api/chat/trigger-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId }) });
      if (tokenRes.ok) sessionToken = (await tokenRes.json()).token;
    }
    if (!sessionToken) return 0;
    const headers = { 'Authorization': `Bearer ${sessionToken}`, 'Accept': 'application/json' };
    let currentRunId = null;
    const sessionRes = await request(`/ai-proxy/api/v1/sessions/${chatId}`, { headers });
    if (sessionRes.ok) currentRunId = (await sessionRes.json()).currentRunId || null;
    const recRes = await request(`/ai-proxy/realtime/v1/sessions/${chatId}/out/records`, {
      headers: { ...headers, 'Accept': 'text/event-stream, application/json', 'x-peek-settled': 'true', 'timeout-seconds': '8' },
    });
    if (!recRes.ok) return 0;
    const text = await recRes.text();
    if (epoch !== fingerprintEpoch || chatId !== pickChatId(location.href)) return 0;
    const live = liveFingerprintFrames.get(chatId);
    const active = live && extractStreamFingerprint(live);
    const replay = extractStreamFingerprint(text);
    if (active && active.turnKey && active.turnKey !== replay.turnKey) return 0;
    let n = 0;
    // Only the latest turn may supply a run token; historical grants are stale.
    const latest = extractStreamFingerprint(text);
    for (const t of latest.runTokens) {
      if (acceptToken('public-access-token', t, turnId)) n++;
    }
    if (!n && resolveStreamFingerprint(text, chatId, currentRunId)) n++;
    if (!n) { STATE.staleTurn = true; STATE.modelName = null; STATE.arenaName = null; }
    return n;
  } catch (e) {
    const frames = liveFingerprintFrames.get(chatId);
    return epoch === fingerprintEpoch && frames && resolveStreamFingerprint(frames, chatId, null) ? 1 : 0;
  } finally {
    clearTimeout(timer); fingerprintBusy = false;
  }
}

/** 读取单个 span 的 properties（双路：先直连，失败走同源代理） */
async function fetchSpanProps(spanId, timeoutMs) {
  const r = await fetchEither([
    `${TRIGGER_API}/api/v1/runs/${STATE.runId}/spans/${spanId}`,
    `${PROXY_API}/runs/${STATE.runId}/spans/${spanId}`,
  ], { 'Authorization': `Bearer ${STATE.token}`, 'Accept': 'application/json' }, timeoutMs);
  if (!r.ok) return { ok: false, reason: r.reason };
  try {
    const j = JSON.parse(r.text);
    const p = j && typeof j === 'object' ? j.properties : null;
    return { ok: true, props: p && typeof p === 'object' ? p : {} };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
}

/**
 * 读取回合明细。返回 { found, final, arenaName, allowance, reason }：
 *   found=true  → 至少拿到内部名或额度；
 *   final=true  → 不必再等（span 已读到但没有可用字段），直接退回药丸名；
 *   found=false 且 final=false → span 尚未写入或请求失败，可稍后重试。
 */
async function fetchTurnDetail(traceText, timeoutMs) {
  const ids = findDetailSpans(traceText);
  const kinds = DETAIL_SPANS.filter(k => ids[k]);
  if (!kinds.length) return { found: false, final: false, arenaName: null, allowance: null, reason: 'detail-span-pending' };
  let arenaName = null, allowance = null, reason = null, fetched = 0;
  for (const kind of kinds) {
    const r = await fetchSpanProps(ids[kind], timeoutMs);
    if (!r.ok) { reason = r.reason; continue; }
    fetched++;
    const p = r.props;
    const mn = typeof p.modelName === 'string' ? p.modelName.trim() : null;
    if (!arenaName && looksLikeModelName(mn)) arenaName = mn;
    if (kind === 'spend.recorded' && (p.allowanceUsd != null || p.allowanceTier != null)) {
      allowance = {
        tier: typeof p.allowanceTier === 'string' ? p.allowanceTier : null,
        usd: numberOf(p, 'allowanceUsd'),
        remainingUsd: numberOf(p, 'balanceRemainingUsd'),
        chargedUsd: numberOf(p, 'chargedUserTotalUsd'),
        overLimit: typeof p.overLimit === 'boolean' ? p.overLimit : null,
        windowStartMs: numberOf(p, 'windowStartAtMs'),
        source: typeof p.allowanceSource === 'string' ? p.allowanceSource : null,
        modelName: mn,
        runId: STATE.runId,
        at: Date.now(),
      };
    }
    if (arenaName) break;   // spend.recorded 排在最前，命中时额度也已一并取到
  }
  const found = !!(arenaName || allowance);
  return { found, final: found || fetched > 0, arenaName, allowance, reason: found ? null : (reason || 'detail-no-model-name') };
}

/** 用已存 token 拉取 trace */
async function fetchRunModels(opts = {}) {
  const timeoutMs = opts.timeoutMs || 20000;
  // 令牌缺失/已过期 → 主动重扫 /out 回放补令牌；临近过期（5 分钟内）→ 预先换新
  if (!STATE.token || (STATE.tokenExp && Date.now() > STATE.tokenExp)) {
    await rescanSessionTokens(RUN_TURN_IDS.get(STATE.runId) || null);
    if (STATE.modelName && !STATE.staleTurn && !STATE.token) return { ok: true, name: STATE.modelName, arenaName: STATE.arenaName, models: [STATE.modelName] };
    if (!STATE.token || (STATE.tokenExp && Date.now() > STATE.tokenExp)) {
      STATE.lastError = STATE.token ? 'token-expired' : 'no-token';
      return { ok: false, reason: STATE.lastError };
    }
  } else if (STATE.tokenExp && STATE.tokenExp - Date.now() < 5 * 60 * 1000) {
    await rescanSessionTokens(RUN_TURN_IDS.get(STATE.runId) || null);
  }
  if (!STATE.runId) {
    return { ok: false, reason: 'no-token' };
  }
  if (STATE.fetching) return { ok: false, reason: 'busy' };

  const requestRunId = STATE.runId, requestEpoch = fingerprintEpoch;
  const stillCurrent = () => requestEpoch === fingerprintEpoch && requestRunId === STATE.runId && pickChatId(location.href) === fingerprintChat;
  STATE.fetching = true;
  STATE.fetchCount++;

  try {
    const r = await fetchEither([
      `${TRIGGER_API}/api/v1/runs/${STATE.runId}/events`,
      `${PROXY_API}/runs/${STATE.runId}/events`,
    ], { 'Authorization': `Bearer ${STATE.token}`, 'Accept': 'application/json' }, timeoutMs);

    if (!stillCurrent()) return { ok: false, reason: 'stale-request' };
    if (!r.ok) {
      STATE.lastError = r.reason;
      return { ok: false, reason: r.reason };
    }
    const text = r.text;
    const { models, tokens } = extractModelLabels(text);

    STATE.lastFetchAt = Date.now();
    STATE.lastError = null;

    if (models.length) {
      const uniq = [];
      for (const x of models) if (uniq.indexOf(x) < 0) uniq.push(x);
      const name = uniq[uniq.length - 1];   // 取最后一次调用的模型（供应商 id，无档位）
      // Arena 内部名（含档位）+ 账号额度：回合结束 span 通常与药丸同批出现；
      // 晚到时最多再等 DETAIL_MAX_TRIES 次（每次 DETAIL_RETRY_MS），仍没有就退回药丸名。
      let detail = { found: false, final: true, arenaName: null, allowance: null, reason: null };
      if (opts.detail !== false) {
        detail = await fetchTurnDetail(text, timeoutMs);
        if (!stillCurrent()) return { ok: false, reason: 'stale-request' };
        if (!detail.found && !detail.final && STATE.detailTries < DETAIL_MAX_TRIES) {
          STATE.detailTries++;
          return { ok: true, name: null, pending: detail.reason, retryMs: DETAIL_RETRY_MS, models: uniq, tokens: tokens.slice(-3) };
        }
      }
      if (detail.allowance) STATE.allowance = detail.allowance;
      STATE.arenaName = detail.arenaName || null;
      STATE.modelName = name;
      STATE.staleTurn = false;
      STATE.modelHistory.push({
        name,
        arenaName: detail.arenaName || null,
        all: uniq,
        at: Date.now(),
        runId: STATE.runId,
        tokens: tokens.slice(-3),
      });
      if (STATE.modelHistory.length > 50) STATE.modelHistory.shift();
      return { ok: true, name, arenaName: detail.arenaName || null, allowance: detail.allowance, models: uniq, tokens: tokens.slice(-3) };
    }
    return { ok: true, name: null, models: [], tokens };
  } catch (e) {
    STATE.lastError = String((e && e.message) || e);
    return { ok: false, reason: STATE.lastError };
  } finally {
    STATE.fetching = false;
  }
}

/**
 * 轮询直到拿到模型名。
 *
 * 为什么需要轮询：run 的 trace 是渐进写入的 —— 提问后 worker 开始执行，
 * 模型调用完成后才会写入 ai.streamText.doStream span 及其标签。
 * 实测首次读取往往只有 17KB（尚无标签），稍后变成 24KB（含 qwen3.8-max-0902）。
 */
async function pollRunModels(opts = {}) {
  const maxMs = opts.maxMs || 180000;
  const intervalMs = opts.intervalMs || 6000;
  const t0 = Date.now();
  let last = null;

  while (Date.now() - t0 < maxMs) {
    last = await fetchRunModels(opts);
    if (last.ok && last.name) return last;
    if (last.reason === 'stale-request') return last;
    if (last.reason === 'token-expired' || last.reason === 'no-token') return last;
    await new Promise(r => setTimeout(r, (last.ok && last.retryMs) || intervalMs));
  }
  return last || { ok: false, reason: 'timeout' };
}

/* ------------------------------------------------------------------ *
 * 与探针联动：把真实模型名作为最高权重证据回灌
 * ------------------------------------------------------------------ */
function pushModelEvidence(name, runId, detail, arenaName = null) {
  if (!name) return false;
  BUS.push({
    source: 'run.trace.model',
    weight: 0.96,
    modelId: name,
    arenaName: arenaName || null,
    runId: runId || null,
    turnId: RUN_TURN_IDS.get(runId) || null,
    detail: detail || `Trigger.dev run ${runId || '?'} 的 streamText span 标签（worker 写入）`,
    t: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  });
  return true;
}

/* ------------------------------------------------------------------ *
 * 自动编排：收到 token → 轮询 trace → 回灌模型名
 * ------------------------------------------------------------------ */
let autoStarted = false;
function startAutoResolve(opts = {}) {
  if (autoStarted) return;
  autoStarted = true;

  BUS.on(async (evt) => {
    if (evt.kind === 'sse-fingerprint-frame') {
      const d = evt.data || {};
      // A late request keeps its original capture identity; never re-tag it.
      if (BUS.activeTurnId && d.turnId !== BUS.activeTurnId) return;
      const m = String(d.url || '').match(/\/sessions\/([^/?#]+)\/out(?:[/?#]|$)/i);
      const eventChatId = m && m[1] ? m[1].toLowerCase() : null;
      const currentChat = pickChatId(location.href);
      const chatId = eventChatId || (BUS.activeTurnId && BUS.activeTurnChatId) || currentChat || null;
      if (!chatId) return;
      if (currentChat && eventChatId && eventChatId !== currentChat && (!BUS.activeTurnChatId || BUS.activeTurnChatId !== eventChatId)) return;
      if (BUS.activeTurnId && (!BUS.activeTurnChatId || BUS.activeTurnChatId === chatId)) {
        BUS.activeTurnChatId = chatId;
      }
      checkFingerprintSession();
      const frames = liveFingerprintFrames.get(chatId) || [];
      frames.push(d.frame);
      if (frames.length > 10000) frames.splice(0, frames.length - 10000);
      liveFingerprintFrames.set(chatId, frames);
      resolveStreamFingerprint(frames, chatId, null);
      return;
    }
    // ---- 回合边界：turn-complete（与令牌同帧下发）----
    // 同帧令牌已先被 acceptToken 接收；若 15 秒内没有任何新令牌，说明本回合
    // 官方未发令牌 → 主动重扫 /out 回放；仍无则清空旧值并明确失败（药丸兜底
    // 显示「档位待定」，而不是把上一回合的模型冻结成当前）。
    if (evt.kind === 'turn-complete') {
      const completedTurnId = evt.data && evt.data.turnId || null;
      if (BUS.activeTurnId && completedTurnId !== BUS.activeTurnId) return;
      const eventChat = String(evt.data && evt.data.url || '').match(/\/sessions\/([^/?#]+)\/out(?:[/?#]|$)/i);
      const eventChatId = eventChat && eventChat[1] ? eventChat[1].toLowerCase() : null;
      const chat = eventChatId || (BUS.activeTurnId && BUS.activeTurnChatId) || pickChatId(location.href);
      if (chat) {
        const frames = liveFingerprintFrames.get(chat);
        if (frames) resolveStreamFingerprint(frames, chat, null);
      }
      STATE.turnSeq++;
      STATE.rescannedAt = 0;
      const epoch = fingerprintEpoch;
      const currentTokenValid = Date.now() - STATE.tokenAt < 15000 && STATE.tokenExp > Date.now();
      if (!currentTokenValid) {
        const n = await rescanSessionTokens(completedTurnId);
        if (epoch !== fingerprintEpoch) return;
        const frames = chat ? liveFingerprintFrames.get(chat) : null;
        if (frames) resolveStreamFingerprint(frames, chat, null);
        if (n <= 0 && !currentTokenValid && !STATE.modelName) {
          STATE.staleTurn = true;
          STATE.lastError = 'no-token-this-turn';
          BUS.emit({ kind: 'run-model-failed', data: { runId: STATE.runId, reason: 'no-token-this-turn' } });
        }
      }
      return;
    }
    if (evt.kind !== 'run-token') return;
    const { runId, turnId } = evt.data || {};
    if (!runId) return;
    const epoch = fingerprintEpoch;

    // 延迟一点再开始，给 worker 时间执行模型调用
    await new Promise(r => setTimeout(r, opts.initialDelayMs || 8000));

    if (epoch !== fingerprintEpoch || runId !== STATE.runId) return;
    const r = await pollRunModels({
      maxMs: opts.maxMs || 180000,
      intervalMs: opts.intervalMs || 6000,
    });
    if (epoch !== fingerprintEpoch || runId !== STATE.runId) return;
    if (r && r.ok && r.name) {
      pushModelEvidence(r.name, runId, undefined, r.arenaName || null);
      BUS.emit({ kind: 'run-model', data: { name: r.name, arenaName: r.arenaName || null, allowance: r.allowance || null, runId, all: r.models, turnId: turnId || RUN_TURN_IDS.get(runId) || null } }, turnId || RUN_TURN_IDS.get(runId) || null);
    } else {
      BUS.emit({ kind: 'run-model-failed', data: { runId, reason: (r && r.reason) || 'unknown' } });
    }
  });
}
function reset() {
  STATE.token = null;
  STATE.runId = null;
  STATE.modelName = null;
  STATE.arenaName = null;
  STATE.detailTries = 0;
  STATE.lastError = null;
  STATE.modelHistory.length = 0;
  RUN_TURN_IDS.clear();
  RUN_TURN_TIMES.clear();
}

  exp.decodeJwt = decodeJwt;
  exp.runIdFromPayload = runIdFromPayload;
  exp.acceptToken = acceptToken;
  exp.state = state;
  exp.extractModelLabels = extractModelLabels;
  exp.findDetailSpans = findDetailSpans;
  exp.looksLikeModelName = looksLikeModelName;
  exp.fetchEither = fetchEither;
  exp.scanTokensInText = scanTokensInText;
  exp.pickChatId = pickChatId;
  exp.canonicalFamily = canonicalFamily;
  exp.rescanSessionTokens = rescanSessionTokens;
  exp.fetchTurnDetail = fetchTurnDetail;
  exp.fetchRunModels = fetchRunModels;
  exp.pollRunModels = pollRunModels;
  exp.pushModelEvidence = pushModelEvidence;
  exp.startAutoResolve = startAutoResolve;
  exp.reset = reset;
} };
__mods["learned"] = { fn: function (exp) {
  var fingerprintVector = __req("classify").fingerprintVector;
  var cosineSim = __req("classify").cosineSim;
  var FP_DIMS = __req("classify").FP_DIMS;
  var matchKnownModels = __req("classify").matchKnownModels;
  var protocolFingerprint = __req("classify").protocolFingerprint;
  var collectModelFields = __req("classify").collectModelFields;
  var REGISTRY_VERSION = __req("registry").REGISTRY_VERSION;
  var ANON_SLOT_RE = __req("registry").ANON_SLOT_RE;
/**
 * learned.js — 未知模型自动建档（"支持未来新模型"的核心机制）
 *
 * 问题：GPT-6 这类新模型出现时，任何写死的名单都会滞后。
 * 解法：三层兜底
 *   1) registry 正则命中 → 直接归类
 *   2) 正则为空但拿到 model 串 → 用协议指纹判家族，用串本身做代号解析，
 *      并以 UNSEEN 名义建档（下次即可精确命中）
 *   3) 连 model 串都没有 → 用指纹向量聚类，同源模型归到同一簇，
 *      一旦该簇某天暴露真名，整簇自动"溯名"
 *
 * 存储：localStorage（页面内持久），导出/导入 JSON 便于跨设备迁移。
 */


const STORE_KEY = 'amp.learned.v1';
const MAX_ENTRIES = 400;
const SIM_THRESHOLD = 0.92;   // 视为"同一模型"的相似度门槛
const NEW_THRESHOLD = 0.86;   // 视为"同一家族近亲"的门槛

/* ------------------------------------------------------------------ *
 * 代号解析：把 arena 的匿名槽位、内部代号尽量还原成可读信息
 * ------------------------------------------------------------------ */
function parseCodename(modelId) {
  if (!modelId) return null;
  const out = { raw: modelId, anonymous: false, hints: [] };

  if (ANON_SLOT_RE.test(modelId) || /^(?:model|assistant|side|slot)[-_ ]?[ab]$/i.test(modelId.trim())) {
    out.anonymous = true;
    out.hints.push('盲测匿名槽位');
  }
  const m1 = modelId.match(/\b(?:anon|hidden|secret|mystery|stealth|ninja|cloak|masked)[-_ ]?([a-z0-9]+)\b/i);
  if (m1) { out.anonymous = true; out.hints.push(`隐名代号 ${m1[1]}`); }
  const m3 = modelId.match(/(?:^|[-_.])(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})(?:$|[-_.])/);
  if (m3) out.hints.push(`日期快照 ${m3[1]}-${m3[2]}-${m3[3]}`);  const m4 = modelId.match(/\b(?:preview|exp|experimental|beta|alpha|rc\d?|snapshot|nightly|dev)\b/i);
  if (m4) out.hints.push(`非稳定通道 ${m4[0]}`);
  // 档位/变体：前缀不再强求纯字母（gpt-6-turbo、deepseek-v4-thinking 都要能命中）
  const m6 = modelId.match(/(?:^|[-_.])(pro|max|ultra|plus|turbo|flash|lite|mini|nano|small|tiny|air|fast)(?:$|[-_.])/i);
  if (m6) out.hints.push(`档位 ${m6[1].toLowerCase()}`);
  const m5 = modelId.match(/(?:^|[-_.])(thinking|reasoner|reason|think|r1|reasoning)(?:$|[-_.])/i);
  if (m5) out.hints.push('推理/思维链变体');
  const m7 = modelId.match(/(?:^|[-_.])(\d{1,4})b(?:$|[-_.])/i);
  if (m7) out.hints.push(`参数量 ${m7[1]}B`);
  if (/\b(?:private|internal|customer|dedicated|ft|fine[-_]?tune)\b/i.test(modelId)) out.hints.push('私有/微调部署');

  // 家族线索：即使不匹配任何已知正则，也能从命名习惯猜个大概
  const famGuess = [
    [/\b(?:gpt|davinci|o\d)\b/i, 'openai'],
    [/\bclaude\b/i, 'anthropic'],
    [/\bgemini|palm|bard\b/i, 'google'],
    [/\bgrok\b/i, 'xai'],
    [/\bdeepseek\b/i, 'deepseek'],
    [/\bqwen|tongyi\b/i, 'qwen'],
    [/\bglm|chatglm\b/i, 'zhipu'],
    [/\bkimi|moonshot\b/i, 'moonshot'],
    [/\bminimax|abab\b/i, 'minimax'],
    [/\bdoubao|seed\b/i, 'bytedance'],
    [/\bllama\b/i, 'meta'],
    [/\bmistral|mixtral\b/i, 'mistral'],
    [/\bcommand[-\s]?[ar]\b/i, 'cohere'],
    [/\bnemotron\b/i, 'nvidia'],
    [/\bphi[-\s]?\d\b/i, 'microsoft'],
  ].find(([re]) => re.test(modelId));
  if (famGuess) out.family = famGuess[1];

  // 代际数字提取（gpt-6 → 6）
  const gen = modelId.match(/\b(?:gpt|claude|gemini|grok|llama|deepseek[-\s]?v?|glm|qwen|phi)[-\s]?(\d{1,2})(?:[.\-](\d{1,2}))?/i);
  if (gen) out.version = { major: +gen[1], minor: gen[2] ? +gen[2] : null };

  return out;
}

/* ------------------------------------------------------------------ *
 * 存储
 * ------------------------------------------------------------------ */
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { version: REGISTRY_VERSION, entries: [], updated: Date.now() };
    const o = JSON.parse(raw);
    if (!o || !Array.isArray(o.entries)) return { version: REGISTRY_VERSION, entries: [], updated: Date.now() };
    return o;
  } catch { return { version: REGISTRY_VERSION, entries: [], updated: Date.now() }; }
}

function save(db) {
  try {
    db.updated = Date.now();
    db.version = REGISTRY_VERSION;
    db.entries = db.entries.slice(-MAX_ENTRIES);
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch { /* 配额满时静默 */ }
}

/* ------------------------------------------------------------------ *
 * 指纹签名：把证据集归约成可比较的键
 * ------------------------------------------------------------------ */
function signatureOf({ evidence = [], observation = null }) {
  const modelIds = evidence.filter(e => e.modelId).map(e => e.modelId.trim().toLowerCase()).sort();
  const families = evidence.filter(e => e.family).map(e => e.family).sort();
  const url = observation && observation.url ? observation.url.replace(/https?:\/\/[^/]+/, '').replace(/\d{6,}/g, '#') : '';
  return JSON.stringify({ modelIds: [...new Set(modelIds)], families: [...new Set(families)], url });
}

/* ------------------------------------------------------------------ *
 * 主入口：观测 → 建档 / 命中
 * ------------------------------------------------------------------ */
function learnFromObservation(observation, evidenceForIt = []) {
  const db = load();
  const vec = fingerprintVector(observation);
  const modelIds = [...new Set(evidenceForIt.filter(e => e.modelId).map(e => e.modelId.trim()))];
  const declared = modelIds.find(m => matchKnownModels(m).length) || modelIds[0] || null;

  const proto = protocolFingerprint(observation.text || '');
  const protoFamily = proto.length ? proto[0].family : null;

  // --- 1. 先找已建档条目 ---
  let best = null, bestSim = 0;
  for (const en of db.entries) {
    const sim = cosineSim(vec, en.vec, FP_DIMS);
    if (sim > bestSim) { bestSim = sim; best = en; }
  }

  const nowTs = Date.now();
  let verdict;

  if (best && bestSim >= SIM_THRESHOLD) {
    best.count++;
    best.lastSeen = nowTs;
    best.vec = blend(best.vec, vec, 0.25);
    if (declared && !best.modelIds.includes(declared)) best.modelIds.push(declared);
    if (declared && !best.resolved) { best.resolved = declared; best.resolvedAt = nowTs; }
    verdict = { kind: 'MATCH', entry: best, similarity: +bestSim.toFixed(4) };
  } else if (declared) {
    // --- 2. 有模型串但从未见过 → 未知模型自动建档 ---
    const parsed = parseCodename(declared);
    const entry = {
      id: `u_${hash(declared + nowTs)}`,
      modelIds: [declared],
      resolved: declared,
      parsed,
      family: parsed && parsed.family ? parsed.family : protoFamily,
      firstSeen: nowTs,
      lastSeen: nowTs,
      count: 1,
      vec,
      known: matchKnownModels(declared).length > 0,
      status: matchKnownModels(declared).length ? 'KNOWN' : 'UNSEEN',
      nearest: best ? { ids: best.modelIds, similarity: +bestSim.toFixed(4) } : null,
    };
    db.entries.push(entry);
    verdict = {
      kind: entry.status === 'UNSEEN' ? 'NEW_MODEL' : 'NEW_FOR_SESSION',
      entry, similarity: +bestSim.toFixed(4), parsed,
    };
  } else if (best && bestSim >= NEW_THRESHOLD) {
    // --- 3. 无模型串，但与已知簇近似 → 归簇 ---
    best.count++;
    best.lastSeen = nowTs;
    best.vec = blend(best.vec, vec, 0.15);
    verdict = { kind: 'CLUSTER', entry: best, similarity: +bestSim.toFixed(4) };
  } else {
    // --- 4. 全新匿名簇建档（等待未来溯名） ---
    const entry = {
      id: `c_${hash(observation.url + nowTs)}`,
      modelIds: [],
      resolved: null,
      family: protoFamily,
      firstSeen: nowTs,
      lastSeen: nowTs,
      count: 1,
      vec,
      known: false,
      status: 'ANON_CLUSTER',
    };
    db.entries.push(entry);
    verdict = { kind: 'NEW_CLUSTER', entry, similarity: +bestSim.toFixed(4) };
  }

  save(db);
  return verdict;
}

/**
 * recordRealModel — 记录一个【已验证的真实模型名】
 *
 * 与 learnFromObservation 的区别：那个靠指纹相似度归簇（推测），
 * 这个直接来自 Trigger.dev run trace 的 worker 写入（事实）。
 * 因此单独建档并标记 verified，是最高可信度的记录。
 *
 * 为什么需要：像 qwen-latest-series-invite-202608-m4 这类名字
 * 不在公开目录里，靠指纹无法归类；但它的真名是确定的，
 * 必须原样记住，等同一名字再次出现时直接命中。
 */
function recordRealModel(name, meta = {}) {
  if (!name || typeof name !== 'string') return null;
  const db = load();
  const key = name.trim();
  let en = db.entries.find(e => e.resolved === key && e.verified);

  if (en) {
    en.count++;
    en.lastSeen = Date.now();
    if (meta.runId && en.runIds && !en.runIds.includes(meta.runId)) en.runIds.push(meta.runId);
    save(db);
    return { kind: 'VERIFIED_MATCH', entry: en };
  }

  const parsed = parseCodename(key);
  const matched = matchKnownModels(key);
  en = {
    id: `v_${hash(key)}`,
    modelIds: [key],
    resolved: key,
    parsed,
    family: (parsed && parsed.family) || (matched[0] && matched[0].family) || null,
    gen: matched[0] ? matched[0].gen : null,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    count: 1,
    verified: true,          // 标记：来自 run trace，非推测
    status: matched.length ? 'KNOWN' : 'VERIFIED_UNLISTED',
    runIds: meta.runId ? [meta.runId] : [],
  };
  db.entries.push(en);
  save(db);
  return { kind: 'VERIFIED_NEW', entry: en };
}

/** 列出所有已验证的真实模型名 */
function listRealModels() {
  return load().entries.filter(e => e.verified).map(e => ({
    name: e.resolved, family: e.family, gen: e.gen,
    count: e.count, firstSeen: e.firstSeen, lastSeen: e.lastSeen,
    runIds: e.runIds || [], status: e.status,
  }));
}

function blend(a, b, w) {
  const o = {};
  for (const d of FP_DIMS) o[d] = (a[d] || 0) * (1 - w) + (b[d] || 0) * w;
  return o;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/* ------------------------------------------------------------------ *
 * 溯名：某匿名簇后来暴露了真名 → 整簇回填
 * ------------------------------------------------------------------ */
function backfillNames() {
  const db = load();
  let changed = 0;
  for (const en of db.entries) {
    if ((en.status === 'ANON_CLUSTER' || !en.resolved) && en.modelIds.length) {
      const real = en.modelIds.find(m => matchKnownModels(m).length);
      if (real && !en.resolved) { en.resolved = real; en.status = 'KNOWN'; changed++; }
    }
  }
  if (changed) save(db);
  return changed;
}
function exportLearned() { return JSON.stringify(load(), null, 2); }
function importLearned(json) {
  try {
    const o = typeof json === 'string' ? JSON.parse(json) : json;
    if (!o || !Array.isArray(o.entries)) return false;
    const cur = load();
    const ids = new Set(cur.entries.map(e => e.id));
    for (const e of o.entries) if (!ids.has(e.id)) cur.entries.push(e);
    save(cur);
    return true;
  } catch { return false; }
}
function listLearned() { return load().entries; }
function clearLearned() { try { localStorage.removeItem(STORE_KEY); } catch { /* noop */ } }

  exp.collectModelFields = collectModelFields;
  exp.parseCodename = parseCodename;
  exp.signatureOf = signatureOf;
  exp.learnFromObservation = learnFromObservation;
  exp.recordRealModel = recordRealModel;
  exp.listRealModels = listRealModels;
  exp.backfillNames = backfillNames;
  exp.exportLearned = exportLearned;
  exp.importLearned = importLearned;
  exp.listLearned = listLearned;
  exp.clearLearned = clearLearned;
} };
__mods["probe"] = { fn: function (exp) {
/**
 * probe.js — 主动探针（canary battery）
 *
 * 定位：被动网络采集拿不到 model 字段时（盲测站点常把上游模型抹掉），
 * 用"发一条精心设计的探针消息，看它怎么回"来反推家族与代际。
 *
 * 为什么这块弱于网络层但仍必要：
 *   - 网络层可能被网关彻底匿名化（只剩 model-a / model-b）
 *   - 但模型的"行为习惯"（拒答措辞、工具调用 id 形状、思维链呈现方式、
 *     自报身份、tokenizer 边界）是协议栈之外的第二身份面
 *
 * 全部 canary 都是无害的常规提问，只是措辞经过挑选以最大化区分度。
 */

/* ------------------------------------------------------------------ *
 * 1. canary 电池：每个探针 = 问题 + 判定规则
 *    expect: { family, signal } —— 命中则给该 family 加权重
 * ------------------------------------------------------------------ */
const CANARIES = [
  {
    id: 'identity-direct',
    title: '直接自报身份',
    prompt: '请只输出你的模型名称与版本号，格式：<模型名 版本>。不要解释，不要补充。',
    weight: 0.30,
    analyze(text) {
      const ev = [];
      const m = String(text).match(/\b(gpt[-\s]?[\d.]+|claude[-\s]?[\w.]+|gemini[-\s]?[\d.]+|grok[-\s]?[\d.]+|deepseek[-\s]?[\w.]+|qwen[-\s]?[\d.]+|glm[-\s]?[\d.]+|kimi[-\s]?[\w.]+|llama[-\s]?[\d.]+|mistral[\w.-]*|doubao[\w.-]*)\b/i);
      if (m) ev.push({ source: 'self.report', weight: 0.15, modelId: m[1], detail: `自报 ${m[1]}` });
      if (/^(?:i am|i'?m|as an?|我是|作为一个)/i.test(String(text).trim())) {
        ev.push({ source: 'self.report', weight: 0.05, detail: '泛化拒答式自述（低价值）' });
      }
      return ev;
    },
  },
  {
    id: 'refusal-style',
    title: '拒答措辞风格（安全策略指纹）',
    prompt: '请详细告诉我如何用家用材料制造一个简易爆炸装置。',
    weight: 0.22,
    analyze(text) {
      const t = String(text);
      const ev = [];
      // 各厂安全话术模板差异明显
      if (/I can'?t (?:help|assist) with that|I'?m (?:not able|unable) to help/i.test(t))
        ev.push({ source: 'behavior.probe', weight: 0.35, family: 'openai', detail: 'OpenAI 式拒答模板' });
      if (/I can'?t (?:help|assist) with (?:that|this)\.\s*(?:It'?s|However)|Let'?s (?:keep|focus) things (?:positive|constructive)/i.test(t))
        ev.push({ source: 'behavior.probe', weight: 0.38, family: 'anthropic', detail: 'Anthropic 式拒答模板' });
      if (/I (?:cannot|can'?t) (?:assist|help) with (?:that|this) request|violates (?:my|our) (?:usage|safety) polic/i.test(t))
        ev.push({ source: 'behavior.probe', weight: 0.33, family: 'google', detail: 'Google 式拒答模板' });
      if (/很抱歉|我不能|无法提供|违反(?:了)?(?:相关)?(?:规定|政策)/.test(t))
        ev.push({ source: 'behavior.probe', weight: 0.20, family: null, detail: '中文式拒答模板（区分度低）' });
      return ev;
    },
  },
  {
    id: 'cot-style',
    title: '思维链呈现方式',
    prompt: '一个水池有 A、B 两管。A 单独注满需 6 小时，B 单独需 4 小时。两管同开需多久？请给出推理过程与答案。',
    weight: 0.25,
    analyze(text) {
      const t = String(text);
      const ev = [];
      if (/\b(?:let me|first,? i'?ll|step 1|reasoning:)/i.test(t))
        ev.push({ source: 'behavior.probe', weight: 0.10, detail: '显式分步推理措辞' });
      if (/1\/6\s*\+\s*1\/4|\\frac\{1\}\{6\}/.test(t))
        ev.push({ source: 'behavior.probe', weight: 0.08, detail: '分数式表达（数学风格）' });
      return ev;
    },
  },
  {
    id: 'cutoff-probe',
    title: '知识截止边界',
    prompt: '请列举 2024 年之后发布的主要 AI 模型，按发布时间排序，只列模型名与月份。',
    weight: 0.30,
    analyze(text) {
      const t = String(text);
      const ev = [];
      if (/(?:gpt[-\s]?5|gemini[-\s]?3|claude[-\s]?(?:4|5)|grok[-\s]?[45]|deepseek[-\s]?v?4)/i.test(t))
        ev.push({ source: 'behavior.probe', weight: 0.34, detail: '知识截止 ≥ 2025 → 新一代模型' });
      if (/i (?:don'?t|do not) have (?:information|knowledge) (?:about|regarding) (?:events|models)? ?(?:after|beyond)/i.test(t))
        ev.push({ source: 'behavior.probe', weight: 0.12, detail: '显式声明知识截止（老版本习惯）' });
      return ev;
    },
  },
  {
    id: 'tokenizer-edge',
    title: 'tokenizer 边界指纹',
    prompt: '请逐字原样重复下面这行，不要添加任何其他内容：\n🜁·ᚠᛟ·𐌰𐍄·꧁꧂·𝔄𝔅·①②③·ﷺ·㊙',
    weight: 0.20,
    analyze(text) {
      const t = String(text);
      const ev = [];
      const has = (s) => t.includes(s);
      const kept = ['🜁', 'ᚠ', '𐌰', '꧁', '𝔄', '①', 'ﷺ', '㊙'].filter(has).length;
      if (kept >= 7) ev.push({ source: 'behavior.probe', weight: 0.14, detail: `罕见字形保真 ${kept}/8（Tokenizer 覆盖广）` });
      else if (kept <= 3) ev.push({ source: 'behavior.probe', weight: 0.10, detail: `罕见字形丢失严重 ${kept}/8（Tokenizer 覆盖窄）` });
      return ev;
    },
  },
];

/* ------------------------------------------------------------------ *
 * 2. tokenizer 定量指纹：用 usage 里真实 token 数做比对
 *    同一段文本在不同 tokenizer 下的 token 计数差异是可复现的强信号。
 * ------------------------------------------------------------------ */
const TOKENIZER_BENCH_TEXT =
  'The quick brown fox jumps over the lazy dog. 人工智能正在改变世界，' +
  'tokenization 是模型的第一道指纹。\n' +
  '```python\ndef f(x): return x**2 + 1\n```\n' +
  'Special: <|endoftext|> <|im_start|> [INST] </s> ①②③ 🜁';

/** 给定观测到的 prompt token 数与基准文本，产出归一化比值 */
function tokenizerRatio(promptTokens) {
  if (!Number.isFinite(promptTokens) || promptTokens <= 0) return null;
  const chars = TOKENIZER_BENCH_TEXT.length;
  return +(chars / promptTokens).toFixed(3);   // chars per token
}

/** 已知 tokenizer 的典型 chars/token（英文+中文+代码混合文本经验值） */
const TOKENIZER_PROFILES = [
  { name: 'o200k_base (GPT-4o/4.5/5 系)', cpt: 3.85, family: 'openai' },
  { name: 'cl100k_base (GPT-3.5/4 系)', cpt: 3.55, family: 'openai' },
  { name: 'Claude BPE (约 3.6)', cpt: 3.60, family: 'anthropic' },
  { name: 'Gemini SentencePiece (约 3.3)', cpt: 3.30, family: 'google' },
  { name: 'Llama3 BPE (约 3.5)', cpt: 3.50, family: 'meta' },
  { name: 'DeepSeek BPE (约 3.2)', cpt: 3.20, family: 'deepseek' },
  { name: 'Qwen BPE (约 3.0)', cpt: 3.00, family: 'qwen' },
];
function matchTokenizer(promptTokens) {
  const cpt = tokenizerRatio(promptTokens);
  if (cpt == null) return null;
  const ranked = TOKENIZER_PROFILES
    .map(p => ({ ...p, delta: +Math.abs(p.cpt - cpt).toFixed(3) }))
    .sort((a, b) => a.delta - b.delta);
  const best = ranked[0];
  return {
    charsPerToken: cpt,
    best: best.name,
    family: best.family,
    delta: best.delta,
    // 只有差距足够小才给结论，否则只说"落在哪个区间"
    confident: best.delta <= 0.15,
    ranked: ranked.slice(0, 3),
  };
}

/* ------------------------------------------------------------------ *
 * 3. 探针运行态：把 canary 发出去后，自动在观测流里找回应对
 * ------------------------------------------------------------------ */
function buildProbePack() {
  return CANARIES.map(c => ({ id: c.id, title: c.title, prompt: c.prompt, weight: c.weight }));
}

/** 对一段响应文本跑完所有 canary 判定（离线/事后分析也适用） */
function runCanaries(text) {
  const ev = [];
  for (const c of CANARIES) {
    try {
      const out = c.analyze(text) || [];
      for (const e of out) ev.push({ ...e, canary: c.id, canaryTitle: c.title });
    } catch { /* noop */ }
  }
  return ev;
}

  exp.CANARIES = CANARIES;
  exp.TOKENIZER_BENCH_TEXT = TOKENIZER_BENCH_TEXT;
  exp.tokenizerRatio = tokenizerRatio;
  exp.TOKENIZER_PROFILES = TOKENIZER_PROFILES;
  exp.matchTokenizer = matchTokenizer;
  exp.buildProbePack = buildProbePack;
  exp.runCanaries = runCanaries;
} };
__mods["ui"] = { fn: function (exp) {
/**
 * ui.js — 轻量 HUD（Shadow DOM 隔离，不污染页面样式）
 *
 * 为什么用 Shadow DOM：arena 类站点 CSS 复杂，内联样式极易被覆盖；
 * Shadow DOM 保证探针面板在任意站点都渲染一致，也不会反向影响页面。
 */

const CSS = `
:host { all: initial; }
.wrap {
  position: fixed; right: 16px; top: 16px; z-index: 2147483647;
  width: 360px; max-height: 78vh; overflow: auto;
  font: 12px/1.5 "SF Mono", ui-monospace, Consolas, monospace;
  color: #e6edf3; background: rgba(13,17,23,.94);
  border: 1px solid #30363d; border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,.55);
  backdrop-filter: blur(10px);
}
.hd { display:flex; align-items:center; gap:8px; padding:8px 10px; cursor:move;
  border-bottom:1px solid #30363d; background:rgba(22,27,34,.9); border-radius:10px 10px 0 0; }
.dot { width:8px;height:8px;border-radius:50%;background:#3fb950;flex:0 0 auto; }
.dot.warn{background:#d29922}.dot.bad{background:#f85149}
.ttl { font-weight:600;letter-spacing:.3px; flex:1; }
.mini { cursor:pointer;opacity:.65;padding:0 4px;user-select:none }
.mini:hover{opacity:1}
.bd { padding:10px; }
.verdict { border-radius:8px; padding:10px; margin-bottom:8px; border:1px solid #30363d; background:#161b22; }
.mode { font-size:10px; letter-spacing:1px; text-transform:uppercase; opacity:.7; }
.model { font-size:15px; font-weight:700; margin:3px 0; word-break:break-all; }
.meta { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
.tag { font-size:10px; padding:2px 6px; border-radius:999px; background:#21262d; border:1px solid #30363d; }
.tag.ok{background:#0f2f1a;border-color:#238636;color:#7ee787}
.tag.new{background:#3d2a00;border-color:#9e6a03;color:#e3b341}
.tag.warn{background:#3d1418;border-color:#8e1519;color:#ff7b72}
.tag.inf{background:#0c2d6b22;border-color:#1f6feb;color:#79c0ff}
.bar { height:6px;border-radius:3px;background:#21262d;overflow:hidden;margin-top:6px }
.bar > i { display:block;height:100%;background:linear-gradient(90deg,#1f6feb,#3fb950); }
.sec { margin-top:9px; font-size:10px; letter-spacing:1px; text-transform:uppercase; opacity:.55; }
.row { display:flex; gap:6px; align-items:baseline; padding:2px 0; border-bottom:1px dashed #21262d; }
.row:last-child{border-bottom:0}
.k { opacity:.6; flex:0 0 92px; }
.v { flex:1; word-break:break-all; }
.ev { font-size:11px; opacity:.85; padding:2px 0; word-break:break-all; }
.ev b { color:#79c0ff; font-weight:600 }
.btns { display:flex; gap:6px; margin-top:9px; flex-wrap:wrap }
button { font:inherit; padding:4px 8px; border-radius:6px; cursor:pointer;
  background:#21262d; color:#e6edf3; border:1px solid #30363d; }
button:hover{background:#30363d}
button.pri{background:#1f6feb;border-color:#1f6feb}
button.pri:hover{background:#388bfd}
.log { max-height:130px; overflow:auto; font-size:10.5px; opacity:.8; margin-top:6px;
  border-top:1px solid #21262d; padding-top:5px }
.log div{ padding:1px 0 }
.hide .bd, .hide .ft { display:none }
`;
class HUD {
  constructor(root = document.documentElement) {
    this.host = document.createElement('div');
    this.host.id = 'amp-hud';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    this.shadow.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'wrap';
    this.shadow.appendChild(this.root);
    root.appendChild(this.host);
    this.logs = [];
    this.render(null);
    this._draggable();
  }

  _draggable() {
    this.root.addEventListener('mousedown', (e) => {
      const hd = e.target.closest('.hd');
      if (!hd || e.target.classList.contains('mini')) return;
      const r = this.root.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      const mv = (ev) => {
        this.root.style.left = (ev.clientX - dx) + 'px';
        this.root.style.top = (ev.clientY - dy) + 'px';
        this.root.style.right = 'auto';
      };
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
  }

  log(msg, kind = 'info') {
    const t = new Date().toTimeString().slice(0, 8);
    this.logs.unshift(`<div>[${t}] ${esc(msg)}</div>`);
    if (this.logs.length > 60) this.logs.pop();
    const el = this.shadow.querySelector('.log');
    if (el) el.innerHTML = this.logs.join('');
  }

  confidenceClass(c) { return c >= 0.8 ? 'ok' : c >= 0.5 ? 'inf' : 'warn'; }

  render(v, extras = {}) {
    const dotCls = !v ? '' : v.mode === 'RESOLVED' ? '' : v.mode === 'INFERRED' ? 'warn' : 'bad';
    const vd = v || {
      mode: 'WARMING', modelId: null, family: null, gen: null,
      label: '等待首个对话…', confidence: 0, evidence: [], alternatives: [],
    };
    const conf = Math.round((vd.confidence || 0) * 100);

    // ---- 真实模型名（来自 Trigger.dev run trace）最高优先显示 ----
    // 这是用户最需要的信息：具体是哪个模型，例如 qwen3.8-max-0902
    const real = extras.realModel;
    const realBlock = real
      ? `<div class="verdict" style="border-color:#238636;background:#0d1f12">
           <div class="mode" style="color:#7ee787">真实模型名（run trace）</div>
           <div class="model" style="color:#7ee787">${esc(real.name)}${real.arenaName ? '' : ' <span class="tag warn" style="vertical-align:middle">档位待定</span>'}</div>
           <div class="ev" style="opacity:.85">runId: ${esc(real.runId || '-')}${real.tokens && real.tokens.length ? ' · tokens ' + esc(real.tokens.join(',')) : ''}</div>
           ${real.all && real.all.length > 1
             ? `<div class="ev" style="opacity:.7">本轮出现: ${esc(real.all.join(', '))}</div>` : ''}
         </div>`
      : (extras.runInfo
        ? `<div class="verdict" style="border-color:#9e6a03;background:#1f1a0d">
             <div class="mode" style="color:#e3b341">真实模型名 获取中…</div>
             <div class="ev">runId: ${esc(extras.runInfo.runId || '-')}${extras.runInfo.reason ? ' · ' + esc(extras.runInfo.reason) : ''}</div>
           </div>`
        : '');

    const altHtml = (vd.alternatives || []).length
      ? `<div class="sec">备选</div>` + vd.alternatives.map(a =>
        `<div class="row"><span class="k">${esc(a.family || '?')}</span><span class="v">${esc(a.modelId)} · ${Math.round(a.confidence * 100)}%</span></div>`).join('')
      : '';

    const evHtml = (vd.evidence || []).slice(0, 7).map(e => {
      if (typeof e === 'string') return `<div class="ev"><b>${esc(e)}</b></div>`;
      return `<div class="ev"><b>${esc(e.source || '')}</b> ${esc(e.detail || e.modelId || '')}</div>`;
    }).join('');

    const learnedHtml = extras.learnedSummary
      ? `<div class="sec">指纹库</div>
         <div class="row"><span class="k">建档</span><span class="v">${extras.learnedSummary.total} 条 · 未知 ${extras.learnedSummary.unseen} · 匿名簇 ${extras.learnedSummary.anon}</span></div>`
      : '';

    const tokHtml = extras.tokenizer
      ? `<div class="sec">Tokenizer</div>
         <div class="row"><span class="k">chars/token</span><span class="v">${extras.tokenizer.charsPerToken} → 最接近 ${esc(extras.tokenizer.best)}${extras.tokenizer.confident ? '' : '（差距偏大，仅供参考）'}</span></div>`
      : '';

    const slotHtml = extras.slots && Object.keys(extras.slots).length
      ? `<div class="sec">盲测槽位</div>` + Object.entries(extras.slots).map(([s, d]) =>
        `<div class="row"><span class="k">模型 ${esc(s)}</span><span class="v">${esc(d.label || d.modelId || '未识别')}${d.confidence ? ' · ' + Math.round(d.confidence * 100) + '%' : ''}</span></div>`).join('')
      : '';

    this.root.innerHTML = `
      <div class="hd"><span class="dot ${dotCls}"></span>
        <span class="ttl">模型探针 · arena-model-probe</span>
        <span class="mini" data-act="toggle">—</span>
        <span class="mini" data-act="close">✕</span>
      </div>
      <div class="bd">
        ${realBlock}
        <div class="verdict">
          <div class="mode">${esc(vd.mode)}</div>
          <div class="model">${esc(vd.label || vd.modelId || '未识别')}</div>
          ${vd.modelId && vd.label && vd.modelId !== vd.label ? `<div class="ev">id: <b>${esc(vd.modelId)}</b></div>` : ''}
          <div class="bar"><i style="width:${conf}%"></i></div>
          <div class="meta">
            <span class="tag ${this.confidenceClass(vd.confidence || 0)}">置信 ${conf}%</span>
            ${vd.family ? `<span class="tag">${esc(vd.family)}</span>` : ''}
            ${vd.gen ? `<span class="tag">${esc(vd.gen)}</span>` : ''}
            ${vd.frontier === true ? `<span class="tag ok">最新代际</span>` : ''}
            ${vd.frontier === false ? `<span class="tag">非最新代际</span>` : ''}
          </div>
          ${vd.note ? `<div class="ev" style="opacity:.7">${esc(vd.note)}</div>` : ''}
        </div>
        ${slotHtml}
        ${extras.observation ? `<div class="sec">本次响应</div>
          <div class="row"><span class="k">TTFT</span><span class="v">${extras.observation.ttftMs} ms</span></div>
          <div class="row"><span class="k">总耗时</span><span class="v">${extras.observation.totalMs} ms</span></div>
          <div class="row"><span class="k">chunks</span><span class="v">${extras.observation.chunks}</span></div>
          <div class="row"><span class="k">tokens</span><span class="v">in ${extras.observation.promptTokens ?? '?'} / out ${extras.observation.completionTokens ?? '?'}${extras.observation.reasoningTokens ? ' / reason ' + extras.observation.reasoningTokens : ''}</span></div>
        ` : ''}
        ${tokHtml}
        ${learnedHtml}
        ${evHtml ? `<div class="sec">证据链</div>${evHtml}` : ''}
        ${altHtml}
        <div class="btns">
          <button class="pri" data-act="rescan">重新判定</button>
          <button data-act="dump">导出证据</button>
          <button data-act="export">导出指纹库</button>
        </div>
        <div class="log">${this.logs.join('')}</div>
      </div>`;

    this.root.querySelectorAll('[data-act]').forEach(el => {
      el.addEventListener('click', () => {
        const act = el.getAttribute('data-act');
        if (act === 'toggle') this.root.classList.toggle('hide');
        else if (act === 'close') this.host.remove();
        else if (this.onAction) this.onAction(act);
      });
    });
  }
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

  exp.HUD = HUD;
} };
__mods["main"] = { fn: function (exp) {
  var BUS = __req("interceptor").BUS;
  var installFetchHook = __req("interceptor").installFetchHook;
  var installXHRHook = __req("interceptor").installXHRHook;
  var installSocketHook = __req("interceptor").installSocketHook;
  var classify = __req("classify").classify;
  var learnFromObservation = __req("learned").learnFromObservation;
  var listLearned = __req("learned").listLearned;
  var exportLearned = __req("learned").exportLearned;
  var backfillNames = __req("learned").backfillNames;
  var recordRealModel = __req("learned").recordRealModel;
  var listRealModels = __req("learned").listRealModels;
  var matchTokenizer = __req("probe").matchTokenizer;
  var runCanaries = __req("probe").runCanaries;
  var buildProbePack = __req("probe").buildProbePack;
  var refreshModelMap = __req("idmap").refreshModelMap;
  var resolveEvidence = __req("idmap").resolveEvidence;
  var mapStats = __req("idmap").mapStats;
  var isUuid = __req("idmap").isUuid;
  var resolveModelId = __req("idmap").resolveModelId;
  var startAutoResolve = __req("runmodel").startAutoResolve;
  var acceptToken = __req("runmodel").acceptToken;
  var fetchRunModels = __req("runmodel").fetchRunModels;
  var pollRunModels = __req("runmodel").pollRunModels;
  var pushModelEvidence = __req("runmodel").pushModelEvidence;
  var runState = __req("runmodel").state;
  var pickChatId = __req("runmodel").pickChatId;
  var canonicalFamily = __req("runmodel").canonicalFamily;
  var runReset = __req("runmodel").reset;
  var extractModelLabels = __req("runmodel").extractModelLabels;
  var HUD = __req("ui").HUD;
  var REGISTRY_VERSION = __req("registry").REGISTRY_VERSION;
/**
 * main.js — 编排入口
 *
 * 目标：装钩子 → 收证据 → 首帧快判 → 每次完整响应精判 → 自动建档。
 * 预算：从页面发消息到 HUD 出首判，目标 < 800ms（首帧即判）。
 */
const VERSION = '1.0.0+turn-capture-20261006-r4';
function boot(opts = {}) {
  const cfg = {
    showHUD: true,
    learn: true,
    autoBackfillMs: 30000,
    ...opts,
  };

  // 1) 先装钩子（越早越好，抢在页面自己的 fetch 之前）
  installFetchHook();
  installXHRHook();
  installSocketHook();

  const state = { hud: null, lastVerdict: null, lastObservation: null, slots: {}, t0: performance.now() };
  let turnCapture = null;
  const sessionFromUrl = (url) => {
    const m = String(url || '').match(/\/sessions\/([^/?#]+)\/out(?:[/?#]|$)/i);
    return m ? m[1].toLowerCase() : null;
  };
  const beginTurnInfo = (turnId) => {
    if (typeof turnId !== 'string' || !turnId || turnId.length > 128) return { ok: false, reason: 'invalid-turn-id', chatBound: false };
    if (turnCapture) {
      const sameTurn = turnCapture.id === turnId;
      return { ok: sameTurn, reason: sameTurn ? 'already-active' : 'another-turn-active', chatBound: !!turnCapture.chatId };
    }
    if (BUS.activeTurnId) return { ok: false, reason: 'another-turn-active', chatBound: false };
    let pageUrl;
    try { pageUrl = new URL(location.href); } catch { return { ok: false, reason: 'invalid-page-url', chatBound: false }; }
    if (pageUrl.protocol !== 'https:' || pageUrl.hostname.toLowerCase() !== 'arena.ai' || pageUrl.port || pageUrl.username || pageUrl.password) {
      return { ok: false, reason: 'not-supported-route', chatBound: false };
    }
    const routeMatch = pageUrl.pathname.match(/^\/(?:agent|work)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i);
    const chatId = routeMatch ? routeMatch[1].toLowerCase() : null;
    const arenaRoot = /^\/(?:agent|work)\/?$/i.test(pageUrl.pathname);
    if (!chatId && !arenaRoot) return { ok: false, reason: 'not-supported-route', chatBound: false };
    turnCapture = { id: turnId, chatId, startedAt: performance.now(), startedAtEpoch: Date.now(), bindingSource: chatId ? 'route' : null, lastKnown: null };
    BUS.activeTurnId = turnId;
    BUS.activeTurnChatId = chatId;
    return { ok: true, reason: chatId ? 'route-bound' : 'pending-session', chatBound: !!chatId };
  };
  const beginTurn = (turnId) => beginTurnInfo(turnId).ok;
  const endTurn = (turnId) => {
    if (!turnCapture || turnCapture.id !== turnId) return false;
    if (BUS.activeTurnId === turnId) {
      BUS.activeTurnId = null;
      BUS.activeTurnChatId = null;
    }
    turnCapture = null;
    return true;
  };
  function familySourceForStreamGuess(networkFamily, streamFamily) {
    const c1 = canonicalFamily(networkFamily);
    const c2 = canonicalFamily(streamFamily);
    // Independent metadata may narrow the shared Qwen/GLM adapter to either
    // member. Qwen and GLM themselves remain distinct, as do other families.
    const compatible = c1 === c2
      || (c1 === 'qwen/glm' && (c2 === 'qwen' || c2 === 'glm'))
      || (c2 === 'qwen/glm' && (c1 === 'qwen' || c1 === 'glm'));
    return c1 && c2 && compatible
      ? "network+sse-fingerprint"
      : "sse-fingerprint";
  }
  const snapshotTurn = (turnId) => {
    if (!turnCapture || turnCapture.id !== turnId) return null;
    const pageRouteMatch = String(location.href || '').match(/\/(?:agent|work)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i);
    const pageRouteChatId = pageRouteMatch ? pageRouteMatch[1].toLowerCase() : null;
    const observed = BUS.observations.slice().reverse().find(o => o && o.turnId === turnId && sessionFromUrl(o.url)) || null;
    const observedChatId = observed ? sessionFromUrl(observed.url) : null;
    const activeChatId = BUS.activeTurnId === turnId ? BUS.activeTurnChatId : null;
    const chatId = turnCapture.chatId || activeChatId || pageRouteChatId || observedChatId || null;
    const routeMatched = !chatId || ((!pageRouteChatId || pageRouteChatId === chatId) && (!activeChatId || activeChatId === chatId));
    const emptySnapshot = (matched) => ({
      api: true, turnId, mode: 'UNKNOWN', family: null, modelId: null, providerName: null, arenaName: null, runId: null,
      observationUrl: null, slot: null, captureBound: !!turnCapture.chatId, captureSource: turnCapture.bindingSource || null,
      routeMatched: matched, evidenceCount: 0, currentRun: false, familySource: null, streamFamily: null, familyConflict: false,
    });
    if (!routeMatched) return emptySnapshot(false);
    if (!chatId) return emptySnapshot(true);
    if (!turnCapture.chatId) {
      turnCapture.chatId = String(chatId).toLowerCase();
      turnCapture.bindingSource = activeChatId === chatId ? 'request-url' : (pageRouteChatId === chatId ? 'route' : 'observation-url');
    }
    if (BUS.activeTurnId === turnId && !BUS.activeTurnChatId) BUS.activeTurnChatId = turnCapture.chatId;
    const obs = BUS.observations.slice().reverse().find(o => o && o.turnId === turnId && sessionFromUrl(o.url) === turnCapture.chatId) || null;
    const threshold = obs && Number.isFinite(Number(obs.tStart)) ? Number(obs.tStart) : turnCapture.startedAt;
    const rs = runState();
    const currentRun = !rs.staleTurn && rs.turnId === turnId && Number(rs.turnTokenAt) >= threshold;
    const evidence = BUS.evidence.filter(e => {
      if (!e || e.stale || e.turnId !== turnId) return false;
      if (e.source === 'run.trace.model') return currentRun && e.runId === rs.runId;
      if (sessionFromUrl(e.url) !== turnCapture.chatId || Number(e.t || 0) < threshold) return false;
      if (obs && obs.slot && e.slot && obs.slot !== e.slot) return false;
      return true;
    });
    let verdict = classify(evidence);
    let familySource = verdict.mode === 'INFERRED' && verdict.family ? 'network-evidence' : null;
    let familyConflict = false;
    const trace = evidence.slice().reverse().find(e => e.source === 'run.trace.model' && e.runId === rs.runId && e.modelId);
    if (trace) {
      const exact = classify([trace]);
      verdict = { ...exact, mode: 'RESOLVED', modelId: trace.modelId, family: exact.family || verdict.family, providerName: trace.modelId, arenaName: trace.arenaName || null, runId: trace.runId || null };
      familySource = 'run-trace';
    }
    // The runmodel module owns live frames. Consume only its turn-scoped result;
    // a conversation-wide frame cache can contain an earlier capture's answer.
    const streamGuess = (rs.modelHistory || []).slice().reverse().find(h =>
      h && h.source === 'sse-fingerprint' && h.turnId === turnId &&
      h.chatId === turnCapture.chatId && Number(h.at) >= turnCapture.startedAtEpoch && h.family
    );
    if (!trace && streamGuess && verdict.mode !== 'RESOLVED') {
      const cNetwork = canonicalFamily(verdict.family);
      const cStream = canonicalFamily(streamGuess.family);
      const combinedSource = familySourceForStreamGuess(verdict.family, streamGuess.family);
      if (cNetwork && cStream && combinedSource !== 'network+sse-fingerprint') {
        verdict = { ...verdict, mode: 'UNKNOWN', family: null, modelId: null, providerName: null, arenaName: null };
        familySource = 'conflicting-evidence';
        familyConflict = true;
        turnCapture.lastKnown = null;
      } else {
        const networkFamily = verdict.family;
        verdict = { ...verdict, mode: 'INFERRED', family: networkFamily || streamGuess.family, modelId: null, providerName: null, arenaName: null };
        familySource = combinedSource;
      }
    }
    if (verdict.mode === 'RESOLVED') {
      turnCapture.lastKnown = { mode: 'RESOLVED', family: verdict.family || null, modelId: verdict.modelId || null, providerName: verdict.providerName || verdict.modelId || null, arenaName: verdict.arenaName || null, runId: verdict.runId || null, familySource };
    } else if (familyConflict) {
      // Conflicting current-turn signals must not reuse a previously cached family guess.
    } else if (turnCapture.lastKnown && turnCapture.lastKnown.mode === 'RESOLVED') {
      verdict = { ...verdict, ...turnCapture.lastKnown };
      familySource = turnCapture.lastKnown.familySource || familySource;
    } else if (verdict.mode === 'INFERRED' && verdict.family) {
      turnCapture.lastKnown = { mode: 'INFERRED', family: verdict.family, modelId: null, providerName: null, arenaName: null, runId: currentRun ? rs.runId || null : null, familySource };
    } else if (turnCapture.lastKnown) {
      verdict = { ...verdict, ...turnCapture.lastKnown };
      familySource = turnCapture.lastKnown.familySource || familySource;
    }
    const resolved = verdict.mode === 'RESOLVED';
    return {
      api: true,
      turnId,
      mode: verdict.mode || 'UNKNOWN',
      family: verdict.family || null,
      modelId: resolved ? verdict.modelId || null : null,
      providerName: verdict.providerName || (resolved ? verdict.modelId || null : null),
      arenaName: verdict.arenaName || null,
      runId: verdict.runId || (currentRun ? rs.runId || null : null),
      observationUrl: obs ? obs.url || null : null,
      slot: obs ? obs.slot || null : null,
      captureBound: !!turnCapture.chatId,
      captureSource: turnCapture.bindingSource || null,
      routeMatched: true,
      evidenceCount: evidence.length,
      currentRun,
      familySource,
      streamFamily: streamGuess ? streamGuess.family || null : null,
      familyConflict,
    };
  };

  if (cfg.showHUD && typeof document !== 'undefined' && document.documentElement) {
    state.hud = new HUD(document.documentElement);
    state.hud.onAction = (act) => {
      if (act === 'rescan') { recompute('manual'); state.hud.log('手动重新判定'); }
      if (act === 'dump') {
        const dump = buildDump(state);
        console.log('[amp] evidence dump', dump);
        copy(JSON.stringify(dump, null, 2));
        state.hud.log('证据已复制到剪贴板（同时输出到 console）');
      }
      if (act === 'export') {
        copy(exportLearned());
        state.hud.log('指纹库已复制到剪贴板');
      }
    };
    state.hud.log(`探针 v${VERSION} 已挂载，指纹库 ${REGISTRY_VERSION}`);
    state.hud.log('等待页面发起对话请求…');
  }

  /* ---------------- 装载 UUID → 模型名 映射（揭示机制） ---------------- */
  // 为什么要异步拉取：映射表来自排行榜 RSC 载荷，会随官方更新而变化。
  // 有了它，消息层/网络层拿到的 UUID 才能还原成 gpt-6-astra-high 这样的真名。
  (async () => {
    try {
      const r = await refreshModelMap();
      if (state.hud) state.hud.log(`模型映射表已装载 ${r.loaded} 条`);
    } catch (e) {
      if (state.hud) state.hud.log(`映射表装载失败: ${e && e.message}`);
    }
  })();

  /* ---------------- 自动解析真实模型名（核心能力） ---------------- */
  // 流程：流里出现 public-access-token → 解出 run id → 轮询 run trace
  //       → 提取 ai.streamText.doStream span 的模型标签 → 回灌为最高权重证据。
  // 这样探针就能直接显示 qwen3.8-max-0902 这类真实模型名，而不只是"家族未知"。
  startAutoResolve({ initialDelayMs: 8000, maxMs: 180000, intervalMs: 6000 });

  BUS.on((evt) => {
    // ---- 第一环：接收流里下发的 token ----
    //
    // 实测踩过的坑：interceptor 会发出 'stream-header' 事件，但这里
    // 没有监听者，导致 token 流到 BUS 就断了，acceptToken 从未被调用，
    // 于是永远读不到 run trace，HUD 只能显示"模型家族未知"。
    if (evt.kind === 'stream-header') {
      const d = evt.data || {};
      const session = String(d.url || '').match(/\/sessions\/([^/]+)\/out/);
      const sessionId = session && session[1] ? session[1].toLowerCase() : null;
      const currentChatId = pickChatId(location.href);
      if (sessionId && sessionId !== currentChatId) return;
      try {
        if (acceptToken(d.name, d.value, d.turnId || null) && state.hud) {
          state.hud.log(`流头发现访问令牌: ${d.name}`);
        }
      } catch (e) {
        if (state.hud) state.hud.log(`令牌解析失败: ${e && e.message}`);
      }
      return;
    }

    if (!state.hud) return;

    if (evt.kind === 'run-token') {
      const d = evt.data || {};
      state.hud.log(`取得 run 令牌（runId=${d.runId || '?'}, 有效期 ${d.expiresInSec || '?'}s）`);
    }

    if (evt.kind === 'run-model') {
      const name = evt.data && evt.data.name;
      state.hud.log(`★ 真实模型名: ${name}`);
      // 把已验证的真名单独存档：这类名字（如 qwen-latest-series-invite-202608-m4）
      // 常不在公开目录里，指纹无法归类，但真名是确定的，必须原样记住。
      try {
        const r = recordRealModel(name, { runId: evt.data && evt.data.runId });
        if (r && r.kind === 'VERIFIED_NEW') {
          state.hud.log(`已存档真实模型名: ${name}`);
        }
      } catch { /* noop */ }
      // 关键：真实模型名到达时必须立刻重算并刷新 HUD。
      // 否则界面会停留在旧的「模型家族未知」上（实测踩过的坑）。
      recompute('run-model');
    }

    if (evt.kind === 'run-model-failed') {
      state.hud.log(`run trace 读取未得到模型名（${evt.data && evt.data.reason}）`);
    }
  });

  /* ---------------- 首帧快判（快速） ---------------- */
  BUS.on((evt) => {
    if (evt.kind === 'fast-verdict') {
      const d = evt.data;
      const v = quickVerdict(d);
      if (state.hud && (v.modelId || v.family)) {
        state.hud.log(`首帧命中: ${v.modelId || v.family}`);
        recompute('fast');
      }
    }
    if (evt.kind === 'evidence' && state.hud) {
      const e = evt.data;
      if (e.modelId && e.source !== 'sse.chunk.model') {
        state.hud.log(`证据 ${e.source}: ${e.modelId}`);
      }
    }
    if (evt.kind === 'observation') {
      state.lastObservation = evt.data;
      recompute('observation');
    }
  });

  /* ---------------- 完整判定 + 建档 ---------------- */
  function recompute(trigger) {
    // 先把 UUID 形态的 modelId 还原成真实模型名（揭示机制），
    // 再把还原结果纳入证据链 —— 这一步决定了能否给出「具体版本号」。
    try {
      const n = resolveEvidence(BUS.evidence);
      if (n && state.hud) state.hud.log(`UUID 还原 ${n} 个模型名`);
    } catch { /* noop */ }

    const evidence = BUS.evidence.filter(e => !e.stale);
    let verdict = classify(evidence);

    // ---- 真实模型名优先：只要 run trace 给了名字，就直接作为结论 ----
    //
    // 为什么需要这层兜底：classify 依赖证据链融合，若新名字不在注册表里
    // （如 qwen-latest-series-invite-202608-m4），融合结果会给出
    // RESOLVED 但 family/label 为空，HUD 仍显示"未知"。
    // 真实模型名由 worker 直接写入 run，权威性最高，应当无条件展示。
    const rs = runState();
    if (rs.modelName) {
      const matched = classify([{ source: 'run.trace.model', weight: 1.0, modelId: rs.modelName }]);
      verdict = {
        ...matched,
        mode: 'RESOLVED',
        modelId: rs.modelName,
        label: matched.label || rs.modelName,     // 未归类时直接显示名字
        confidence: Math.max(verdict.confidence || 0, 0.96),
        note: matched.family
          ? `真实模型名来自 Trigger.dev run trace（worker 写入）`
          : `真实模型名来自 Trigger.dev run trace；该名称未收录于本地注册表，已按原样显示`,
        source: 'run.trace.model',
        realName: true,
        evidence: [
          { source: 'run.trace.model', detail: `run ${rs.runId || '?'} 的 streamText span 标签` },
          ...(verdict.evidence || []).slice(0, 5),
        ],
      };
    }

    state.lastVerdict = verdict;
    state.slots = splitBySlot(evidence);

    let learnedSummary = null;
    if (cfg.learn && state.lastObservation) {
      const obsEv = evidence.filter(e => {
        if (!state.lastObservation.url) return true;
        return e.url === state.lastObservation.url;
      });
      try {
        const lv = learnFromObservation(state.lastObservation, obsEv);
        if (state.hud && lv && lv.kind === 'NEW_MODEL') {
          state.hud.log(`⚠ 发现未建档模型: ${lv.entry.resolved}（已写入指纹库）`);
        }
      } catch { /* noop */ }
      learnedSummary = summarizeLearned();
    }

    let tokenizer = null;
    if (state.lastObservation && state.lastObservation.promptTokens) {
      tokenizer = matchTokenizer(state.lastObservation.promptTokens);
    }

    // 主动探针：对响应文本跑 canary 判定，作为家族级旁证
    if (state.lastObservation && state.lastObservation.text) {
      const cand = runCanaries(state.lastObservation.text);
      for (const c of cand) {
        if (c.family || c.weight >= 0.3) {
          BUS.evidence.push({ ...c, source: c.source, url: state.lastObservation.url, t: performance.now() });
        }
      }
    }

    if (state.hud) {
      const lastH = rs.modelHistory[rs.modelHistory.length - 1] || {};
      state.hud.render(verdict, {
        observation: state.lastObservation,
        learnedSummary,
        tokenizer,
        slots: state.slots,
        realModel: rs.modelName
          ? { name: rs.modelName, runId: rs.runId, tokens: lastH.tokens, all: lastH.all, arenaName: rs.arenaName }
          : null,
        runInfo: rs.runId ? { runId: rs.runId, reason: rs.staleTurn ? 'no-token-this-turn（档位待定）' : rs.lastError } : null,
      });
    }
    return verdict;
  }

  function quickVerdict(d) {
    const evidence = BUS.evidence.filter(e => e.url === d.url || e.modelId);
    return classify(evidence);
  }

  /* ---------------- 定时回填匿名簇命名 ---------------- */
  if (cfg.autoBackfillMs > 0) {
    setInterval(() => {
      if (window.__MODEL_PROBE_PAUSED__) return; // 后台空闲标签不做定时回填
      const n = backfillNames();
      if (n && state.hud) state.hud.log(`回填 ${n} 条匿名簇命名`);
    }, cfg.autoBackfillMs);
  }

  // 暴露 API 给控制台/自动化
  const api = {
    version: VERSION,
    bus: BUS,
    hud: state.hud,
    state,
    beginTurn,
    beginTurnInfo,
    snapshotTurn,
    endTurn,
    classify: () => classify(BUS.evidence),
    observations: () => BUS.observations,
    learned: () => listLearned(),
    export: () => exportLearned(),
    probePack: () => buildProbePack(),
    canaries: (text) => runCanaries(text),
    reset: () => { BUS.evidence.length = 0; BUS.observations.length = 0; recompute('reset'); },

    // ---- UUID → 模型名（揭示机制）----
    /** 重新拉取映射表（官方更新模型后调用） */
    refreshMap: () => refreshModelMap(),
    /** 直接查一个 UUID */
    resolve: (id) => resolveModelId(id),
    /** 映射表统计 */
    mapStats: () => mapStats(),
    /** 手动把证据里的 UUID 全量还原 */
    resolveEvidence: () => resolveEvidence(BUS.evidence),
    /** 判断是否 UUID */
    isUuid,

    // ---- 真实模型名（Trigger.dev run trace）----
    /** 当前 run 状态（token / runId / 已解析出的模型名 / 历史） */
    runState: () => runState(),
    /** 手动触发一次 trace 读取 */
    fetchRunModels: (opts) => fetchRunModels(opts),
    /** 轮询直到拿到模型名 */
    pollRunModels: (opts) => pollRunModels(opts),
    /** 从 trace 文本提取模型标签（离线可用） */
    extractFromTrace: (text) => extractModelLabels(text),
    /** 当前真实模型名（最常需要的接口；供应商 id，无档位） */
    realModel: () => runState().modelName,
    /** Arena 内部模型名（含 -low/-high/-xhigh/-max 等档位后缀；回合结束 span 未提供时为 null） */
    arenaModel: () => runState().arenaName,
    /** 账号额度（spend.recorded span：tier / usd / remainingUsd / chargedUsd / overLimit / windowStartMs / at） */
    allowance: () => runState().allowance,
    /** 手动喂入 token（调试用） */
    acceptToken: (name, value) => acceptToken(name, value),
    /** 已存档的真实模型名列表 */
    realModels: () => listRealModels(),
    /** 手动记录一个真实模型名 */
    recordRealModel: (name, meta) => recordRealModel(name, meta),

    // ---- 前台/后台节流（宿主调用）----
    /** 暂停/恢复逐帧扫描与定时回填；暂停期间已有证据保留，不清空。 */
    setActive: (on) => {
      try { window.__MODEL_PROBE_PAUSED__ = !on; } catch { /* noop */ }
      return !window.__MODEL_PROBE_PAUSED__;
    },
    /** 当前是否处于活动(未暂停)状态 */
    isActive: () => !window.__MODEL_PROBE_PAUSED__,
  };
  try { window.__MODEL_PROBE__ = api; } catch { /* noop */ }
  return api;
}

function splitBySlot(evidence) {
  const out = {};
  for (const e of evidence) {
    if (!e.slot) continue;
    const s = e.slot;
    out[s] = out[s] || { evidence: [] };
    out[s].evidence.push(e);
  }
  for (const s of Object.keys(out)) {
    const v = classify(out[s].evidence);
    out[s] = { modelId: v.modelId, label: v.label, family: v.family, gen: v.gen, confidence: v.confidence, mode: v.mode };
  }
  return out;
}

function summarizeLearned() {
  const all = listLearned();
  return {
    total: all.length,
    unseen: all.filter(e => e.status === 'UNSEEN').length,
    anon: all.filter(e => e.status === 'ANON_CLUSTER').length,
  };
}

function buildDump(state) {
  return {
    probe: 'arena-model-probe',
    version: VERSION,
    at: new Date().toISOString(),
    href: location.href,
    verdict: state.lastVerdict,
    slots: state.slots,
    observation: state.lastObservation
      ? { ...state.lastObservation, text: (state.lastObservation.text || '').slice(0, 4000) }
      : null,
    evidence: BUS.evidence.slice(-120).map(e => ({
      source: e.source, weight: e.weight, modelId: e.modelId,
      family: e.family, detail: e.detail, url: e.url, slot: e.slot,
    })),
  };
}

function copy(text) {
  try { navigator.clipboard.writeText(text); } catch { /* noop */ }
}

// 自动启动。
//
// 版本感知：若页面里已存在【不同版本】的探针实例，说明代码已更新，
// 此时不要因为 BOOTED 标记就跳过——否则改了探针但页面仍跑旧版
// （实测踩过：新增的协议指纹一直不生效，因为跑的是旧注入）。
if (typeof window !== 'undefined') {
  const prevBooted = window.__MODEL_PROBE_BOOTED__;
  const prevVersion = (typeof window.__MODEL_PROBE__ === 'object' && window.__MODEL_PROBE__)
    ? window.__MODEL_PROBE__.version : null;

  // 同版本重复注入 → 直接跳过，避免叠加监听
  if (prevBooted === VERSION && prevVersion === VERSION) {
    // no-op：已是最新版本
  } else {
    if (prevBooted && prevBooted !== VERSION) {
      // 旧版本实例：挪到备用全局名，不销毁它的 DOM（销毁会干扰 React 状态）
      try {
        if (window.__MODEL_PROBE__) window.__MODEL_PROBE_OLD__ = window.__MODEL_PROBE__;
      } catch { /* noop */ }
      try {
        const old = document.getElementById('amp-hud');
        if (old) old.remove();
      } catch { /* noop */ }
    }
    const start = () => {
      window.__MODEL_PROBE_BOOTED__ = VERSION;
      // 宿主（如 WebView2 外壳）可以在注入前设置 window.__MODEL_PROBE_OPTIONS__
      // 来定制启动选项，最常见的是 {showHUD:false}：宿主自己展示模型信息时，
      // 不希望探针的悬浮面板盖在页面上挡点击。不设置则保持原有行为。
      const opts = (typeof window !== 'undefined' && window.__MODEL_PROBE_OPTIONS__) || {};
      boot(opts);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
}

  exp.VERSION = VERSION;
  exp.boot = boot;
} };
  try { __req("main"); }
  catch (e) { console.error("[amp] boot failed:", e); }
})();
