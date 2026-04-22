import type { CellAlign, SheetSnapshot } from "../types";

/** パイプ区切りの行をセル配列にパースする（先頭・末尾の空セルを除去） */
function parseRow(line: string): string[] {
    return line.split('|').slice(1, -1).map((c) => c.trim());
}

/** GFM セパレータセル（`---`, `:---`, `:---:`, `---:`）からアライメントを判定する */
function parseAlignment(cell: string): CellAlign {
    const c = cell.trim();
    if (c.startsWith(':') && c.endsWith(':')) return 'center';
    if (c.endsWith(':')) return 'right';
    if (c.startsWith(':')) return 'left';
    return null;
}

/** セパレータ行かどうかを判定する（GFM: 各セルは `:?-+:?` 形式） */
function isSeparatorRow(line: string): boolean {
    const cells = line.split('|').slice(1, -1);
    return cells.length > 0 && cells.every((c) => /^\s*:?-+:?\s*$/.test(c));
}

/**
 * GFM Markdown テーブルを SheetSnapshot にパースする。
 * - 行 0: ヘッダー行（GFM では必須）
 * - セパレータ行: アライメントを列単位で決定し、全行に適用
 * - 行 1+: データ行
 */
export function parseMarkdownTable(text: string): SheetSnapshot {
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'));

    if (lines.length === 0) {
        return { cells: [['']], alignments: [[null]], range: { rows: 1, cols: 1 } };
    }

    const sepIdx = lines.findIndex(isSeparatorRow);

    let dataLines: string[];
    let colAlignments: CellAlign[];

    if (sepIdx < 0) {
        dataLines = lines;
        colAlignments = [];
    } else {
        const headerLines = lines.slice(0, sepIdx);
        const bodyLines = lines.slice(sepIdx + 1);
        dataLines = [...headerLines, ...bodyLines];
        colAlignments = parseRow(lines[sepIdx]).map(parseAlignment);
    }

    const cells = dataLines.map(parseRow);
    const cols = Math.max(1, ...cells.map((r) => r.length));

    const padded = cells.map((r) => {
        const row = [...r];
        while (row.length < cols) row.push('');
        return row;
    });

    while (colAlignments.length < cols) colAlignments.push(null);

    const alignments = padded.map((row) => row.map((_, c) => colAlignments[c] ?? null));

    return { cells: padded, alignments, range: { rows: padded.length, cols } };
}

/** セル値内の `|` をエスケープする */
function escapeCell(s: string): string {
    return s.replaceAll('|', '\\|');
}

/** アライメントをセパレータセル文字列に変換する */
function alignToSep(align: CellAlign): string {
    if (align === 'center') return ':---:';
    if (align === 'right') return '---:';
    if (align === 'left') return ':---';
    return '---';
}

/**
 * SheetSnapshot を GFM Markdown テーブル形式にシリアライズする。
 * - range.rows の行数だけ出力する（グリッドの空行は含めない）
 * - アライメントはヘッダー行（row 0）の各列の値を使用する
 */
export function serializeMarkdownTable(snapshot: SheetSnapshot): string {
    const { cells, alignments, range } = snapshot;
    const numRows = Math.min(range.rows, cells.length);
    const numCols = range.cols;

    if (numRows === 0) return '';

    const buildRow = (r: number): string => {
        const cols = Array.from({ length: numCols }, (_, c) => escapeCell(cells[r]?.[c] ?? ''));
        return `| ${cols.join(' | ')} |`;
    };

    const headerRow = buildRow(0);

    const sepCells = Array.from({ length: numCols }, (_, c) => alignToSep(alignments[0]?.[c] ?? null));
    const sepRow = `| ${sepCells.join(' | ')} |`;

    const dataRows = Array.from({ length: numRows - 1 }, (_, i) => buildRow(i + 1));

    return [headerRow, sepRow, ...dataRows].join('\n');
}
