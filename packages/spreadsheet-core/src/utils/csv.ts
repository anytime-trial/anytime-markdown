import type { CellAlign, SheetSnapshot } from "../types";

interface CsvOptions {
    readonly delimiter?: "," | "\t";
}

export function parseCsv(text: string, options: CsvOptions = {}): SheetSnapshot {
    const delimiter = options.delimiter ?? ",";
    if (text.length === 0) {
        return { cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } };
    }

    const rows: string[][] = [];
    let field = "";
    let row: string[] = [];
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i += 1;
                continue;
            }
            field += ch;
            i += 1;
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
            i += 1;
            continue;
        }
        if (ch === delimiter) {
            row.push(field);
            field = "";
            i += 1;
            continue;
        }
        if (ch === "\n" || ch === "\r") {
            row.push(field);
            rows.push(row);
            field = "";
            row = [];
            if (ch === "\r" && text[i + 1] === "\n") i += 2;
            else i += 1;
            continue;
        }
        field += ch;
        i += 1;
    }
    row.push(field);
    rows.push(row);

    const cols = Math.max(1, ...rows.map((r) => r.length));
    const padded = rows.map((r) => {
        const out = r.slice();
        while (out.length < cols) out.push("");
        return out;
    });
    const alignments: CellAlign[][] = padded.map((r) => r.map(() => null));

    return {
        cells: padded,
        alignments,
        range: { rows: padded.length, cols },
    };
}

export function serializeCsv(snapshot: SheetSnapshot, options: CsvOptions = {}): string {
    const delimiter = options.delimiter ?? ",";
    const needsQuote = (s: string): boolean =>
        s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r");
    const quote = (s: string): string => `"${s.replaceAll('"', '""')}"`;
    return snapshot.cells
        .map((r) => r.map((c) => (needsQuote(c) ? quote(c) : c)).join(delimiter))
        .join("\n");
}
