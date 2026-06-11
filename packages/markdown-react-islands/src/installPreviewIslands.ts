"use client";

/**
 * rich の PreviewIslands レジストリへ React island（embed / graph プレビュー）を登録する。
 *
 * `VanillaMarkdownEditorMount` が mount 前に自動で呼ぶため、Mount 経由の consumer は
 * 明示的な呼び出しが不要。orchestrator（`mountVanillaRichMarkdownEditor`）を直接 mount する
 * consumer は、embed / graph プレビューを表示するために本関数を一度呼ぶこと。
 */

import { registerPreviewIslands } from "@anytime-markdown/markdown-rich/src/components/codeblock/previewIslands";

import { mountEmbedPreview } from "./rich/embedPreviewMount";
import { mountGraphPreview } from "./rich/graphPreviewMount";

let installed = false;

/** PreviewIslands を登録する（冪等）。 */
export function installPreviewIslands(): void {
  if (installed) return;
  installed = true;
  registerPreviewIslands({ mountEmbedPreview, mountGraphPreview });
}
