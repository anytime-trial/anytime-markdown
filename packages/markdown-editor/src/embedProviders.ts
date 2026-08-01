/**
 * embedProviders.ts — EmbedProviders バニラモジュールレジストリ。
 *
 * consumer（web-app / vscode webview）が起動時に注入する。
 * 未設定時は直接 fetch フォールバック（EmbedProvidersContext=null と同じ挙動）。
 *
 * React Context 非依存の module-level singleton。
 * 設定方法: `setEmbedProviders(providers)` を起動時に 1 回呼ぶ。
 */

import type { EmbedProviders } from "./types/embedProvider";

let _providers: EmbedProviders | null = null;

/**
 * EmbedProviders を注入する。
 * consumer（web-app / vscode webview）が初期化フェーズで 1 回呼ぶ。
 * null を渡すと「直接 fetch フォールバック」モードにリセットされる。
 */
export function setEmbedProviders(providers: EmbedProviders | null): void {
  _providers = providers;
}

/**
 * 現在の EmbedProviders を取得する。
 * 未設定（null）の場合は直接 fetch フォールバックが必要。
 */
export function getEmbedProviders(): EmbedProviders | null {
  return _providers;
}
