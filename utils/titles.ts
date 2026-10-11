/** 会话备注标题与模型显示名（移植自 automation/rename.rs、probe.rs）。 */

/** `<模型名> · MM-dd HH:mm`；Arena 名称上限 100 字符，只截断模型段。 */
export function buildTitle(model: string, stamp: string): string {
  let name = model.trim();
  // A concrete fingerprint candidate must never lose its uncertainty marker.
  const inference = name.endsWith('（指纹推测）') ? '（指纹推测）' : '';
  for (const suffix of ['（指纹推测）', '（推测）']) {
    while (name.endsWith(suffix)) name = name.slice(0, -suffix.length);
  }
  name = name.trimEnd();
  if (name.endsWith(' 家族')) name = name.slice(0, -' 家族'.length);
  if (!name) name = '未识别';
  const suffix = inference + (stamp ? ` · ${stamp}` : '');
  const budget = Math.max(1, 100 - [...suffix].length);
  const chars = [...name];
  if (chars.length > budget) name = chars.slice(0, budget).join('');
  return name + suffix;
}

/** 档位未确认时明示「档位待定」，不猜档位后缀。 */
export function displayModel(name: string, tierPending: boolean): string {
  return tierPending && name.trim() ? `${name}（档位待定）` : name;
}

const FAMILY_LABELS: Array<[string[], string]> = [
  [['openai', 'gpt', 'chatgpt'], 'GPT 家族（推测）'],
  [['anthropic', 'claude'], 'Claude 家族（推测）'],
  [['google', 'gemini'], 'Gemini 家族（推测）'],
  [['xai', 'grok'], 'Grok 家族（推测）'],
  [['deepseek'], 'DeepSeek 家族（推测）'],
  [['qwen', 'alibaba'], 'Qwen 家族（推测）'],
  [['qwen / glm', 'qwen/glm'], 'Qwen / GLM 家族（推测）'],
  [['moonshot', 'kimi'], 'Kimi 家族（推测）'],
  [['zhipu', 'glm'], 'GLM 家族（推测）'],
  [['minimax'], 'MiniMax 家族（推测）'],
  [['bytedance', 'doubao', 'seed', 'seedream', 'seedance'], '字节模型家族（推测）'],
  [['tencent', 'hunyuan'], '混元家族（推测）'],
  [['baidu', 'ernie'], '文心家族（推测）'],
  [['stepfun', 'step'], 'StepFun 家族（推测）'],
  [['mistral'], 'Mistral 家族（推测）'],
  [['meta', 'llama'], 'Llama 家族（推测）'],
  [['cohere'], 'Cohere 家族（推测）'],
  [['amazon', 'nova'], 'Amazon Nova 家族（推测）'],
  [['nvidia'], 'NVIDIA 家族（推测）'],
];

/** 探针家族代号 → 界面显示名；未知家族返回 null。 */
export function familyDisplayFromProbe(value: string | null | undefined): string | null {
  const key = (value ?? '').trim().toLowerCase();
  if (!key) return null;
  for (const [keys, label] of FAMILY_LABELS) if (keys.includes(key)) return label;
  return null;
}

/** 只保留可安全显示的 run trace 错误标签。 */
export function safeTraceErrorTag(error: string | null | undefined): string | null {
  if (!error) return null;
  if (/^http-\d+$/.test(error)) return error;
  return ['no-token', 'token-expired', 'timeout', 'stale-request', 'no-token-this-turn'].includes(error) ? error : 'other';
}

/** 模型名是否命中用户设置的目标关键词（逗号/换行分隔，任一命中即可，忽略大小写）。 */
export function matchesTarget(model: string, targets: string): boolean {
  const name = model.toLowerCase();
  return targets
    .split(/[,，\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .some((t) => name.includes(t));
}
