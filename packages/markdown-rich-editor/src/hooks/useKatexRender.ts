import type katexType from "katex";

/** Lazy-load KaTeX only when needed */
let katexInstance: typeof katexType | null = null;
let cssLoaded = false;

async function getKatex() {
  if (!katexInstance) {
    const mod = await import("katex");
    katexInstance = mod.default;
  }
  if (!cssLoaded) {
    await import("katex/dist/katex.min.css");
    cssLoaded = true;
  }
  return katexInstance;
}

/** KaTeX HTML 出力用の DOMPurify 設定 */
export const MATH_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "span", "div", "math", "semantics", "mrow", "mi", "mo", "mn",
    "ms", "mtext", "msup", "msub", "mfrac", "mover", "munder",
    "msqrt", "mroot", "mtable", "mtr", "mtd", "menclose",
    "mspace", "mphantom", "mstyle", "merror", "annotation",
    "svg", "path", "line", "rect", "circle", "g", "use", "defs",
  ] as string[],
  ALLOWED_ATTR: [
    "class", "style", "xmlns", "mathvariant", "encoding",
    "stretchy", "fence", "separator", "accent", "accentunder",
    "lspace", "rspace", "linethickness", "scriptlevel",
    "displaystyle", "columnalign", "rowalign", "columnspacing",
    "rowspacing", "columnlines", "rowlines", "frame",
    "width", "height", "depth", "viewBox", "d", "fill",
    "stroke", "stroke-width", "transform", "x", "y",
    "x1", "y1", "x2", "y2", "r", "cx", "cy",
    "aria-hidden", "focusable", "role",
  ] as string[],
  ALLOW_DATA_ATTR: false,
};

/**
 * 数式コードを KaTeX で HTML 文字列へレンダリングする（React 非依存）。
 * KaTeX は遅延ロードされ、`throwOnError: false` のため通常は error を返さない。
 * native NodeView（codeBlockPreview）と vanilla dialog の双方から利用する seam。
 */
export async function renderKatexHtml(code: string): Promise<{ html: string; error: string }> {
  if (!code.trim()) return { html: "", error: "" };
  try {
    const katex = await getKatex();
    const html = katex.renderToString(code, {
      displayMode: true,
      throwOnError: false,
    });
    return { html, error: "" };
  } catch (err) {
    return { html: "", error: `KaTeX: ${err instanceof Error ? err.message : "render error"}` };
  }
}
