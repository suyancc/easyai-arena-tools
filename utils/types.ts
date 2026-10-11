import type { Family } from './fingerprint/types';

/** 页面桥接脚本 __arenaCompanion.read() 的返回（字段名与 page_bridge.js 一致）。 */
export interface PageView {
  url: string;
  main: boolean;
  conversation: boolean;
  promptConfirmed: boolean;
  generating: boolean;
  activity: boolean;
  failed: boolean;
  response: boolean;
  responseSignature?: string | null;
  progressSignature?: string | null;
  completionConfirmed: boolean;
  /** Captured outgoing input ID is bound to this network answer; never derived from DOM text. */
  fingerprintInputBound?: boolean;
  draft?: string | null;
  editor: boolean;
  /** A verified review panel may temporarily replace the editor. */
  reviewChoiceReady?: boolean;
  blocker?: string | null;
  termsPending: boolean;
  sendReady: boolean;
  newLinks: number;
  canExpand: boolean;
  attachmentNames?: string[];
  generationStamp?: string;
  /** 由内容脚本根据读取前后的 URL 计算，见 stableRouteRead。 */
  allowed: boolean;
}

export interface ProbeSnapshot {
  api: boolean;
  name?: string | null;
  providerName?: string | null;
  runId?: string | null;
  lastError?: string | null;
  allowance?: Allowance | null;
  tierPending?: boolean | null;
}

export interface TurnProbe {
  api: boolean;
  turnId?: string | null;
  mode?: string | null;
  family?: string | null;
  modelId?: string | null;
  providerName?: string | null;
  arenaName?: string | null;
  runId?: string | null;
  captureBound: boolean;
  routeMatched?: boolean | null;
  evidenceCount?: number;
  familySource?: string | null;
  familyConflict: boolean;
}

export interface ProbeTurnStart {
  ok: boolean;
  reason?: string | null;
  chatBound?: boolean;
}

/** 账号额度（美元口径，来自探针读取的 spend.recorded span）。 */
export interface Allowance {
  tier?: string | null;
  usd?: number | null;
  remainingUsd?: number | null;
  chargedUsd?: number | null;
  overLimit?: boolean | null;
  windowStartMs?: number | null;
  source?: string | null;
  at?: number | null;
}

export interface QuotaView {
  /** 剩余额度百分比 0–100（最近一次成功值）。 */
  pulse: number | null;
  refreshedAt: string | null;
  /** 最近一次成功查询时间（毫秒）。 */
  checkedAt: number | null;
  error: string | null;
  allowance: Allowance | null;
  source: 'page' | 'direct' | null;
}

export type Phase =
  | 'idle'
  | 'inspect'
  | 'new'
  | 'waitNew'
  | 'fill'
  | 'send'
  | 'observe'
  | 'model'
  | 'rename'
  | 'roundPause';

export interface DrawSettings {
  prompt: string;
  /** 轮数上限，0 = 不限。 */
  limit: number;
  /** 回答长时间无变化即停止（秒）。 */
  noProgressSeconds: number;
  /** 回答完成后等待官方型号的最长时间（秒）。 */
  modelWaitSeconds: number;
  /** 只拿到家族级推测时，再等多少秒官方型号后就采用家族结果。 */
  familyWaitSeconds: number;
  /** 两轮之间的间隔（秒）。 */
  roundPauseSeconds: number;
  /** 抽到包含任一关键词的模型时自动停止（逗号或换行分隔，留空不启用）。 */
  targetKeywords: string;
  /** 每轮把模型名备注到侧栏会话标题。 */
  autoRename: boolean;
  fingerprintFamilies: Family[];
  fingerprintEveryTurn: boolean;
}

export interface RoundRecord {
  /** Digest only: no raw fingerprint answers persisted. */
  fingerprintKey?: string;
  kind?: 'draw' | 'fingerprint';
  round: number;
  model: string;
  provider: string | null;
  conversation: string | null;
  note: string | null;
  at: number;
  hit: boolean;
}

export interface DrawState {
  running: boolean;
  /** 正在执行手动操作（鹈鹕测试）。 */
  manual: boolean;
  manualKind?: 'fingerprint' | 'pelican' | null;
  phase: Phase;
  message: string;
  rounds: number;
  limit: number;
  model: string | null;
  lastStop: string | null;
  history: RoundRecord[];
  url: string;
  probeReady: boolean;
}

/** 侧边栏 → 内容脚本 的请求。 */
export type ContentRequest =
  | { type: 'state:get' }
  | { type: 'draw:start'; settings: DrawSettings }
  | { type: 'draw:stop' }
  | { type: 'fingerprint:check' }
  | { type: 'fingerprint:start'; turnId: string }
  | { type: 'fingerprint:stop' }
  | { type: 'pelican:send' }
  | { type: 'quota:query' }
  | { type: 'history:clear' };

/** 内容脚本 → 扩展页面 的广播。 */
export type BroadcastMessage =
  | { type: 'arena:state'; state: DrawState }
  | { type: 'arena:quota'; quota: QuotaView };

export type BackgroundRequest = { type: 'quota:direct' };

export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };
