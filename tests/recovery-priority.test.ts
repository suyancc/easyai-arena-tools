import { annotateToolFamily } from '../utils/fingerprint/annotate';
import { describe, expect, it, vi } from 'vitest';
import { readFamilyUnlessFingerprint } from '../utils/fingerprint/recovery-priority';
const candidate = { kind: 'done' as const, model: 'glm-5.3（指纹推测）', provider: null, note: 'candidate' };
describe('refresh fingerprint-first priority', () => {
  it.each(['new score', 'cached score'])('%s suppresses vendor reading completely', async () => {
    const read = vi.fn(async () => ({ family: 'DeepSeek' }));
    expect(await readFamilyUnlessFingerprint(candidate, () => true, read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
  it.each([null, { ...candidate, model: '指纹样本不足' }, { ...candidate, model: '模型家族未知' }])('reads vendor when no usable fingerprint exists: %j', async result => {
    const read = vi.fn(async () => ({ family: 'DeepSeek' }));
    expect(await readFamilyUnlessFingerprint(result, () => true, read)).toEqual({ family: 'DeepSeek' });
    expect(read).toHaveBeenCalledOnce();
  });
  it('does not read after cancellation or a route change', async () => {
    const read = vi.fn(); expect(await readFamilyUnlessFingerprint(null, () => false, read)).toBeNull(); expect(read).not.toHaveBeenCalled();
  });
  it('discards a vendor response when a task starts during the read', async () => {
    let active = true;
    expect(await readFamilyUnlessFingerprint(null, () => active, async () => { active = false; return { family: 'DeepSeek' }; })).toBeNull();
  });
});


it('fingerprint priority prevents both vendor reading and vendor renaming', async () => {
  const rename = vi.fn(), read = vi.fn(async () => ({ family: 'qwen/glm' }));
  const family = await readFamilyUnlessFingerprint(candidate, () => true, read);
  if (family) await annotateToolFamily(family.family, 'https://arena.ai/work/test', { active: () => true, rename, say: vi.fn() });
  expect(read).not.toHaveBeenCalled(); expect(rename).not.toHaveBeenCalled();
});
