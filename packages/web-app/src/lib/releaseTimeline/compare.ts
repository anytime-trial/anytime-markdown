/**
 * 文字列の序数（コードユニット）比較。
 *
 * `localeCompare` を使わないのは、順序が実行環境のロケール設定に依存し、
 * 同じ入力から生成した年表・診断結果が環境ごとに別物になるため。ここで並べ替える
 * のは `YYYY-MM` / `YYYY-MM-DD` / バージョン ID といった ASCII のキーだけなので、
 * 序数比較で人間が期待する順序とも一致する。
 *
 * 引数無しの `Array.prototype.sort()` も序数比較だが、要素が文字列である保証を
 * 読み手にもツールにも与えないため、比較関数を明示する（typescript:S2871）。
 */
export function compareOrdinal(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
