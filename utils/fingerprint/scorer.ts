/** Algorithm parity: crates/arena-model-fingerprint/src/scorer.rs (frozen ranker). */
import { minimumValid, parseNumbers } from './parser';
import { familyFrom, type Answer, type Detector, type Family, type FeatureBank, type FingerprintData, type Outcome, type Params, type ScoreBank } from './types';
type Pair = [number[], number[]];
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const mean = (a: number[]) => sum(a) / a.length;
function dot(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('评分向量维度不一致');
  let value = 0;
  for (let i = 0; i < a.length; i++) value += a[i]! * b[i]!;
  return value;
}
const normalize = (a: number[]) => { const s = Math.max(Math.sqrt(dot(a, a)), 1e-12); return a.map(x => x / s); };
const standardize = (a: number[]) => {
  const m = mean(a), s = Math.max(Math.sqrt(mean(a.map(x => (x - m) ** 2))), 1e-12);
  return a.map(x => (x - m) / s);
};
const columnMean = (rows: number[][]) => rows[0]!.map((_, i) => mean(rows.map(r => r[i]!)));
function features(numbers: number[]): Pair {
  const counts = Array<number>(355).fill(0);
  for (const n of numbers) counts[n - 1]!++;
  const total = sum(counts) + .5 * 355;
  const hellinger = counts.map(n => Math.sqrt((n + .5) / total));
  const ordered: number[] = [];
  const base = Math.floor(numbers.length / 4), remainder = numbers.length % 4;
  let start = 0;
  for (let block = 0; block < 4; block++) {
    const size = base + Number(block < remainder), bins = Array<number>(16).fill(.5);
    for (const value of numbers.slice(start, start + size)) bins[Math.min(15, Math.floor((value - 1) / 355 * 16))]!++;
    const t = sum(bins);
    ordered.push(...bins.map(x => Math.sqrt(x / t)));
    start += size;
  }
  const digits = Array<number>(10).fill(.5);
  for (const n of numbers) digits[n % 10]!++;
  const t = sum(digits);
  ordered.push(...digits.map(x => Math.sqrt(x / t)));
  return [hellinger, ordered];
}
function transform(f: Pair, p: Params[]): number[] {
  return f.flatMap((values, i) => {
    const params = p[i]!;
    const z = values.map((v, j) => (v - params.mean[j]!) / params.scale[j]!);
    return normalize(z).map(x => x * Math.sqrt(i === 0 ? .75 : .25));
  });
}
function subtractBasis(values: number[], basis: number[][]): number[] {
  const output = [...values];
  for (const vector of basis) {
    const projection = dot(output, vector);
    for (let i = 0; i < output.length; i++) output[i]! -= projection * vector[i]!;
  }
  return output;
}
const centered = (v: number[], bank: FeatureBank) => v.map((x, i) => (x - bank.feature_mean[i]!) / bank.feature_scale[i]!);
function baseline(f: Pair, bank: ScoreBank): number[] {
  const h = bank.hellinger, o = bank.ordered_blocks;
  const hp = normalize(subtractBasis(centered(f[0], h), h.nuisance_basis));
  const marginal = h.centroids.map(row => dot(hp, row));
  const oc = centered(f[1], o), raw = normalize(oc), projected = normalize(subtractBasis(oc, o.nuisance_basis));
  const templates = o.centroids.map((_, i) => Math.max(...o.environment_centroids.map(env => dot(raw, env[i]!))));
  const nuisance = o.centroids.map(c => dot(projected, c));
  const tz = standardize(templates), nz = standardize(nuisance);
  const oz = standardize(tz.map((x, i) => .5 * x + .5 * nz[i]!));
  return standardize(marginal).map((x, i) => .5 * x + .5 * oz[i]!);
}
function nearest(values: number[], refs: number[][]): number {
  if (!refs.length) throw new Error('参考样本为空');
  const norm = dot(values, values);
  const distances = refs.map(r => Math.max(0, norm + dot(r, r) - 2 * dot(values, r))).sort((a, b) => a - b);
  return mean(distances.slice(0, 7));
}
export const descendingOrder = (scores: number[]) => scores.map((_, i) => i).sort((a, b) => scores[b]! - scores[a]! || a - b);
export function rankSharedNumbers(numbers: number[][], detector: Detector): number[] {
  if (numbers.length !== 3) throw new Error('评分需要恰好三份回答');
  const r = detector.ranker, all = numbers.map(features), full = all.map(f => transform(f, r.full_params));
  const ldaRows = numbers.map(values => {
    const vector = transform(features(values.slice(0, 128)), r.head_params);
    return standardize(r.lda_weights.map((w, i) => dot(w, vector) + r.lda_bias[i]!));
  });
  const lda = standardize(columnMean(ldaRows));
  const near = standardize(r.references.map(refs => {
    const d = full.map(v => -nearest(v, refs)).sort((a, b) => a - b);
    return d[1]!; // median of exactly three samples
  }));
  const base = standardize(columnMean(all.map(f => baseline(f, r.bank))));
  const ranking = lda.map((x, i) => .5 * x + .25 * near[i]! + .25 * base[i]!);
  if (ranking.some(x => !Number.isFinite(x))) throw new Error('评分出现非有限数值');
  return ranking;
}
export function scoreThree(answers: Answer[], _target: Family | null, data: FingerprintData): Outcome {
  if (answers.length !== 3) throw new Error('评分需要恰好三份回答');
  const numbers = answers.map(a => parseNumbers(a.text));
  const validAnswers = numbers.filter((v, i) => v.length >= minimumValid(answers[i]!.expectedCount)).length;
  const diagnostics = { numberCounts: numbers.map(n => n.length), minimumCounts: answers.map(a => minimumValid(a.expectedCount)), ranking: [] as import('./types').RankedCandidate[] };
  if (validAnswers !== 3) return { kind: 'insufficient', validAnswers, diagnostics };
  const scores = rankSharedNumbers(numbers, data.detector);
  const order = descendingOrder(scores);
  diagnostics.ranking = order.slice(0, 3).map(i => {
    const m = data.catalog.models[i]!;
    return { modelId: m.id, displayName: m.display_name, catalogFamily: m.family, score: scores[i]! };
  });
  const top = data.catalog.models[order[0]!]!;
  const family = familyFrom(top.family);
  return { kind: 'candidate', candidate: { modelId: top.id, displayName: top.display_name, family }, diagnostics };
}
