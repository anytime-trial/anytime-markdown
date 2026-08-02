import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * press.module.css のレスポンシブ宣言のカスケードを検証する。
 *
 * jsdom は CSS モジュールもメディアクエリも評価しないため、DOM をレンダリングしても
 * 「スマホ幅で何カラムになるか」は観測できない。そこで CSS ソースを読み、
 * 「詳細度が等しい宣言は後勝ち」というカスケード規則をそのまま再現して実効値を求める。
 */
const CSS_PATH = path.join(__dirname, "..", "app", "[locale]", "press", "press.module.css");

/** 対象要素（プロセス節の section）が持つクラス。どちらも詳細度 (0,1,0) */
const TARGET_SELECTORS = [".briefingWithEmbed", ".briefingReversed"] as const;

interface CssRule {
    prelude: string;
    body: string;
}

interface MediaCondition {
    maxWidth: number | null;
    minWidth: number | null;
    /**
     * max-width / min-width 以外の条件（feature query 等）を含む @media。
     * 幅だけでは適用可否を決められないため、実効値の計算に混ぜず前提テストで弾く。
     * 「解釈できない条件を暗黙に常時適用とみなす」と、対象セレクタに新しい種類の
     * ブレークポイントが増えたときテストが誤って通過する（fail-open）。
     */
    unsupported: boolean;
}

interface GridColumnsDecl {
    selector: string;
    value: string;
    /** ルールを囲む @media の条件。囲まれていなければ常に適用 */
    media: MediaCondition;
    /** ソース順。カスケードの後勝ち判定に使う */
    order: number;
}

const ALWAYS_APPLIES: MediaCondition = { maxWidth: null, minWidth: null, unsupported: false };

/** `@media (max-width: 880px) and (min-width: 400px)` のような prelude を条件へ落とす */
function parseMediaCondition(prelude: string, inherited: MediaCondition): MediaCondition {
    let { maxWidth, minWidth, unsupported } = inherited;
    for (const term of prelude.replace(/^@media/, "").trim().split(/\s+and\s+/)) {
        const max = /^\(\s*max-width:\s*(\d+)px\s*\)$/.exec(term);
        const min = /^\(\s*min-width:\s*(\d+)px\s*\)$/.exec(term);
        if (max) {
            const value = Number(max[1]);
            maxWidth = maxWidth === null ? value : Math.min(maxWidth, value);
        } else if (min) {
            const value = Number(min[1]);
            minWidth = minWidth === null ? value : Math.max(minWidth, value);
        } else {
            unsupported = true;
        }
    }
    return { maxWidth, minWidth, unsupported };
}

function mediaApplies(media: MediaCondition, viewportWidth: number): boolean {
    if (media.maxWidth !== null && viewportWidth > media.maxWidth) return false;
    return !(media.minWidth !== null && viewportWidth < media.minWidth);
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
    const walk = (text: string, media: MediaCondition): void => {
        for (const rule of parseRules(text)) {
            if (rule.prelude.startsWith("@media")) {
                walk(rule.body, parseMediaCondition(rule.prelude, media));
                continue;
            }
            order += 1;
            const value = /(?:^|;)\s*grid-template-columns\s*:\s*([^;}]+)/.exec(rule.body)?.[1]?.trim();
            if (value) {
                decls.push({ selector: rule.prelude, value, media, order });
            }
        }
    };
    walk(stripped, ALWAYS_APPLIES);
    return decls;
}

function targetDecls(decls: readonly GridColumnsDecl[]): GridColumnsDecl[] {
    return decls.filter((decl) => (TARGET_SELECTORS as readonly string[]).includes(decl.selector));
}

/** 指定ビューポート幅で `.briefingWithEmbed.briefingReversed` に効く grid-template-columns */
function effectiveGridColumns(decls: readonly GridColumnsDecl[], viewportWidth: number): string {
    const applicable = targetDecls(decls)
        .filter((decl) => mediaApplies(decl.media, viewportWidth))
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
            decls.some(
                (decl) => decl.selector === ".briefingWithEmbed" && decl.media.maxWidth === 880,
            ),
        ).toBe(true);
    });

    it("解析の前提: 対象セレクタが幅以外の @media 条件に囲まれていない", () => {
        // 解釈できない条件を常時適用とみなすと実効値の計算が崩れるので、
        // 新種のブレークポイントが増えた時点でここが落ちるようにする
        expect(targetDecls(decls).filter((decl) => decl.media.unsupported)).toEqual([]);
    });

    it.each([375, 480, 880])("スマホ・タブレット幅 %ipx では 1 カラムに畳む", (width) => {
        expect(trackCount(effectiveGridColumns(decls, width))).toBe(1);
    });

    it("デスクトップ幅では反転版が 2fr 1fr の 2 カラムのまま", () => {
        expect(effectiveGridColumns(decls, 1200)).toBe("2fr 1fr");
    });
});
