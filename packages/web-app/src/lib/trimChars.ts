/**
 * 文字単位の前後トリム。
 *
 * `/^-+|-+$/g` や `/\/+$/` のような「同一文字の連続 + 行末アンカー」は、一致しない入力に対して
 * 連長ぶんバックトラックし実行時間が super-linear になる（Sonar S8786）。走査で置き換える。
 */

/** 末尾の `char`（1 文字）をすべて落とす。 */
export function trimEndChar(value: string, char: string): string {
  // 1 文字比較なので、2 文字以上を渡されると黙って no-op になる。呼び違いを止める。
  if (char.length !== 1) throw new Error(`trimEndChar: char は 1 文字（received: ${JSON.stringify(char)}）`);
  let end = value.length;
  while (end > 0 && value[end - 1] === char) end -= 1;
  return value.slice(0, end);
}

/** 先頭・末尾の `char`（1 文字）をすべて落とす。 */
export function trimChar(value: string, char: string): string {
  if (char.length !== 1) throw new Error(`trimChar: char は 1 文字（received: ${JSON.stringify(char)}）`);
  let start = 0;
  while (start < value.length && value[start] === char) start += 1;
  return trimEndChar(value.slice(start), char);
}
