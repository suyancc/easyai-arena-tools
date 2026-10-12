import type { DrawSettings } from './types';
import { FAMILIES } from './fingerprint/types';

/** 抽模型默认每轮提示词（与桌面端 arena-core DEFAULT_PROMPT 保持一致）。 */
export const DEFAULT_PROMPT =
  '请先调用 read_file 读取 nonexistent.txt（忽略报错），然后用一句话回答：你的知识截止时间是哪年哪月？';

const PROMPT_FILENAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/** 每轮发送前为占位文件名生成新的 10 位小写字母名称。 */
export function preparePromptForSend(prompt: string, random: () => number = Math.random): string {
  if (!prompt.includes('nonexistent.txt')) return prompt;
  const letters = Array.from({ length: 10 }, () =>
    PROMPT_FILENAME_ALPHABET.charAt(Math.floor(random() * PROMPT_FILENAME_ALPHABET.length)),
  ).join('');
  return prompt.replaceAll('nonexistent.txt', `${letters}.txt`);
}

export const DEFAULT_SETTINGS: DrawSettings = {
  prompt: DEFAULT_PROMPT,
  limit: 20,
  noProgressSeconds: 300,
  modelWaitSeconds: 30,
  familyWaitSeconds: 8,
  roundPauseSeconds: 1,
  targetKeywords: '',
  autoRename: true,
  fingerprintFamilies: [],
  fingerprintEveryTurn: false,
};

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** 规范化并校验设置；返回错误文本或规范化后的设置。 */
export function normalizeSettings(input: Partial<DrawSettings> | null | undefined): DrawSettings {
  const s = { ...DEFAULT_SETTINGS, ...(input ?? {}) };
  return {
    prompt: String(s.prompt ?? '').trim(),
    limit: clampInt(s.limit, 0, 999, DEFAULT_SETTINGS.limit),
    noProgressSeconds: clampInt(s.noProgressSeconds, 60, 1800, DEFAULT_SETTINGS.noProgressSeconds),
    modelWaitSeconds: clampInt(s.modelWaitSeconds, 10, 600, DEFAULT_SETTINGS.modelWaitSeconds),
    familyWaitSeconds: clampInt(s.familyWaitSeconds, 3, 120, DEFAULT_SETTINGS.familyWaitSeconds),
    roundPauseSeconds: clampInt(s.roundPauseSeconds, 0, 60, DEFAULT_SETTINGS.roundPauseSeconds),
    targetKeywords: String(s.targetKeywords ?? '').slice(0, 500),
    autoRename: s.autoRename !== false,
    fingerprintFamilies: FAMILIES.filter(f => Array.isArray(s.fingerprintFamilies) && s.fingerprintFamilies.some(v => typeof v === 'string' && v.toLowerCase() === f)),
    fingerprintEveryTurn: s.fingerprintEveryTurn === true,
  };
}

export function validateSettings(s: DrawSettings): string | null {
  if (!s.prompt) return '请先设置每轮发送的提示词';
  if ([...s.prompt].length > 4000) return '提示词不能超过 4000 字';
  return null;
}
