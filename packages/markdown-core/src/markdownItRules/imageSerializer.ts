import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export interface MarkdownSerializerLike {
  write(content: string): void;
  closeBlock(node: ProseMirrorNode): void;
}

/**
 * Block 画像を Markdown にシリアライズする。
 * 親が imageRow の場合は呼ばれず、imageRow の serialize が直接 state.write する。
 * 通常のブロック画像は closeBlock で前後に空行を挿入する。
 */
export function serializeImage(state: MarkdownSerializerLike, node: ProseMirrorNode): void {
  const alt = String(node.attrs.alt ?? "").replace(/([\\[\]])/g, "\\$1");
  const src = String(node.attrs.src ?? "").replace(/[()]/g, "\\$&");
  const title = node.attrs.title
    ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"`
    : "";
  state.write(`![${alt}](${src}${title})`);
  if (!node.type.spec.inline) {
    state.closeBlock(node);
  }
}

export const imageMarkdownSpec = {
  serialize: serializeImage,
  parse: {
    // parse は markdown-it 側で処理
  },
};
