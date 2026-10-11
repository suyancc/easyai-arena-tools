/** Shared completion effect for manual and recovered fingerprint results. */
import { buildTitle, familyDisplayFromProbe } from '../titles';
import type { FingerprintResult } from './result';
export interface AnnotationPorts {
  active(): boolean;
  rename(target: string, title: string, active: () => boolean): Promise<void>;
  say(message: string): void;
}
export async function annotateFingerprint(result: FingerprintResult, target: string, ports: AnnotationPorts): Promise<void> {
  if (!ports.active()) return;
  const summary = result.note || result.model;
  // Do not replace a useful title with a fallback, unknown family, or insufficient samples.
  if (!result.model.endsWith('（指纹推测）')) { ports.say(summary); return; }
  const title = buildTitle(result.model.replace(/（指纹推测）$/u, ''), ''); // Stable across refreshes; no timestamp churn.
  ports.say(`${summary}；正在备注当前会话…`);
  try {
    await ports.rename(target, title, ports.active);
    if (ports.active()) ports.say(`${summary}；会话已备注：${title}`);
  } catch {
    if (ports.active()) ports.say(`${summary}；评分已完成，但会话备注未确认。请检查侧栏或刷新后重试；不会重发指纹题`);
  }
}


/** Vendor fallback uses only a recognized family, never an invented exact model. */
export async function annotateToolFamily(family: string, target: string, ports: AnnotationPorts): Promise<void> {
  const label = familyDisplayFromProbe(family);
  if (!ports.active() || !label) return;
  const title = buildTitle(label, '');
  ports.say(`已识别厂商：${title}；正在备注当前会话…`);
  try {
    await ports.rename(target, title, ports.active);
    if (ports.active()) ports.say(`已识别厂商；会话已备注：${title}`);
  } catch {
    if (ports.active()) ports.say(`已识别厂商：${title}，但会话备注未确认。请检查侧栏或刷新后重试；不会发送新消息`);
  }
}
