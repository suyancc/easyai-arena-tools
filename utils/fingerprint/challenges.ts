import type { Challenge } from './types';
// Exact templates from Rust; random source injectable for deterministic tests.
const TEMPLATES: string[] = [
  "这是一次独立的数值选择记录。请为各个位置分别凭第一反应选择 {count} 个 1 到 355（含端点）的整数。每个位置都要单独选择；不要从 1 开始计数，不要连续递增或递减，也不要采用等差、循环、重复区块或其他规则化模式。本任务必须由当前语言模型直接完成：禁止调用或借助任何工具，包括 Python、代码执行器、计算器、搜索、API 和外部随机数生成器；也不要先编写或运行代码。不要引用或改写前面挑战中的列表。允许某个数字再次出现；每项写出后不要回头排序、去重或替换。数字之间用逗号或空格分隔均可。直接从第一个取值开始输出，不要在序列前重复数量、范围或任务说明。",
  "This is an independent record of numerical choices. For each position, choose separately by first instinct {count} integers from 1 to 355, inclusive. Choose separately for every position; do not count up from 1, increase or decrease consecutively, or use arithmetic progressions, cycles, repeated blocks, or other systematic patterns. The current language model must complete this task directly: do not call or use any tools, including Python, code execution tools, calculators, search, APIs, or external random number generators; do not write or run code beforehand. Do not quote or rewrite lists from earlier challenges. A number may appear again; do not sort, deduplicate, or replace earlier values. Separate the numbers with commas or spaces. Start directly with the first chosen value; do not repeat the count, range, or instructions before the sequence.",
  "これは独立した数値選択の記録です。各位置について個別に直感で、1 から 355 まで（両端を含む）の整数を {count} 個選んでください。各位置の値は個別に選んでください。1 から順に数えたり、連続して増加または減少させたりせず、等差数列、周期、同じブロックの繰り返し、その他の規則的なパターンも使わないでください。この課題は現在の言語モデル自身が直接行ってください。Python、コード実行ツール、計算機、検索、API、外部の乱数生成器など、いかなるツールも利用せず、事前にコードを書いたり実行したりしないでください。前の課題のリストを引用したり書き換えたりしないでください。同じ数字が再び現れてもかまいません。すでに書いた項目を並べ替えたり修正したりしないでください。数字はコンマまたは空白で区切ってください。最初の値から直接出力し、個数、範囲、課題の説明を繰り返さないでください。",
  "이것은 독립적인 수치 선택 기록입니다. 각 위치마다 첫 직감으로 1부터 355까지(양 끝 포함)의 정수 {count}개를 고르세요. 각 위치의 값은 따로 고르세요. 1부터 차례로 세거나 연속으로 증가·감소시키지 말고, 등차수열, 순환, 반복 블록 또는 그 밖의 규칙적인 패턴도 사용하지 마세요. 이 과제는 현재 언어 모델이 직접 수행해야 합니다. Python, 코드 실행기, 계산기, 검색, API, 외부 난수 생성기를 포함한 어떤 도구도 이용하지 말고 미리 코드를 작성하거나 실행하지도 마세요. 이전 과제의 목록을 인용하거나 다시 쓰지 마세요. 같은 숫자가 다시 나와도 됩니다. 이미 쓴 항목을 정렬하거나 고치지 마세요. 쉼표나 공백으로 숫자를 구분하세요. 고른 첫 번째 값부터 바로 출력하고 개수, 범위 또는 과제 설명을 반복하지 마세요.",
  "Ceci est un relevé indépendant de choix numériques. Pour chaque position, choisissez séparément au premier réflexe {count} entiers compris entre 1 et 355, bornes incluses. Choisissez séparément chaque valeur ; ne comptez pas à partir de 1, ne produisez pas de valeurs consécutives croissantes ou décroissantes et ne suivez pas de progression arithmétique, de cycle, de blocs répétés ou d’autre motif systématique. Le modèle de langage actuel doit accomplir cette tâche directement : n’utilisez aucun outil, notamment Python, un exécuteur de code, une calculatrice, une recherche, une API ou un générateur externe de nombres aléatoires ; n’écrivez et n’exécutez pas de code au préalable. Ne citez et ne réécrivez pas les listes des défis précédents. Un nombre peut réapparaître ; ne triez pas, ne dédupliquez pas et ne remplacez pas les valeurs déjà écrites. Séparez les nombres par des virgules ou des espaces. Commencez directement par la première valeur, sans répéter le nombre d’éléments, l’intervalle ou les consignes."
];
export function randomIndex(length: number): number {
  const limit = 2 ** 32 - (2 ** 32 % length);
  const buffer = new Uint32Array(1);
  do { crypto.getRandomValues(buffer); } while (buffer[0]! >= limit);
  return buffer[0]! % length;
}
export function generateChallenges(pick: (length: number) => number = randomIndex): Challenge[] {
  const available = Array.from({ length: 41 }, (_, i) => 292 + i);
  return Array.from({ length: 3 }, () => {
    const expectedCount = available.splice(pick(available.length), 1)[0]!;
    return { expectedCount, prompt: TEMPLATES[pick(5)]!.replace('{count}', String(expectedCount)) };
  });
}

/** Recognize only an exact generated challenge, not arbitrary messages containing numbers. */
export function recognizeChallenge(prompt: string): Challenge | null {
  if (typeof prompt !== 'string' || prompt.length > 8000) return null;
  const norm = (s: string) => s.normalize('NFC').replace(/\s+/gu, ' ').trim();
  const value = norm(prompt);
  for (const template of TEMPLATES) for (let count = 292; count <= 332; count++) {
    if (norm(template.replace('{count}', String(count))) === value) return { expectedCount: count, prompt };
  }
  return null;
}
