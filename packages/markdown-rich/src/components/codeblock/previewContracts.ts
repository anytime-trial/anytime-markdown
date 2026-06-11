/**
 * previewContracts.ts — embed / graph プレビューの pure ヘルパーと型定義。
 *
 * React に依存しない純粋な関数・型をここに集約する。
 * `embedPreviewMount.ts` / `graphPreviewMount.ts`（React マウント実装）や
 * `CodeBlockBlockContent.ts`（vanilla NodeView）はここから import する。
 *
 * 型 `EmbedMountHandle` / `GraphMountHandle` は後続タスクで `markdown-react-islands`
 * へ移動する際のインタフェース境界として機能する。
 */

import {
  buildEmbedInfoString,
  DEFAULT_EMBED_BASELINE,
  type EmbedBaseline,
  parseEmbedInfoString,
} from "@anytime-markdown/markdown-viewer/src/utils/embedInfoString";

// ===== インタフェース =====

/** embed プレビュー React マウントのハンドル。 */
export interface EmbedMountHandle {
  /** language(info string) / body / 幅 を反映して再描画する。 */
  render(
    language: string,
    body: string,
    widthOverride: string | undefined,
    onBaselineWrite: (b: EmbedBaseline) => void,
  ): void;
  destroy(): void;
}

/** math グラフ React マウントのハンドル。 */
export interface GraphMountHandle {
  render(code: string, enabled: boolean, isDark: boolean): void;
  destroy(): void;
}

// ===== Pure ヘルパー（React 不使用） =====

/** language(info string) から EmbedBaseline を取り出す（未解析は既定）。 */
export function parseBaseline(language: string): EmbedBaseline {
  const parsed = parseEmbedInfoString(language);
  if (!parsed) return { ...DEFAULT_EMBED_BASELINE };
  return {
    rssFeedUrl: parsed.rssFeedUrl,
    baselineRssGuid: parsed.baselineRssGuid,
    baselineOgpHash: parsed.baselineOgpHash,
    rssChecked: parsed.rssChecked,
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
