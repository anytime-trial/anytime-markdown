/**
 * Math (KaTeX) の Markdown 前処理・後処理ユーティリティ
 *
 * - preprocessMathBlock:  $$...$$ → ```math ... ``` (読み込み前処理)
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
