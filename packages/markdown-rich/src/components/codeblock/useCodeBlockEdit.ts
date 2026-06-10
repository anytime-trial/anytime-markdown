import type { Editor } from "@anytime-markdown/markdown-core";

/**
 * 選択中 codeBlock のコードテキスト一括反映ロジック（React 非依存の pure seam）。
 *
 * 旧 React 経路の全画面編集状態機械（`useCodeBlockEdit` hook）は G4 で削除済み。
 * vanilla overlay（`installCodeBlockOverlay`）はこの純関数のみを利用する。
 */

/**
 * 選択中 codeBlock のコードテキストを fsCode へ一括反映する（純関数）。
 * 空文字なら範囲削除。`from = pos + 1`、`to = from + contentSize`。
 */
export function applyCodeBlockText(editor: Editor, pos: number, contentSize: number, fsCode: string): void {
  const from = pos + 1;
  const to = from + contentSize;
  editor.chain().command(({ tr }) => {
    if (fsCode) {
      tr.replaceWith(from, to, editor.schema.text(fsCode));
    } else {
      tr.delete(from, to);
    }
    return true;
  }).run();
}
