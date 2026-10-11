import { MAX_ANSWER_BYTES } from './types';
export const minimumValid = (count: number) => Math.max(80, Math.ceil(count * 55 / 100));
/** Rust char::is_alphabetic uses Unicode Alphabetic, not ASCII/Letter only. */
export function parseNumbers(text: string): number[] {
  if (new TextEncoder().encode(text).byteLength > MAX_ANSWER_BYTES) return [];
  let best: number[] = [], current: number[] = [], end = 0;
  for (const match of text.matchAll(/[0-9]+/g)) {
    if (current.length && /\p{Alphabetic}/u.test(text.slice(end, match.index))) {
      if (current.length > best.length) best = current;
      current = [];
    }
    const significant = match[0].replace(/^0+/, '');
    if (significant.length && significant.length <= 3) {
      const value = Number(significant);
      if (value >= 1 && value <= 355) current.push(value);
    }
    end = match.index! + match[0].length;
  }
  return current.length > best.length ? current : best;
}
