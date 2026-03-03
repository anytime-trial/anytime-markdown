/**
 * Math (KaTeX) の Markdown 前処理・後処理ユーティリティ
 *
 * - preprocessMathBlock:  $$...$$ → ```math ... ``` (読み込み前処理)
 * - preprocessMathInline: $...$  → <span data-math-inline> (読み込み前処理)
 * - postprocessMathBlock: ```math ... ``` → $$...$$ (出力後処理)
 */

/**
 * $$...$$ ブロックを ```math コードフェンスに変換（読み込み前処理）
 *
 * - コードフェンス内の $$ はスキップ
 * - $$ は行頭にある場合のみブロックとして認識
 */
export function preprocessMathBlock(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let inCodeFence = false;
  let inMathBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // コードフェンスのトグル（```で始まる行）
    if (!inMathBlock && /^```/.test(line)) {
      inCodeFence = !inCodeFence;
      result.push(line);
      continue;
    }

    // コードフェンス内はスキップ
    if (inCodeFence) {
      result.push(line);
      continue;
    }

    // $$ 行の検出（行頭、前後の空白は許容）
    if (line.trim() === "$$") {
      if (!inMathBlock) {
        // 開始
        inMathBlock = true;
        result.push("```math");
      } else {
        // 終了
        inMathBlock = false;
        result.push("```");
      }
      continue;
    }

    result.push(line);
  }

  return result.join("\n");
}

/**
 * $...$ インラインを <span data-math-inline="..."> に変換（読み込み前処理）
 *
 * - $$ はスキップ（ブロック記法）
 * - インラインコード（`...`）内の $ はスキップ
 * - コードフェンス（```...```）内の $ はスキップ
 */
export function preprocessMathInline(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // コードフェンスのトグル
    if (/^```/.test(line)) {
      inCodeFence = !inCodeFence;
      result.push(line);
      continue;
    }

    if (inCodeFence) {
      result.push(line);
      continue;
    }

    result.push(convertInlineMath(line));
  }

  return result.join("\n");
}

/**
 * 1行内のインライン数式を変換する内部関数
 * インラインコードとブロック$$ をスキップ
 */
function convertInlineMath(line: string): string {
  const parts: string[] = [];
  let pos = 0;

  while (pos < line.length) {
    // インラインコードの検出: `...`
    if (line[pos] === "`") {
      const end = line.indexOf("`", pos + 1);
      if (end !== -1) {
        parts.push(line.slice(pos, end + 1));
        pos = end + 1;
        continue;
      }
    }

    // $$ のスキップ（ブロック記法の残り）
    if (line[pos] === "$" && pos + 1 < line.length && line[pos + 1] === "$") {
      parts.push("$$");
      pos += 2;
      continue;
    }

    // $...$ インライン数式の検出
    if (line[pos] === "$") {
      const end = findClosingDollar(line, pos + 1);
      if (end !== -1) {
        const formula = line.slice(pos + 1, end);
        parts.push(`<span data-math-inline="${formula}"></span>`);
        pos = end + 1;
        continue;
      }
    }

    parts.push(line[pos]);
    pos++;
  }

  return parts.join("");
}

/**
 * 閉じ $ の位置を探す。$$ は閉じとみなさない。
 */
function findClosingDollar(line: string, start: number): number {
  for (let i = start; i < line.length; i++) {
    if (line[i] === "$" && (i + 1 >= line.length || line[i + 1] !== "$")) {
      // 空の数式（$$ = 開始直後に閉じ）はスキップ
      if (i === start) return -1;
      return i;
    }
  }
  return -1;
}

/**
 * ```math コードフェンスを $$...$$ に変換（出力後処理）
 */
export function postprocessMathBlock(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let inMathFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inMathFence && /^```math\s*$/.test(line)) {
      inMathFence = true;
      result.push("$$");
      continue;
    }

    if (inMathFence && /^```\s*$/.test(line)) {
      inMathFence = false;
      result.push("$$");
      continue;
    }

    result.push(line);
  }

  return result.join("\n");
}
