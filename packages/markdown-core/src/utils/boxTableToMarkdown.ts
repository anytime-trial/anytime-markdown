/**
 * Unicode 罫線テーブル（Box-drawing characters）を Markdown テーブルに変換する。
 * 変換できない場合は元のテキストをそのまま返す。
 */

const BOX_CHARS = /[┌┐└┘├┤┬┴┼─│╔╗╚╝╠╣╦╩╬═║]/;

/** テキストに罫線テーブルが含まれているか判定 */
export function containsBoxTable(text: string): boolean {
  return BOX_CHARS.test(text);
}

/** 罫線テーブルを Markdown テーブルに変換 */
export function boxTableToMarkdown(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let tableRows: string[][] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inTable && tableRows.length > 0) {
        result.push(...formatTable(tableRows));
        tableRows = [];
        inTable = false;
      }
      result.push(line);
      continue;
    }

    // 罫線のみの行（ヘッダー区切り、上下枠）はスキップ
    if (isBorderLine(trimmed)) {
      inTable = true;
      continue;
    }

    // データ行: │ で区切る
    if (isDataLine(trimmed)) {
      inTable = true;
      const cells = extractCells(trimmed);
      tableRows.push(cells);
      continue;
    }

    // テーブル外のテキスト
    if (inTable && tableRows.length > 0) {
      result.push(...formatTable(tableRows));
      tableRows = [];
      inTable = false;
    }
    result.push(line);
  }

  // 末尾のテーブル
  if (tableRows.length > 0) {
    result.push(...formatTable(tableRows));
  }

  return result.join("\n");
}

/** 罫線のみで構成された行か */
function isBorderLine(line: string): boolean {
  // │ が含まれていてもセル内容がなければボーダー
  const stripped = line.replaceAll(/[┌┐└┘├┤┬┴┼─═╔╗╚╝╠╣╦╩╬║│\s]/g, "");
  return stripped.length === 0 && BOX_CHARS.test(line);
}

/** データ行か（│ で区切られたセルを含む） */
function isDataLine(line: string): boolean {
  return (line.includes("│") || line.includes("║"));
}

/** データ行からセル内容を抽出 */
function extractCells(line: string): string[] {
  // │ または ║ で分割し、先頭と末尾の空エントリを除去
  const parts = line.split(/[│║]/);
  // 先頭と末尾が空（罫線の外側）なら除去
  if (parts.length > 0 && parts[0].trim() === "") parts.shift();
  if (parts.length > 0 && parts.at(-1)!.trim() === "") parts.pop();
  return parts.map(cell => cell.trim());
}

/** 行データ配列を Markdown テーブルに変換 */
function formatTable(rows: string[][]): string[] {
  if (rows.length === 0) return [];

  // 列数を最大に合わせる
  const colCount = Math.max(...rows.map(r => r.length));
  const normalized = rows.map(r => {
    while (r.length < colCount) r.push("");
    return r;
  });

  // 列幅を計算
  const widths = Array.from({ length: colCount }, (_, c) =>
    Math.max(3, ...normalized.map(r => r[c].length)),
  );

  const output: string[] = [
    // ヘッダー行
    "| " + normalized[0].map((cell, i) => cell.padEnd(widths[i])).join(" | ") + " |",
    // セパレーター
    "| " + widths.map(w => "-".repeat(w)).join(" | ") + " |",
  ];
  // データ行
  for (let r = 1; r < normalized.length; r++) {
    output.push("| " + normalized[r].map((cell, i) => cell.padEnd(widths[i])).join(" | ") + " |");
  }
  return output;
}
