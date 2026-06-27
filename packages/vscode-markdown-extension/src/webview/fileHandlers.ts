/**
 * webview のファイルハンドラ（保存配線）を構築する純粋ヘルパ。
 *
 * 背景: orchestrator (vanillaMarkdownEditor) は Ctrl+S を横取りして
 * `onSaveFile ?? onDownload` を呼ぶ。VS Code 拡張の webview は fileSystemProvider /
 * onExternalSave を設定しないため、`onSaveFile` を明示的に渡さないと `onDownload`
 * （blob の `<a download>` クリック）にフォールバックし、VS Code がネイティブの
 * 「名前を付けて保存」ダイアログを表示してしまう。
 *
 * ここで `onSaveFile` を extension host への `save` メッセージへ配線することで、
 * host 側の `ctx.document.save()`（既存ファイルへダイアログ無しで保存）に繋ぐ。
 */
import type { ToolbarFileHandlers } from '@anytime-markdown/markdown-viewer/src/types/toolbar';

/** extension host へメッセージを送る関数（`vscode.postMessage` 相当）。 */
export type PostMessage = (message: { type: string }) => void;

/** host の保存ハンドラ（`MarkdownEditorProvider` の `case 'save'`）と一致させる型名。 */
export const SAVE_MESSAGE_TYPE = 'save';

/**
 * Ctrl+S（および保存操作）を extension host の `save` メッセージへ配線したハンドラを返す。
 */
export function buildWebviewFileHandlers(
  postMessage: PostMessage,
): Required<Pick<ToolbarFileHandlers, 'onSaveFile'>> {
  return {
    onSaveFile: () => postMessage({ type: SAVE_MESSAGE_TYPE }),
  };
}
