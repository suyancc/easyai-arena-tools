import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
const source = readFileSync(new URL('../entrypoints/sidepanel/main.ts', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('ui.drawStart.onclick ='), source.indexOf('ui.drawStop.onclick ='));
function fixture(settings: object) {
  const context: any = { ui: { drawStart: {} }, busy: { start: false, fingerprint: false, pelican: false }, target: { id: 42 }, settings: {}, draw: null,
    localMessage: null, saveTimer: undefined, clearTimeout, render: vi.fn(), readForm: () => settings, validateSettings: () => null,
    settingsItem: { setValue: vi.fn(async () => {}) }, send: vi.fn(async () => ({ running: true })) };
  runInNewContext(ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context;
}
describe('start drawing directly without confirmation', () => {
  it.each([
    { fingerprintEveryTurn: false, fingerprintFamilies: [] },
    { fingerprintEveryTurn: false, fingerprintFamilies: ['openai'] },
    { fingerprintEveryTurn: true, fingerprintFamilies: [] },
  ])('starts once with settings %j, with no modal API present', async settings => {
    const c = fixture(settings); await c.ui.drawStart.onclick();
    expect(c.send).toHaveBeenCalledExactlyOnceWith({ type: 'draw:start', settings });
    expect(c.settingsItem.setValue).toHaveBeenCalledWith(settings);
    expect(c.busy.start).toBe(false); expect(c.localMessage).toBeNull();
  });
  it('still blocks duplicate clicks and invalid settings', async () => {
    const c = fixture({}); c.busy.start = true; await c.ui.drawStart.onclick(); expect(c.send).not.toHaveBeenCalled();
    c.busy.start = false; c.validateSettings = () => 'invalid'; await c.ui.drawStart.onclick();
    expect(c.send).not.toHaveBeenCalled(); expect(c.localMessage).toBe('invalid');
  });
  it('still blocks a target tab change during settings persistence', async () => {
    const c = fixture({}); c.settingsItem.setValue = async () => { c.target.id = 43; };
    await c.ui.drawStart.onclick(); expect(c.send).not.toHaveBeenCalled(); expect(c.localMessage).toContain('目标标签页已变化');
  });
  it('removes the unused dialog and consent code entirely', () => {
    const html = readFileSync(new URL('../entrypoints/sidepanel/index.html', import.meta.url), 'utf8');
    expect(html).not.toContain('fingerprint-confirm'); expect(source).not.toContain('confirmFingerprint'); expect(source).not.toContain('fingerprintConsent');
  });
});
