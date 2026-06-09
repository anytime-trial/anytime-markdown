import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  buildEmbedInfoString,
  DEFAULT_EMBED_BASELINE,
  type EmbedBaseline,
  EmbedNodeView,
  parseEmbedInfoString,
} from "@anytime-markdown/markdown-viewer";

/**
 * embed プレビューの React マウント（反転アーキテクチャの限定許容）。
 *
 * embed プレビューは viewer の `EmbedNodeView`（RSS/OGP fetch・カード描画を内蔵）
 * を再利用する。vanilla 再実装はコストが高いため、native codeblock NodeView の
 * embed 分岐だけは React 部品を `createRoot` でマウントする（plan §5.3 fallback）。
 * React 依存をこのファイルへ隔離し、`CodeBlockBlockContent` 本体は embed 以外を
 * 完全 native のまま保つ。`ReactNodeViewRenderer` / `NodeViewWrapper` /
 * `NodeViewContent` は一切使わない。
 */

export interface EmbedMountHandle {
  /** language(info string) / body / 幅 を反映して再描画する。 */
  render(language: string, body: string, widthOverride: string | undefined, onBaselineWrite: (b: EmbedBaseline) => void): void;
  destroy(): void;
}

function parseBaseline(language: string): EmbedBaseline {
  const parsed = parseEmbedInfoString(language);
  if (!parsed) return { ...DEFAULT_EMBED_BASELINE };
  return {
    rssFeedUrl: parsed.rssFeedUrl,
    baselineRssGuid: parsed.baselineRssGuid,
    baselineOgpHash: parsed.baselineOgpHash,
    rssChecked: parsed.rssChecked,
  };
}

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

/** embed の card variant のみリサイズ可能。 */
export function isEmbedResizable(language: string): boolean {
  return (parseEmbedInfoString(language)?.variant ?? "card") === "card";
}

/** language(info string) に格納された幅を返す（未設定は null）。 */
export function getEmbedStoredWidth(language: string): string | null {
  return parseEmbedInfoString(language)?.width ?? null;
}

/** 新しい幅を info string へ書き戻した language を返す（variant / baseline は保持）。 */
export function buildEmbedWidthLanguage(language: string, widthPx: string): string {
  const parsed = parseEmbedInfoString(language);
  const variant = parsed?.variant ?? "card";
  return buildEmbedInfoString(variant, widthPx, parseBaseline(language));
}

/** 新しい baseline を info string へ書き戻した language を返す（variant / width は保持）。 */
export function buildEmbedBaselineLanguage(language: string, baseline: EmbedBaseline): string {
  const parsed = parseEmbedInfoString(language);
  return buildEmbedInfoString(parsed?.variant ?? "card", parsed?.width ?? null, baseline);
}
