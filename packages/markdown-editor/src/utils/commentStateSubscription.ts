/**
 * コメント状態変化の単一購読プリミティブ（再発防止 H1）。
 *
 * コメントは ProseMirror の doc 内マーク／ノードと、別の plugin state Map（id→{text,resolved}）で
 * 二重管理される。resolve / unresolve / updateText は **meta のみ（doc 非変更）** の
 * トランザクションで Map を更新するため、vendored tiptap の `update` イベント
 * （`Editor.ts`：docChanged 時のみ emit）では取りこぼす。
 *
 * 本プリミティブは `transaction`（全トランザクションで発火）を購読し、
 * 「コメント状態シグネチャ または docChanged が変化したときだけ」コールバックする
 * **通知判定のみ**を担う。debounce / 編集中ガード / 再描画などの固有処理は呼び元が行う
 * （集約しすぎない＝早すぎる抽象化を避ける）。
 *
 * 以前は `CommentPanel` と `commentNotifications` がそれぞれ独自に同等の購読＋シグネチャを
 * 実装しており、片方だけ `update` 購読のまま放置されると拡張のネイティブコメント UI に
 * 反映されない等の不具合を招いた。本プリミティブに一本化して再発を防ぐ。
 */

import type { Editor } from "@anytime-markdown/markdown-core";

import { commentDataPluginKey } from "../extensions/commentExtension";
import type { InlineComment } from "./commentHelpers";

/** `transaction` イベントで渡されるプロパティのうち本プリミティブが参照する部分集合。 */
interface TransactionEventProps {
  transaction?: { docChanged?: boolean };
  appendedTransactions?: Array<{ docChanged?: boolean }>;
}

/**
 * コメント描画／通知に影響する状態（id / resolved / text）の衝突しないシグネチャを返す。
 *
 * 値を区切り文字で連結すると `text` 内の区切り文字（`|` / `:`）で別状態が同一シグネチャに
 * 丸まる衝突が起きるため、`JSON.stringify`（構造比較）を使う。id 昇順にソートして
 * Map の挿入順変化に対する偽陽性も避ける。
 */
export function commentStateSignature(editor: Editor): string {
  const pluginState = commentDataPluginKey.getState(editor.state) as
    | { comments: Map<string, InlineComment> }
    | undefined;
  const comments = pluginState?.comments;
  if (!comments || comments.size === 0) return "[]";
  const entries = Array.from(comments.values())
    .map((c) => [c.id, c.resolved ? 1 : 0, c.text] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify(entries);
}

/** トランザクションが（appended 含め）ドキュメントを変更したか。tiptap 本体の update 判定に整合。 */
function isDocChanged(props?: TransactionEventProps): boolean {
  return (
    (props?.transaction?.docChanged ?? false) ||
    (props?.appendedTransactions?.some((tr) => tr.docChanged) ?? false)
  );
}

/**
 * コメント状態（plugin Map）または doc が変化したときだけ `cb` を呼ぶ購読を張る。
 *
 * @param editor 対象 editor。
 * @param cb 変化時に呼ぶコールバック（呼び元が debounce / 編集ガード / 再描画を担う）。
 * @returns 購読解除関数。
 */
export function onCommentStateChange(editor: Editor, cb: () => void): () => void {
  let lastSignature = commentStateSignature(editor);
  const handler = (props?: TransactionEventProps): void => {
    const signature = commentStateSignature(editor);
    // コメント状態も doc も変わっていなければ何もしない（選択移動等での無駄な発火を防ぐ）。
    if (signature === lastSignature && !isDocChanged(props)) return;
    lastSignature = signature;
    cb();
  };
  editor.on("transaction", handler);
  return () => editor.off("transaction", handler);
}
