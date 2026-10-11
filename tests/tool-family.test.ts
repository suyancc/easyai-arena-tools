import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
const code = readFileSync(new URL('../public/injected/arena-model-probe.js', import.meta.url), 'utf8');
const start = code.indexOf('function canonicalFamily('), end = code.indexOf('let fingerprintChat', start);
if (start < 0 || end < start) throw Error('Shared classifier source missing');
const context: any = {};
runInNewContext(code.slice(start, end), context);
describe('unchanged shared tool-call classifier', () => {
  it.each([
    ['toolu_01' + 'A'.repeat(18), 'Claude'],
    ['call_' + 'Z'.repeat(24), 'GPT'],
    ['call_01' + 'a'.repeat(30), 'Grok'],
    ['call_00_' + 'Z'.repeat(24), 'DeepSeek'],
    ['call_' + 'a'.repeat(24), 'Qwen / GLM'],
    ['chatcmpl-tool-' + 'a'.repeat(16), 'Hunyuan'],
    ['Z'.repeat(16), 'Gemini'],
  ])('uses tool ID shape %s to infer only family %s', (toolCallId, family) => {
    const f = context.extractStreamFingerprint({ records: [
      { seqNum: 1, data: { type: 'data-agent-dispatch', data: { attemptId: 'attempt' } } },
      { seqNum: 2, data: { type: 'tool-input-start', toolCallId, toolName: 'read_file' } },
      { seqNum: 3, data: { type: 'text-start', id: '0' } },
    ] });
    expect(context.classifyStreamFingerprint(f)).toMatchObject({ family, exact: false });
  });
  it('does not infer a vendor from tool name alone', () => {
    const f = context.extractStreamFingerprint({ type: 'tool-input-start', toolCallId: 'unrecognized', toolName: 'read_file' });
    expect(context.classifyStreamFingerprint(f)).toBeNull();
  });
});
