import { buildEmbedInfoString, parseEmbedInfoString } from "../../utils/embedInfoString";

describe("parseEmbedInfoString", () => {
    test("default variant", () => {
        expect(parseEmbedInfoString("embed")).toEqual({ variant: "card", width: null });
    });
    test("card", () => {
        expect(parseEmbedInfoString("embed card")).toEqual({ variant: "card", width: null });
    });
    test("compact", () => {
        expect(parseEmbedInfoString("embed compact")).toEqual({ variant: "compact", width: null });
    });
    test("空白複数", () => {
        expect(parseEmbedInfoString("embed   compact")).toEqual({ variant: "compact", width: null });
    });
    test("非 embed", () => {
        expect(parseEmbedInfoString("typescript")).toBeNull();
    });
    test("不正 variant はデフォルト", () => {
        expect(parseEmbedInfoString("embed wide")).toEqual({ variant: "card", width: null });
    });
    test("card + width px", () => {
        expect(parseEmbedInfoString("embed card 512px")).toEqual({ variant: "card", width: "512px" });
    });
    test("compact + width", () => {
        expect(parseEmbedInfoString("embed compact 300px")).toEqual({ variant: "compact", width: "300px" });
    });
    test("width 単独 (variant 省略)", () => {
        expect(parseEmbedInfoString("embed 640px")).toEqual({ variant: "card", width: "640px" });
    });
    test("数字のみは px 付与", () => {
        expect(parseEmbedInfoString("embed card 512")).toEqual({ variant: "card", width: "512px" });
    });
    test("% も許容", () => {
        expect(parseEmbedInfoString("embed card 80%")).toEqual({ variant: "card", width: "80%" });
    });
    test("順序入れ替え OK", () => {
        expect(parseEmbedInfoString("embed 512px compact")).toEqual({ variant: "compact", width: "512px" });
    });
});

describe("buildEmbedInfoString", () => {
    test("card + null width", () => {
        expect(buildEmbedInfoString("card", null)).toBe("embed card");
    });
    test("compact + null width", () => {
        expect(buildEmbedInfoString("compact", null)).toBe("embed compact");
    });
    test("card + width", () => {
        expect(buildEmbedInfoString("card", "512px")).toBe("embed card 512px");
    });
    test("ラウンドトリップ", () => {
        const parsed = parseEmbedInfoString("embed compact 320px");
        expect(parsed).not.toBeNull();
        if (parsed) {
            expect(buildEmbedInfoString(parsed.variant, parsed.width)).toBe("embed compact 320px");
        }
    });
});
