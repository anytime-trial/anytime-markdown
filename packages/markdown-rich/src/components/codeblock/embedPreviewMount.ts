import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  EmbedNodeView,
} from "@anytime-markdown/markdown-viewer";

import {
  type EmbedMountHandle,
  parseBaseline,
} from "./previewContracts";

/**
 * embed プレビューの React マウント（反転アーキテクチャの限定許容）。
 *
 * embed プレビューは viewer の `EmbedNodeView`（RSS/OGP fetch・カード描画を内蔵）
 * を再利用する。vanilla 再実装はコストが高いため、native codeblock NodeView の
 * embed 分岐だけは React 部品を `createRoot` でマウントする（plan §5.3 fallback）。
 * React 依存をこのファイルへ隔離し、`CodeBlockBlockContent` 本体は embed 以外を
 * 完全 native のまま保つ。`ReactNodeViewRenderer` / `NodeViewWrapper` /
 * `NodeViewContent` は一切使わない。
 *
 * Pure ヘルパー（parseBaseline / isEmbedResizable 等）と型定義は
 * `previewContracts.ts` に集約されている。
 */

export type { EmbedMountHandle } from "./previewContracts";

export function mountEmbedPreview(container: HTMLElement): EmbedMountHandle {
  const root: Root = createRoot(container);
  return {
    render(language, body, widthOverride, onBaselineWrite) {
      root.render(
        createElement(EmbedNodeView, {
          language,
          body,
          widthOverride,
          baseline: parseBaseline(language),
          onBaselineWrite,
        }),
      );
    },
    destroy() {
      root.unmount();
    },
  };
}
