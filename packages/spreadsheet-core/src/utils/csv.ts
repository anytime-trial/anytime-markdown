import type { CellAlign, SheetSnapshot } from "../types";

interface CsvOptions {
    readonly delimiter?: "," | "\t";
}

// Reads a double-quoted field body starting just after the opening quote.
// `""` is an escaped quote; a lone `"` (or end of input) closes the field.
function readQuotedField(text: string, start: number): { value: string; next: number } {
    let value = "";
    let i = start;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '"') {
            if (text[i + 1] === '"') {
                value += '"';
                i += 2;
                continue;
            }
            return { value, next: i + 1 };
        }
        value += ch;
        i += 1;
    }
    return { value, next: i };
}

export function parseCsv(text: string, options: CsvOptions = {}): SheetSnapshot {
    const delimiter = options.delimiter ?? ",";
    if (text.length === 0) {
        return { cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } };
    }

    const rows: string[][] = [];
    let field = "";
    let row: string[] = [];
    let i = 0;

    while (i < text.length) {
        const ch = text[i];
        if (ch === '"') {
            const quoted = readQuotedField(text, i + 1);
            field += quoted.value;
            i = quoted.next;
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
            i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
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
