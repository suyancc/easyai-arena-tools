import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateChallenges } from '../utils/fingerprint/challenges';
import { loadData, validateDimensions, SOURCE_COMMIT } from '../utils/fingerprint/data';
import { minimumValid, parseNumbers } from '../utils/fingerprint/parser';
import { descendingOrder, rankSharedNumbers, scoreThree } from '../utils/fingerprint/scorer';
import { createScoringService, validRequest, type ServiceRequest } from '../utils/fingerprint/service';
import { familyFrom, type Answer, type FingerprintData } from '../utils/fingerprint/types';
import { normalizeSettings } from '../utils/settings';
import { FamilyCandidateCache, outcomeResult } from '../utils/fingerprint/result';
import { fillFingerprintSettings, readFingerprintSettings } from '../entrypoints/sidepanel/fingerprint-settings';
const read = async (name: string) => new Uint8Array(await readFile(new URL(`../public/fingerprint/${name}`, import.meta.url))).buffer;
let data: FingerprintData;
let golden: { source_commit: string; outputs: { expected_count: number; text: string }[]; expected_model_ids: string[]; expected_top_family: string };
let answers: Answer[];
beforeAll(async () => {
  data = await loadData(read);
  golden = JSON.parse(await readFile(new URL('./fixtures/shared_detector_golden.json', import.meta.url), 'utf8'));
  answers = golden.outputs.map(a => ({ expectedCount: a.expected_count, text: a.text }));
}, 20_000);
describe('Rust fingerprint parity', () => {
  it('preserves the ENTIRE frozen golden ranking', () => {
    expect(golden.source_commit).toBe(SOURCE_COMMIT);
    const ranking = descendingOrder(rankSharedNumbers(answers.map(a => parseNumbers(a.text)), data.detector)).map(i => data.catalog.models[i]!.id);
    expect(ranking).toEqual(golden.expected_model_ids);
  });
  it('returns the global top regardless of target family', () => {
    const family = familyFrom(golden.expected_top_family)!;
    expect(scoreThree(answers, null, data)).toMatchObject({ kind: 'candidate', candidate: { modelId: golden.expected_model_ids[0], family } });
    expect(scoreThree(answers, family, data).kind).toBe('candidate');
    expect(scoreThree(answers, family === 'openai' ? 'anthropic' : 'openai', data)).toMatchObject({ kind: 'candidate', candidate: { modelId: golden.expected_model_ids[0], family } });
  });
  it('keeps the highest model even when its catalog vendor has no legacy family mapping', () => {
    const topId = golden.expected_model_ids[0];
    const extended = { ...data, catalog: { ...data.catalog, models: data.catalog.models.map(m => m.id === topId ? { ...m, family: 'qwen' } : m) } };
    const result = scoreThree(answers, 'openai', extended);
    expect(result).toMatchObject({ kind: 'candidate', candidate: { modelId: topId, family: null }, diagnostics: { numberCounts: expect.any(Array), ranking: [expect.objectContaining({ modelId: topId, catalogFamily: 'qwen' }), expect.any(Object), expect.any(Object)] } });
    expect(outcomeResult(result, 'openai').model).toContain(topId);
  });
  it('matches longest-run parsing, Unicode alphabetic boundaries and ties', () => {
    expect(parseNumbers('1, 2 alpha 3 4 355 356 7')).toEqual([3, 4, 355, 7]);
    expect(parseNumbers('第一组 1 2 文字 3 4')).toEqual([1, 2]);
    expect(parseNumbers('0001 000356 003')).toEqual([1, 3]);
    expect(parseNumbers('0 356 999999999999')).toEqual([]);
  });
  it('requires all three samples and the ceil boundary, counts UTF-8 bytes', () => {
    expect(minimumValid(292)).toBe(161);
    expect(scoreThree([{ expectedCount: 292, text: '1 '.repeat(160) }, ...answers.slice(1)], null, data)).toMatchObject({ kind: 'insufficient', validAnswers: 2 });
    expect(scoreThree([{ expectedCount: 292, text: '1 '.repeat(161) }, ...answers.slice(1)], null, data).kind).not.toBe('insufficient');
    expect(parseNumbers('中'.repeat(22000) + ' 1 2')).toEqual([]);
    expect(() => scoreThree(answers.slice(1), null, data)).toThrow();
  });
  it('generates three distinct counts and all five exact language templates', () => {
    for (let language = 0; language < 5; language++) {
      let picks = 0;
      const c = generateChallenges(() => (++picks % 2 ? 0 : language));
      expect(c.map(x => x.expectedCount)).toEqual([292, 293, 294]);
      expect(new Set(c.map(x => x.prompt)).size).toBe(3);
      expect(c.every(x => x.prompt.includes(String(x.expectedCount)) && x.prompt.includes('355'))).toBe(true);
    }
  });
  it('rejects corrupt assets before accepting a data model', async () => {
    await expect(loadData(async n => n === 'model_catalog.json' ? new TextEncoder().encode('{}').buffer : read(n))).rejects.toThrow();
    const catalog = { ...data.catalog, models: [...data.catalog.models].reverse() };
    expect(() => validateDimensions(data.detector, catalog)).toThrow();
    expect(() => validateDimensions({ ...data.detector, bank_built_at: 'wrong' }, data.catalog)).toThrow();
    const detector = { ...data.detector, ranker: { ...data.detector.ranker, lda_weights: [[1]] } };
    expect(() => validateDimensions(detector, data.catalog)).toThrow();
  });
});
describe('background boundary', () => {
  const route = 'https://arena.ai/work/0f8fad5b-d9cb-469f-a165-70867728950e';
  const sender = { id: 'extension', tab: { id: 1 }, frameId: 0, url: route };
  const prepare: ServiceRequest = { type: 'fingerprint:prepare', requestId: 'r1', route };
  it('accepts only own main-frame supported conversation and bounded answers', () => {
    expect(validRequest(prepare, sender, 'extension')).toBe(true);
    expect(validRequest(prepare, { ...sender, id: 'foreign' }, 'extension')).toBe(false);
    expect(validRequest(prepare, { ...sender, frameId: 1 }, 'extension')).toBe(false);
    expect(validRequest(prepare, { ...sender, tab: undefined }, 'extension')).toBe(false);
    expect(validRequest({ ...prepare, type: 'fingerprint:score', target: null, answers: answers.slice(1) }, sender, 'extension')).toBe(false);
    expect(validRequest(prepare, { ...sender, url: 'https://evil.example/' }, 'extension')).toBe(false);
    expect(validRequest({ ...prepare, type: 'fingerprint:score', target: null, answers: [{ expectedCount: 292, text: '中'.repeat(22000) }, ...answers.slice(1)] }, sender, 'extension')).toBe(false);
  });
  it('loads once, echoes request correlation and only returns candidate metadata', async () => {
    let reads = 0;
    const service = createScoringService(n => { reads++; return read(n); }, 'extension');
    expect(await service(prepare, sender)).toMatchObject({ ok: true, requestId: 'r1', data: null });
    const r = await service({ ...prepare, type: 'fingerprint:score', requestId: 'r2', target: null, answers }, sender);
    expect(r).toMatchObject({ ok: true, requestId: 'r2', data: { kind: 'candidate' } });
    expect(reads).toBe(3);
    expect(JSON.stringify(r)).not.toContain(answers[0]!.text);
  });
});
describe('settings and candidate semantics', () => {
  it('defaults disabled, sanitizes families and round-trips separate UI fields', () => {
    const s = normalizeSettings({});
    expect(s.fingerprintFamilies).toEqual([]); expect(s.fingerprintEveryTurn).toBe(false);
    const fields = Object.fromEntries(['fingerprint-openai', 'fingerprint-anthropic', 'fingerprint-google', 'fingerprintEveryTurn'].map(k => [k, { checked: false }]));
    const form = { elements: { namedItem: (k: string) => fields[k] } } as unknown as HTMLFormElement;
    const value = normalizeSettings({ fingerprintFamilies: ['google', 'openai', 'google'], fingerprintEveryTurn: true });
    fillFingerprintSettings(form, value);
    expect(readFingerprintSettings(form)).toEqual({ fingerprintFamilies: ['openai', 'google'], fingerprintEveryTurn: true });
  });
  it('invalidates cache on vendor change but displays the computed top for an unknown target', () => {
    const cache = new FamilyCandidateCache(); cache.remember('openai', 'X（指纹推测）');
    cache.observe('openai'); expect(cache.get('openai')).toBe('X（指纹推测）');
    cache.observe('google'); expect(cache.get('openai')).toBeNull();
    const result = outcomeResult({ kind: 'candidate', candidate: { family: 'openai', modelId: 'x', displayName: 'X' } }, null);
    expect(result.model).toBe('X（指纹推测）'); expect(result.note).toContain('不按厂商或家族过滤');
  });
});
