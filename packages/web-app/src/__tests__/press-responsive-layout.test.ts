import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * press.module.css のレスポンシブ宣言のカスケードを検証する。
 *
 * jsdom は CSS モジュールもメディアクエリも評価しないため、DOM をレンダリングしても
 * 「スマホ幅で何カラムになるか」は観測できない。そこで CSS ソースを読み、
 * 「詳細度が等しい宣言は後勝ち」というカスケード規則をそのまま再現して実効値を求める。
 */
const CSS_PATH = path.join(__dirname, "..", "app", "press", "press.module.css");

/** 対象要素（プロセス節の section）が持つクラス。どちらも詳細度 (0,1,0) */
const TARGET_SELECTORS = [".briefingWithEmbed", ".briefingReversed"] as const;

interface CssRule {
    prelude: string;
    body: string;
}

interface GridColumnsDecl {
    selector: string;
    value: string;
    /** ルールを囲む @media の max-width。囲まれていなければ null（常に適用） */
    maxWidth: number | null;
    /** ソース順。カスケードの後勝ち判定に使う */
    order: number;
}

/** 深さ 0 の `prelude { body }` を出現順に切り出す（ネストした @media は body ごと返す） */
function parseRules(css: string): CssRule[] {
    const rules: CssRule[] = [];
    let depth = 0;
    let bodyStart = 0;
    let preludeStart = 0;
    for (let i = 0; i < css.length; i += 1) {
        const ch = css[i];
        if (ch === "{") {
            if (depth === 0) bodyStart = i;
            depth += 1;
        } else if (ch === "}") {
            depth -= 1;
            if (depth === 0) {
                rules.push({
                    prelude: css.slice(preludeStart, bodyStart).trim(),
                    body: css.slice(bodyStart + 1, i),
                });
                preludeStart = i + 1;
            }
        }
    }
    return rules;
}

function collectGridColumnsDecls(css: string): GridColumnsDecl[] {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const decls: GridColumnsDecl[] = [];
    let order = 0;
    const walk = (text: string, inheritedMaxWidth: number | null): void => {
        for (const rule of parseRules(text)) {
            if (rule.prelude.startsWith("@media")) {
                const matched = /max-width:\s*(\d+)px/.exec(rule.prelude);
                walk(rule.body, matched ? Number(matched[1]) : inheritedMaxWidth);
                continue;
            }
            order += 1;
            const value = /(?:^|;)\s*grid-template-columns\s*:\s*([^;}]+)/.exec(rule.body)?.[1]?.trim();
            if (value) {
                decls.push({ selector: rule.prelude, value, maxWidth: inheritedMaxWidth, order });
            }
        }
    };
    walk(stripped, null);
    return decls;
}

/** 指定ビューポート幅で `.briefingWithEmbed.briefingReversed` に効く grid-template-columns */
function effectiveGridColumns(decls: readonly GridColumnsDecl[], viewportWidth: number): string {
    const applicable = decls
        .filter((decl) => (TARGET_SELECTORS as readonly string[]).includes(decl.selector))
        .filter((decl) => decl.maxWidth === null || viewportWidth <= decl.maxWidth)
        .sort((a, b) => a.order - b.order);
    return applicable.at(-1)?.value ?? "";
}

function trackCount(value: string): number {
    return value.split(/\s+/).filter(Boolean).length;
}

describe("press.module.css: briefing のレスポンシブカラム", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    const decls = collectGridColumnsDecls(css);

    // 抽出が空でも後続の期待値が偶然通る（fail-open）ため、前提を先に固定する
    it("解析の前提: 対象セレクタと狭幅の上書きが実在する", () => {
        expect(css.length).toBeGreaterThan(0);
        expect(decls.some((decl) => decl.selector === ".briefingReversed")).toBe(true);
        expect(
            decls.some((decl) => decl.selector === ".briefingWithEmbed" && decl.maxWidth === 880),
        ).toBe(true);
    });

    it.each([375, 480, 880])("スマホ・タブレット幅 %ipx では 1 カラムに畳む", (width) => {
        expect(trackCount(effectiveGridColumns(decls, width))).toBe(1);
    });

    it("デスクトップ幅では反転版が 2fr 1fr の 2 カラムのまま", () => {
        expect(effectiveGridColumns(decls, 1200)).toBe("2fr 1fr");
    });
});
