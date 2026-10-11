import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
const source = readFileSync(new URL('../entrypoints/sidepanel/main.ts', import.meta.url), 'utf8');
function fixture(draw: any) {
  const code = source.slice(source.indexOf('ui.drawStart.onclick ='), source.indexOf('ui.fingerprintStart.onclick ='));
  const c: any = { ui: { drawStart: {}, drawStop: {} }, draw, busy: { start: false, stop: false }, localMessage: null,
    render: vi.fn(), send: vi.fn(async () => ({ running: false, manual: false, phase: 'idle' })) };
  runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, c);
  return c;
}
describe('prominent stop action', () => {
  it.each(['observe', 'model', 'rename', 'roundPause', 'idle'])('main button stops drawing in phase %s, not start again', async phase => {
    const c = fixture({ running: true, phase }); await c.ui.drawStart.onclick();
    expect(c.send).toHaveBeenCalledExactlyOnceWith({ type: 'draw:stop' }); expect(c.draw.running).toBe(false); expect(c.busy.stop).toBe(false);
  });
  it('main button stops a manual fingerprint even while phase is idle', async () => {
    const c = fixture({ running: false, manual: true, manualKind: 'fingerprint', phase: 'idle' });
    await c.ui.drawStart.onclick(); expect(c.send).toHaveBeenCalledExactlyOnceWith({ type: 'fingerprint:stop' });
  });
  it('secondary stop uses the same handler and suppresses duplicate stop requests', async () => {
    const c = fixture({ running: true }); let finish!: (x: any) => void;
    c.send = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const first = c.ui.drawStart.onclick(); await c.ui.drawStop.onclick(); expect(c.send).toHaveBeenCalledOnce();
    finish({ running: false }); await first;
  });
  it('shows a failed stop request and leaves retry possible', async () => {
    const c = fixture({ running: true }); c.send = vi.fn(async () => { throw Error('connection lost'); });
    await c.ui.drawStart.onclick(); expect(c.localMessage).toBe('connection lost'); expect(c.draw.running).toBe(true); expect(c.busy.stop).toBe(false);
  });
});
