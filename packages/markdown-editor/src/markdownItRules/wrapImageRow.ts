import type MarkdownIt from "markdown-it";

/**
 * 同一段落内に連続する image トークンのみが並ぶ場合、
 * paragraph_open/paragraph_close を div[data-image-row] に書き換え、
 * inline の whitespace テキストを取り除く。
 *
 * 1 枚のみ、テキスト混在の場合は変更しない。
 */
export function wrapImageRow(md: MarkdownIt): void {
  md.core.ruler.after("inline", "wrap_image_row", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length - 2; i++) {
      const open = tokens[i];
      const inline = tokens[i + 1];
      const close = tokens[i + 2];
      if (open.type !== "paragraph_open") continue;
      if (inline.type !== "inline") continue;
      if (close.type !== "paragraph_close") continue;

      const children = inline.children ?? [];
      const imageCount = children.filter((c) => c.type === "image").length;
      if (imageCount < 2) continue;

      const hasNonImageContent = children.some((c) => {
        if (c.type === "image") return false;
        if (c.type === "text" && c.content.trim() === "") return false;
        if (c.type === "softbreak" || c.type === "hardbreak") return false;
        return true;
      });
      if (hasNonImageContent) continue;

      // paragraph_open/close を div[data-image-row] に置換
      open.tag = "div";
      open.attrSet("data-image-row", "");
      open.attrJoin("class", "image-row");
      close.tag = "div";

      // inline 内の非 image 要素（whitespace, softbreak 等）を除去
      inline.children = children.filter((c) => c.type === "image");
      inline.content = inline.children.map((c) => `![${c.content}](${c.attrGet("src") ?? ""})`).join("");
    }
    return true;
  });
}
