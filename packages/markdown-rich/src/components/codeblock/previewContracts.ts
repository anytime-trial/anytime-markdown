/**
 * previewContracts.ts — embed / graph プレビューの pure ヘルパーと型定義。
 *
 * React に依存しない純粋な関数・型をここに集約する。
 * `CodeBlockBlockContent.ts`（vanilla NodeView）と vanilla プレビュー実装
 * （viewer `createEmbedPreview` / rich `createGraphPreview`）の契約境界。
 */

import {
  buildEmbedInfoString,
  DEFAULT_EMBED_BASELINE,
  type EmbedBaseline,
  parseEmbedInfoString,
} from "@anytime-markdown/markdown-viewer/src/utils/embedInfoString";

// ===== インタフェース =====

// EmbedMountHandle は実装ホームの viewer（components-vanilla/embed/createEmbedPreview）が正規定義。
export type { EmbedMountHandle } from "@anytime-markdown/markdown-viewer/src/components-vanilla/embed/createEmbedPreview";

/** math グラフ vanilla マウントのハンドル。 */
export interface GraphMountHandle {
  render(code: string, enabled: boolean, isDark: boolean): void;
  destroy(): void;
}

// ===== Pure ヘルパー（React 不使用） =====

// parseBaseline は実装ホームの viewer（utils/embedInfoString）へ正規化。互換のため再 export する。
// `export { X } from` はモジュールスコープへ取り込まないため、本ファイル内の使用向けに import も行う。
import { parseBaseline } from "@anytime-markdown/markdown-viewer/src/utils/embedInfoString";

export { parseBaseline };

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
