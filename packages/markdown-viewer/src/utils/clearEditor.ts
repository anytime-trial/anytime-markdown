/**
 * エディタ本文＋コメント状態の一括クリア（再発防止 H2）。
 *
 * `clearContent()` は doc を空にするが、コメントは別の plugin state Map で管理されるため
 * 残存する（doc マークとは別管理）。クリア時は両方を消す必要がある。
 *
 * 以前は context menu（`EditorContextMenu`）と `fileOpsController.clearAll` が
 * 同じ「`clearContent()` ＋ `initComments(new Map())`」を各々手で複製しており、
 * 片方だけ `initComments` を呼ばずコメントが残る不具合を招いた。本関数に一本化する。
 *
 * 注: source モードの textarea 直接クリアはエディタ外の経路のため本関数の対象外。
 */

import type { Editor } from "@anytime-markdown/markdown-core";

/** エディタ本文を空にし、コメント plugin state も空 Map で初期化する。 */
export function clearDocumentAndComments(editor: Editor): void {
  editor.chain().focus().clearContent().run();
  // コメント拡張が未登録の構成（テスト等）でも安全に呼べるようガードする。
  if (typeof editor.commands?.initComments === "function") {
    editor.commands.initComments(new Map());
  }
}
