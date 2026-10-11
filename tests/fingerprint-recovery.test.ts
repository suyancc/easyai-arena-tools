import { annotateFingerprint } from '../utils/fingerprint/annotate';
import { describe, expect, it, vi } from 'vitest';
import { generateChallenges, recognizeChallenge } from '../utils/fingerprint/challenges';
import { inspectHistory, historyKey, recoverFingerprint, type FingerprintHistory, type RecoveryPorts } from '../utils/fingerprint/recovery';
import { outcomeResult } from '../utils/fingerprint/result';
import type { PageView } from '../utils/types';
const route = 'https://arena.ai/work/0f8fad5b-d9cb-469f-a165-70867728950e';
const challenges = generateChallenges(() => 0);
function history(): FingerprintHistory { return { complete: true, failed: false, signature: 'last-signature', pairs: challenges.map((c, i) => ({ input: 'user-' + i, answer: 'answer-' + i, prompt: c.prompt, text: '1 '.repeat(300 + i), complete: true, failed: false, oversize: false })) }; }
function fixture() {
  let h = history(), active = true;
  const page = { allowed: true, url: route, main: true, conversation: true, promptConfirmed: true, response: true, generating: false, activity: false, failed: false, responseSignature: h.signature, draft: '' } as PageView;
  const ports: RecoveryPorts = {
    active: () => active, history: vi.fn(async () => h), page: vi.fn(async () => page), known: vi.fn(async () => null),
    service: { prepare: vi.fn(), score: vi.fn(async () => ({ kind: 'candidate' as const, candidate: { modelId: 'qwen-example', displayName: 'Qwen Example', family: null }, diagnostics: { numberCounts: [300, 301, 302], minimumCounts: [161, 162, 162], ranking: [{ modelId: 'qwen-example', displayName: 'Qwen Example', catalogFamily: 'qwen', score: 1.23 }] } })) },
    save: vi.fn(async () => {}), show: vi.fn(), say: vi.fn(),
  };
  return { ports, page, h, cancel: () => { active = false; }, set: (v: FingerprintHistory) => { h = v; } };
}
describe('fingerprint result is the global top, not a family gate', () => {
  it.each([null, 'openai', 'anthropic', 'google'] as const)('keeps an unmapped vendor top with target %s', target => {
    const r = outcomeResult({ kind: 'candidate' as const, candidate: { modelId: 'qwen-example', displayName: 'Qwen Example', family: null } }, target);
    expect(r.model).toBe('Qwen Example（指纹推测）'); expect(r.note).not.toContain('不显示');
  });
  it('does not fabricate a winner from insufficient samples', () => {
    expect(outcomeResult({ kind: 'insufficient', validAnswers: 2 }, null).model).toBe('指纹样本不足');
  });
});
describe('read-only three-answer recovery after refresh', () => {
  it('recognizes all exact language templates but not lookalike ordinary messages', () => {
    for (let language = 0; language < 5; language++) {
      let n = 0;
      for (const c of generateChallenges(() => ++n % 2 ? 0 : language)) expect(recognizeChallenge(c.prompt)).toEqual(c);
    }
    expect(recognizeChallenge('Give me 300 numbers 1 to 355')).toBeNull();
    expect(recognizeChallenge(challenges[0]!.prompt + ' extra')).toBeNull();
  });
  it('scores existing three replies once with no send/fill interface', async () => {
    const f = fixture();
    expect(await recoverFingerprint(route, f.ports)).toBe('scored');
    expect(f.ports.service.score).toHaveBeenCalledOnce();
    expect(f.ports.show).toHaveBeenCalledWith(expect.objectContaining({ model: 'Qwen Example（指纹推测）', note: expect.stringContaining('300 / 301 / 302') }));
    expect(f.ports.save).toHaveBeenCalledOnce(); expect(f.ports.service.prepare).not.toHaveBeenCalled();
    // Do not leak sample text via status strings or persisted results.
    expect(JSON.stringify(vi.mocked(f.ports.save).mock.calls)).not.toContain('1 1 1 1');
  });
  it('restores saved result without recalculating on another refresh', async () => {
    const f = fixture(); f.ports.known = vi.fn(async () => ({ kind: 'done' as const, model: 'Saved', provider: null, note: 'saved note' }));
    expect(await recoverFingerprint(route, f.ports)).toBe('restored');
    expect(f.ports.service.score).not.toHaveBeenCalled(); expect(f.ports.save).not.toHaveBeenCalled();
  });
  it('waits for the final already-sent answer, never resends', async () => {
    const f = fixture(); f.h.complete = false; f.h.pairs[2]!.complete = false;
    expect(await recoverFingerprint(route, f.ports)).toBe('waiting'); expect(f.ports.service.score).not.toHaveBeenCalled();
    f.h.complete = true; f.h.pairs[2]!.complete = true;
    expect(await recoverFingerprint(route, f.ports)).toBe('scored');
  });
  it('rejects incomplete sets, intervening normal prompts, duplicate IDs and oversize text', () => {
    const h = history(); h.pairs.pop(); expect(inspectHistory(h).status).toBe('none');
    const n = history(); n.pairs[1]!.prompt = 'ordinary prompt'; expect(inspectHistory(n).status).toBe('none');
    const d = history(); d.pairs[1]!.input = d.pairs[0]!.input; expect(inspectHistory(d).status).toBe('invalid');
    const o = history(); o.pairs[0]!.oversize = true; expect(inspectHistory(o).status).toBe('invalid');
    const e = history(); e.pairs[0]!.failed = true; expect(inspectHistory(e).status).toBe('invalid');
  });
  it('does not score a page with a draft or a different conversation', async () => {
    const f = fixture(); f.page.draft = 'user draft'; expect(await recoverFingerprint(route, f.ports)).toBe('waiting-page');
    f.page.draft = ''; f.page.url = route.replace('/work/', '/agent/'); expect(await recoverFingerprint(route, f.ports)).toBe('waiting-page');
    expect(f.ports.service.score).not.toHaveBeenCalled();
  });
  it('discards asynchronous scoring if any previous answer changes', async () => {
    const f = fixture(), score = f.ports.service.score;
    f.ports.service.score = async (...args) => { const r = await score(...args); f.h.pairs[0]!.text += ' 10'; return r; };
    expect(await recoverFingerprint(route, f.ports)).toBe('changed'); expect(f.ports.save).not.toHaveBeenCalled(); expect(f.ports.show).not.toHaveBeenCalled();
  });
  it('discards async result after user cancellation/new task', async () => {
    const f = fixture(), score = f.ports.service.score;
    f.ports.service.score = async (...args) => { const r = await score(...args); f.cancel(); return r; };
    expect(await recoverFingerprint(route, f.ports)).toBe('inactive'); expect(f.ports.save).not.toHaveBeenCalled();
  });
  it('keys are route scoped and bind all three answers without persisting raw samples', async () => {
    const h = history(), key = await historyKey(route, h);
    expect(key).toMatch(/^fp-recovery-v1:[0-9a-f]{64}$/);
    expect(await historyKey(route + '1', h)).not.toBe(key);
    h.pairs[0]!.text += ' 99'; expect(await historyKey(route, h)).not.toBe(key);
  });
});


describe('cached recovery completion includes conversation annotation', () => {
  it('annotates an old cached score without sending or recalculating', async () => {
    const f = fixture(), rename = vi.fn(async () => {}), say = vi.fn();
    f.ports.known = async () => ({ kind: 'done', model: 'glm-5.3（指纹推测）', provider: null, note: 'cached score' });
    f.ports.show = result => annotateFingerprint(result, route, { active: f.ports.active, rename, say });
    expect(await recoverFingerprint(route, f.ports)).toBe('restored');
    expect(f.ports.service.score).not.toHaveBeenCalled();
    expect(rename).toHaveBeenCalledWith(route, 'glm-5.3', expect.any(Function));
    expect(say).toHaveBeenLastCalledWith(expect.stringContaining('会话已备注'));
  });
});
