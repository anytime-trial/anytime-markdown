const EMBED_INFO_PREFIX = "embed";
export const EMBED_DATA_ATTR = "data-embed-info";

interface MarkdownItTokenLike {
    info: string;
    content: string;
}

interface MarkdownItRendererRuleLike {
    (
        tokens: MarkdownItTokenLike[],
        idx: number,
        options: unknown,
        env: unknown,
        slf: unknown,
    ): string;
}

export interface MarkdownItLike {
    renderer: { rules: Record<string, MarkdownItRendererRuleLike | undefined> };
}

function escapeAttr(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

export function isEmbedInfoString(info: string): boolean {
    const trimmed = info.trim();
    if (trimmed === EMBED_INFO_PREFIX) return true;
    return trimmed.startsWith(`${EMBED_INFO_PREFIX} `);
}

export function renderEmbedFenceHtml(info: string, content: string): string {
    const attrEsc = escapeAttr(info.trim());
    const codeEsc = escapeHtml(content);
    return `<pre><code class="language-embed" ${EMBED_DATA_ATTR}="${attrEsc}">${codeEsc}</code></pre>\n`;
}

/**
 * markdown-it インスタンスに、embed info string のコードフェンスだけを
 * data-embed-info 属性付きでレンダリングするフェンスルール差し替えを適用する。
 * 他の言語は元の fence レンダラーに委譲する。
 */
export function installEmbedFenceRenderer(md: MarkdownItLike): void {
    const defaultFence = md.renderer.rules.fence;
    md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
        const token = tokens[idx];
        const info = token.info.trim();
        if (isEmbedInfoString(info)) {
            return renderEmbedFenceHtml(info, token.content);
        }
        if (defaultFence) {
            return defaultFence(tokens, idx, options, env, slf);
        }
        return "";
    };
}
