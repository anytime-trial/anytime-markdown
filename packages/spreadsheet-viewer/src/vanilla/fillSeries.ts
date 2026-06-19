/**
 * フィルハンドル（Excel 風の連続入力）の補完値生成。
 *
 * `source` は補完元ベクトル（下方向フィルなら 1 列分、右方向なら 1 行分）、
 * `count` は補完先のセル数。`source` の続きとなる値を `count` 個返す純粋関数。
 *
 * - 単一セル: 数値→+1 連番 / 末尾数字付き文字列→末尾を +1 / その他→コピー
 * - 複数セル: 全数値→等差を検出して延長 / 末尾数字付き同一接頭辞→末尾を等差延長 / それ以外→循環コピー
 */

const NUMERIC_RE = /^-?\d+(\.\d+)?$/;
const TRAILING_NUM_RE = /^(.*?)(\d+)$/;

/** 浮動小数演算誤差を抑えて文字列化する（6 を "6"、2.5 を "2.5"）。 */
function formatNum(n: number): string {
  return String(Math.round(n * 1e10) / 1e10);
}

function fillFromSingle(value: string, count: number): string[] {
  const trimmed = value.trim();
  if (NUMERIC_RE.test(trimmed)) {
    const base = Number(trimmed);
    return Array.from({ length: count }, (_, i) => formatNum(base + (i + 1)));
  }
  const m = TRAILING_NUM_RE.exec(value);
  if (m) {
    const [, prefix, digits] = m;
    const base = Number(digits);
    return Array.from({ length: count }, (_, i) =>
      prefix + String(base + (i + 1)).padStart(digits.length, "0"),
    );
  }
  return Array.from({ length: count }, () => value);
}

function fillFromMultiple(source: string[], count: number): string[] {
  const trimmed = source.map((s) => s.trim());

  // 全数値: 等差（隣接差分の平均 = (last - first) / (n - 1)）で延長。
  if (trimmed.every((s) => NUMERIC_RE.test(s))) {
    const nums = trimmed.map(Number);
    const last = nums[nums.length - 1];
    const step = (last - nums[0]) / (nums.length - 1);
    return Array.from({ length: count }, (_, i) => formatNum(last + step * (i + 1)));
  }

  // 末尾数字付き・同一接頭辞: 末尾数字を等差延長。
  const parsed = source.map((s) => TRAILING_NUM_RE.exec(s));
  if (parsed.every((m): m is RegExpExecArray => m !== null)) {
    const prefix = parsed[0][1];
    if (parsed.every((m) => m[1] === prefix)) {
      const nums = parsed.map((m) => Number(m[2]));
      const last = nums[nums.length - 1];
      const step = (last - nums[0]) / (nums.length - 1);
      const width = parsed[parsed.length - 1][2].length;
      return Array.from({ length: count }, (_, i) => {
        const v = Math.round(last + step * (i + 1));
        return prefix + String(v).padStart(width, "0");
      });
    }
  }

  // それ以外: ソースを循環コピー。
  return Array.from({ length: count }, (_, i) => source[i % source.length]);
}

/** `source` の続きとなる補完値を `count` 個生成する。 */
export function computeFillValues(source: readonly string[], count: number): string[] {
  if (count <= 0) return [];
  if (source.length === 0) return Array.from({ length: count }, () => "");
  if (source.length === 1) return fillFromSingle(source[0], count);
  return fillFromMultiple([...source], count);
}
