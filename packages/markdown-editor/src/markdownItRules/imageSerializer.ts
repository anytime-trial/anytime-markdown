import type { Node as ProseMirrorNode } from "@anytime-markdown/markdown-pm/model";

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
  const escapedBracketMatch = String.raw`\$1`;
  const escapedBackslashMatch = String.raw`\$&`;
  const escapedQuote = String.raw`\"`;
  const alt = String(node.attrs.alt ?? "").replaceAll(/([\\[\]])/g, escapedBracketMatch);
  const src = String(node.attrs.src ?? "").replaceAll(/[\\()]/g, escapedBackslashMatch);
  const title = node.attrs.title
    ? ` "${String(node.attrs.title).replaceAll('"', escapedQuote)}"`
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
