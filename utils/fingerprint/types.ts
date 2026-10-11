/** Pure contracts. No browser, DOM, storage or logging dependencies. */
export const FAMILIES = ['openai', 'anthropic', 'google'] as const;
export type Family = (typeof FAMILIES)[number];
export const MAX_ANSWER_BYTES = 64 * 1024;
export interface Challenge { expectedCount: number; prompt: string }
export interface Answer { expectedCount: number; text: string }
export interface Candidate { modelId: string; displayName: string; family: Family | null }
export interface RankedCandidate { modelId: string; displayName: string; catalogFamily: string; score: number }
export interface ScoreDiagnostics { numberCounts: number[]; minimumCounts: number[]; ranking: RankedCandidate[] }
export type Outcome = (
  | { kind: 'candidate'; candidate: Candidate }
  | { kind: 'familyMismatch'; observedFamily: Family | null }
  | { kind: 'insufficient'; validAnswers: number }) & { diagnostics?: ScoreDiagnostics };
export interface FingerprintService {
  prepare(): Promise<void>;
  score(answers: Answer[], target: Family | null): Promise<Outcome>;
}
export interface Params { mean: number[]; scale: number[] }
export interface FeatureBank {
  feature_mean: number[]; feature_scale: number[]; nuisance_basis: number[][]; centroids: number[][];
}
export interface ScoreBank {
  hellinger: FeatureBank;
  ordered_blocks: FeatureBank & { environment_centroids: number[][][] };
}
export interface Detector {
  schema: string; bank_built_at: string; model_ids: string[]; response_counts: number[];
  ranker: {
    head_params: Params[]; full_params: Params[]; lda_weights: number[][]; lda_bias: number[];
    references: number[][][]; bank: ScoreBank;
  };
}
export interface Catalog {
  built_at: string;
  models: { id: string; display_name: string; family: string; response_count: number }[];
}
export interface FingerprintData { detector: Detector; catalog: Catalog }
export function familyFrom(value: unknown): Family | null {
  if (typeof value !== 'string') return null;
  switch (value.toLowerCase()) {
    case 'openai': case 'gpt': return 'openai';
    case 'anthropic': case 'claude': return 'anthropic';
    case 'google': case 'gemini': return 'google';
    default: return null;
  }
}
export function familyLabel(value: Family | null): string {
  return value ? `${({ openai: 'GPT', anthropic: 'Claude', google: 'Gemini' })[value]} 家族（推测）` : '模型家族未知';
}
