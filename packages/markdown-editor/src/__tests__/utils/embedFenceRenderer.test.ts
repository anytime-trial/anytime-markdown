import markdownit from "markdown-it";

import {
    installEmbedFenceRenderer,
    isEmbedInfoString,
    renderEmbedFenceHtml,
    type MarkdownItLike,
} from "../../utils/embedFenceRenderer";

function parseCode(html: string): HTMLElement | null {
    const container = document.createElement("div");
    container.innerHTML = html;
    return container.querySelector("code");
}

describe("isEmbedInfoString", () => {
    test("embed 単独", () => {
        expect(isEmbedInfoString("embed")).toBe(true);
    });
    test("embed + variant", () => {
        expect(isEmbedInfoString("embed compact")).toBe(true);
    });
    test("embed + variant + width", () => {
        expect(isEmbedInfoString("embed card 512px")).toBe(true);
    });
    test("embedded (前方一致だけは false)", () => {
        expect(isEmbedInfoString("embedded")).toBe(false);
    });
    test("非 embed", () => {
        expect(isEmbedInfoString("typescript")).toBe(false);
    });
});

describe("renderEmbedFenceHtml", () => {
    test("data-embed-info に info 全体を格納", () => {
        const html = renderEmbedFenceHtml("embed card 512px", "https://example.com\n");
        const code = parseCode(html);
        expect(code?.getAttribute("data-embed-info")).toBe("embed card 512px");
        expect(code?.className).toBe("language-embed");
        expect(code?.textContent).toBe("https://example.com\n");
    });

    test("info 内の \" は &quot; にエスケープされ属性ブレイクしない", () => {
        const html = renderEmbedFenceHtml(
            'embed card 512px" onerror=alert(1) "',
            "x\n",
        );
        // パースしたときに data-embed-info の値に info 全体がそのまま入る = 属性閉じが起きていない
        const code = parseCode(html);
        expect(code?.getAttribute("data-embed-info")).toBe(
            'embed card 512px" onerror=alert(1) "',
        );
        // onerror 属性としては認識されていない（実属性に存在しない）
        expect(code?.hasAttribute("onerror")).toBe(false);
    });

    test("危険な code 本文もエスケープされる", () => {
        const html = renderEmbedFenceHtml("embed", "<script>alert(1)</script>\n");
        expect(html).not.toContain("<script");
        expect(html).toContain("&lt;script&gt;");
    });
});

describe("installEmbedFenceRenderer (markdown-it 統合)", () => {
    function render(md: string): string {
        const m = markdownit();
        installEmbedFenceRenderer(m as unknown as MarkdownItLike);
        return m.render(md);
    }

    test("`embed card 512px` はデータ属性付きで出る", () => {
        const html = render("```embed card 512px\nhttps://example.com\n```\n");
        const code = parseCode(html);
        expect(code?.getAttribute("data-embed-info")).toBe("embed card 512px");
    });

    test("他言語は既存レンダラーに委譲", () => {
        const html = render("```typescript\nconst x = 1;\n```\n");
        expect(html).not.toContain("data-embed-info");
        expect(html).toContain("language-typescript");
    });

    test("`embedded` は embed と区別される", () => {
        const html = render("```embedded-something\nx\n```\n");
        expect(html).not.toContain("data-embed-info");
    });
});
