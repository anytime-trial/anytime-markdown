/**
 * 末尾の `/` を全て除去する。正規表現を使わない O(n) 実装で、
 * CodeQL `js/polynomial-redos` の対象を避ける目的で導入。
 */
export function stripTrailingSlashes(input: string): string {
  let end = input.length;
  while (end > 0 && input.charCodeAt(end - 1) === 0x2f) {
    end--;
  }
  return end === input.length ? input : input.slice(0, end);
}
