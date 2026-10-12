import { describe, expect, it } from 'vitest';
import { created, isRootRoute, route, stableRouteRead } from '../utils/arena-route';
import { buildTitle, displayModel, familyDisplayFromProbe, matchesTarget } from '../utils/titles';
import { interpretPulse, mergeQuota } from '../utils/quota';
import { normalizeSettings, validateSettings, DEFAULT_PROMPT, preparePromptForSend } from '../utils/settings';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('arena route', () => {
  it('accepts only official agent/work routes', () => {
    expect(route('https://arena.ai/work')).toBe('https://arena.ai/work');
    expect(route('https://arena.ai/agent/')).toBe('https://arena.ai/agent');
    expect(route(`https://arena.ai/work/${ID.toUpperCase()}?x=1`)).toBe(`https://arena.ai/work/${ID}`);
    expect(route('https://arena.ai/')).toBeNull();
    expect(route('http://arena.ai/work')).toBeNull();
    expect(route('https://arena.ai:8443/work')).toBeNull();
    expect(route('https://evil.arena.ai/work')).toBeNull();
    expect(route('https://arena.ai/work/not-a-uuid')).toBeNull();
  });
  it('distinguishes created conversations from root pages', () => {
    expect(created(`https://arena.ai/agent/${ID}`)).toBe(`https://arena.ai/agent/${ID}`);
    expect(created('https://arena.ai/agent')).toBeNull();
    expect(isRootRoute('https://arena.ai/work')).toBe(true);
  });
  it('requires a stable read', () => {
    const c = `https://arena.ai/work/${ID}`;
    expect(stableRouteRead(c, c, c)).toBe(true);
    expect(stableRouteRead('https://arena.ai/agent', 'https://arena.ai/work', 'https://arena.ai/work')).toBe(true);
    expect(stableRouteRead('https://arena.ai/work', c, 'https://arena.ai/work')).toBe(false);
  });
});

describe('titles', () => {
  it('matches the desktop title format', () => {
    expect(buildTitle('GPT 家族（推测）', '10-03 16:30')).toBe('GPT · 10-03 16:30');
    expect(buildTitle('gpt-6-sol-high', '10-03 16:30')).toBe('gpt-6-sol-high · 10-03 16:30');
    expect(buildTitle('', '')).toBe('未识别');
    expect(buildTitle('Model（指纹推测）', '10-03 16:30')).toBe('Model（指纹推测） · 10-03 16:30');
    expect(buildTitle('x'.repeat(200) + '（指纹推测）', '10-03 16:30')).toContain('（指纹推测）');
    expect([...buildTitle('x'.repeat(200), '10-03 16:30')].length).toBe(100);
  });
  it('labels pending tiers and families', () => {
    expect(displayModel('gpt-6-luna', true)).toBe('gpt-6-luna（档位待定）');
    expect(familyDisplayFromProbe('Claude')).toBe('Claude 家族（推测）');
    expect(familyDisplayFromProbe('unknown')).toBeNull();
  });
  it('matches target keywords', () => {
    expect(matchesTarget('claude-opus-5-max', 'gpt-6, Claude-Opus')).toBe(true);
    expect(matchesTarget('gemini-3.8-pro', 'gpt-6，claude')).toBe(false);
    expect(matchesTarget('anything', '  ')).toBe(false);
  });
});

describe('quota', () => {
  it('interprets pulse responses like the desktop app', () => {
    expect(interpretPulse({ status: 200, pulse: 42.6, refreshedAt: null })).toEqual({ pulse: 43, refreshedAt: null });
    expect(interpretPulse({ status: 200, pulse: 140, refreshedAt: null })).toEqual({ error: '额度数据无效' });
    expect(interpretPulse({ status: 401, pulse: null, refreshedAt: null })).toEqual({ error: '未登录，无法查询额度' });
    expect(interpretPulse({ status: 429, pulse: null, refreshedAt: null })).toEqual({ error: '查询过于频繁，稍后重试' });
  });
  it('keeps the last good value on failure', () => {
    const ok = mergeQuota(null, { status: 200, pulse: 80, refreshedAt: 'x' }, 'page', null, 1000);
    const bad = mergeQuota(ok, { status: 0, pulse: null, refreshedAt: null }, 'page', null, 2000);
    expect(bad.pulse).toBe(80);
    expect(bad.checkedAt).toBe(1000);
    expect(bad.error).toBe('网络请求失败');
  });
});

describe('settings', () => {
  it('uses the desktop default prompt and clamps values', () => {
    const s = normalizeSettings({ limit: -3, modelWaitSeconds: 9999 });
    expect(s.prompt).toBe(DEFAULT_PROMPT);
    expect(s.limit).toBe(0);
    expect(s.modelWaitSeconds).toBe(600);
    expect(validateSettings(normalizeSettings({ prompt: '  ' }))).not.toBeNull();
  });

  it('replaces each missing-file marker with one ten-letter filename per send', () => {
    let calls = 0;
    const prompt = preparePromptForSend('read nonexistent.txt and nonexistent.txt', () => { calls++; return 0.05; });
    expect(prompt).toBe('read bbbbbbbbbb.txt and bbbbbbbbbb.txt');
    expect(calls).toBe(10);
    expect(preparePromptForSend('custom prompt', () => 0)).toBe('custom prompt');
  });
});
