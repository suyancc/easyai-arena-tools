import { describe, expect, it, vi } from 'vitest';
import { annotateFingerprint, annotateToolFamily } from '../utils/fingerprint/annotate';
import { renameConversation } from '../utils/rename';
const target = 'https://arena.ai/work/0f8fad5b-d9cb-469f-a165-70867728950e';
const result = { kind: 'done' as const, model: 'glm-5.3（指纹推测）', provider: null, note: '评分完成' };
describe('fingerprint completion annotates conversation', () => {
  it('renames to the top model, including an unmapped vendor', async () => {
    const rename = vi.fn(async () => {}), say = vi.fn();
    await annotateFingerprint(result, target, { active: () => true, rename, say });
    expect(rename).toHaveBeenCalledWith(target, 'glm-5.3', expect.any(Function));
    expect(say).toHaveBeenLastCalledWith(expect.stringContaining('会话已备注'));
  });
  it('waits for rename confirmation before reporting success', async () => {
    let done!: () => void; const say = vi.fn();
    const promise = annotateFingerprint(result, target, { active: () => true, say, rename: () => new Promise<void>(resolve => { done = resolve; }) });
    expect(say).not.toHaveBeenCalledWith(expect.stringContaining('会话已备注'));
    done(); await promise; expect(say).toHaveBeenLastCalledWith(expect.stringContaining('会话已备注'));
  });
  it('keeps computed result and reports a separate rename failure', async () => {
    const say = vi.fn(); await annotateFingerprint(result, target, { active: () => true, say, rename: async () => { throw new Error('timeout'); } });
    expect(say).toHaveBeenLastCalledWith(expect.stringContaining('评分已完成，但会话备注未确认'));
  });
  it('does nothing after cancellation', async () => {
    const rename = vi.fn(), say = vi.fn(); await annotateFingerprint(result, target, { active: () => false, rename, say });
    expect(rename).not.toHaveBeenCalled(); expect(say).not.toHaveBeenCalled();
  });
  it('does not rename using insufficient samples', async () => {
    const rename = vi.fn(); await annotateFingerprint({ ...result, model: '指纹样本不足' }, target, { active: () => true, rename, say: vi.fn() });
    expect(rename).not.toHaveBeenCalled();
  });
  it('existing identical title is read-only with the actual rename helper', async () => {
    const call = vi.fn(async () => ({ linkCount: 1, title: 'glm-5.3', renameDialog: false }));
    await annotateFingerprint(result, target, { active: () => true, say: vi.fn(), rename: (t, title, active) => renameConversation(call, t, title, active) });
    expect(call).toHaveBeenCalledExactlyOnceWith('state', '', target);
  });
  it('the actual rename helper stops after navigation during an RPC', async () => {
    let active = true;
    const call = vi.fn(async () => { active = false; return { linkCount: 1, title: 'old' }; });
    await expect(renameConversation(call, target, result.model, () => active)).rejects.toThrow('已停止');
    expect(call).toHaveBeenCalledOnce();
  });
});


describe('vendor fallback annotates current conversation', () => {
  it.each([['Qwen / GLM', 'Qwen / GLM'], ['DeepSeek', 'DeepSeek'], ['openai', 'GPT']])('writes bare vendor name for %s', async (family, title) => {
    const rename = vi.fn(async () => {}), say = vi.fn();
    await annotateToolFamily(family, target, { active: () => true, rename, say });
    expect(rename).toHaveBeenCalledExactlyOnceWith(target, title, expect.any(Function));
    expect(say).toHaveBeenLastCalledWith(`已识别厂商；会话已备注：${title}`);
  });
  it('reports annotation failure separately and never claims success', async () => {
    const say = vi.fn();
    await annotateToolFamily('qwen/glm', target, { active: () => true, say, rename: async () => { throw Error('timeout'); } });
    expect(say).toHaveBeenLastCalledWith(expect.stringContaining('但会话备注未确认'));
    expect(say).not.toHaveBeenCalledWith(expect.stringContaining('会话已备注'));
  });
  it('does not annotate unknown families or inactive tasks', async () => {
    const rename = vi.fn(), say = vi.fn();
    await annotateToolFamily('unknown', target, { active: () => true, rename, say });
    await annotateToolFamily('DeepSeek', target, { active: () => false, rename, say });
    expect(rename).not.toHaveBeenCalled(); expect(say).not.toHaveBeenCalled();
  });
  it('does not resave an identical vendor title', async () => {
    const call = vi.fn(async () => ({ linkCount: 1, title: 'Qwen / GLM', renameDialog: false }));
    await annotateToolFamily('qwen/glm', target, { active: () => true, say: vi.fn(), rename: (t, title, active) => renameConversation(call, t, title, active) });
    expect(call).toHaveBeenCalledExactlyOnceWith('state', '', target);
  });
});
