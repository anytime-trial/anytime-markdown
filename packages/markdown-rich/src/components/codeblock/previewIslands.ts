/**
 * previewIslands.ts — React island（embed / graph プレビュー）のレジストリ。
 *
 * React island（embed/graph プレビュー）は markdown-react-islands が登録する。
 * 未登録時はプレビューなしで劣化動作（グレースフルデグラデーション）。
 *
 * 登録パターンは markdown-viewer の `MergeEditorsContext.setMergeEditors` と同方針の
 * モジュールレベルストアで実装する。
 */

import type { EmbedMountHandle, GraphMountHandle } from "./previewContracts";

/** embed / graph プレビューの React island マウント関数セット。 */
export interface PreviewIslands {
  /**
   * embed プレビューを container へ React でマウントし、ハンドルを返す。
   * `mountEmbedPreview(container)` と同シグネチャ。
   */
  mountEmbedPreview(container: HTMLElement): EmbedMountHandle;
  /**
   * math グラフを container へ React でマウントし、ハンドルを返す。
   * `mountGraphPreview(container)` と同シグネチャ。
   */
  mountGraphPreview(container: HTMLElement): GraphMountHandle;
}

// モジュールレベルストア
let _islands: PreviewIslands | null = null;

/**
 * React island 実装を登録する。
 * `markdown-react-islands` パッケージの初期化時に呼び出す。
 * `null` を渡すと未登録状態にリセットする（テスト用）。
 */
export function registerPreviewIslands(impl: PreviewIslands | null): void {
  _islands = impl;
}

/**
 * 登録済み PreviewIslands を返す。
 * 未登録（`registerPreviewIslands` 未呼び出し）の場合は `null`。
 */
export function getPreviewIslands(): PreviewIslands | null {
  return _islands;
}

/**
 * テスト用: 登録状態を null にリセットする。
 * プロダクションコードでは使用しないこと。
 */
export function resetPreviewIslands(): void {
  _islands = null;
}
