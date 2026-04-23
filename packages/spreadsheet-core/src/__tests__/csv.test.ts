import { parseCsv, serializeCsv } from "../utils/csv";

describe("parseCsv", () => {
    it("parses simple comma-separated values", () => {
        const snap = parseCsv("a,b,c\n1,2,3");
        expect(snap.cells).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
        expect(snap.range).toEqual({ rows: 2, cols: 3 });
    });

    it("handles quoted fields with embedded comma", () => {
        const snap = parseCsv('a,"b,c",d');
        expect(snap.cells).toEqual([["a", "b,c", "d"]]);
    });

    it("handles quoted fields with embedded newline", () => {
        const snap = parseCsv('a,"b\nc",d');
        expect(snap.cells).toEqual([["a", "b\nc", "d"]]);
    });

    it("handles escaped double quote (\"\")", () => {
        const snap = parseCsv('a,"he said ""hi""",c');
        expect(snap.cells).toEqual([["a", 'he said "hi"', "c"]]);
    });

    it("parses tab-delimited values when delimiter is \\t", () => {
        const snap = parseCsv("a\tb\tc", { delimiter: "\t" });
        expect(snap.cells).toEqual([["a", "b", "c"]]);
    });

    it("pads short rows with empty strings to match the max column count", () => {
        const snap = parseCsv("a,b,c\n1,2");
        expect(snap.cells).toEqual([["a", "b", "c"], ["1", "2", ""]]);
        expect(snap.range).toEqual({ rows: 2, cols: 3 });
    });

    it("returns an empty 1x1 snapshot for empty input", () => {
        const snap = parseCsv("");
        expect(snap.cells).toEqual([[""]]);
        expect(snap.range).toEqual({ rows: 1, cols: 1 });
    });
});

describe("serializeCsv", () => {
    it("serializes simple values", () => {
        const text = serializeCsv({
            cells: [["a", "b"], ["1", "2"]],
            alignments: [[null, null], [null, null]],
            range: { rows: 2, cols: 2 },
        });
        expect(text).toBe("a,b\n1,2");
    });

    it("quotes values containing comma, quote, or newline", () => {
        const text = serializeCsv({
            cells: [["a,b", 'x"y', "p\nq"]],
            alignments: [[null, null, null]],
            range: { rows: 1, cols: 3 },
        });
        expect(text).toBe('"a,b","x""y","p\nq"');
    });

    it("uses tab delimiter when specified", () => {
        const text = serializeCsv(
            {
                cells: [["a", "b"]],
                alignments: [[null, null]],
                range: { rows: 1, cols: 2 },
            },
            { delimiter: "\t" },
        );
        expect(text).toBe("a\tb");
    });

    it("round-trip preserves data", () => {
        const original = "a,\"b,c\",\"he said \"\"hi\"\"\"\n1,2,3";
        expect(serializeCsv(parseCsv(original))).toBe(original);
    });
});
