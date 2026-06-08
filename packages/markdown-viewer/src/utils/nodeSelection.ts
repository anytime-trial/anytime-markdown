/** isSelectionWithinNode が必要とする editor の最小構造 */
interface SelectionEditor {
  state: { selection: { from: number } };
}

/**
 * 現在の選択がこのノードビューの範囲内かを判定する純粋関数。
 *
 * `getPos()` は ProseMirror のノードビュー由来で、ノードが doc から外れた直後
 * （ファイル選択・比較表示での doc 差し替え）に呼ぶと、内部の `posBeforeChild` が
 * undefined の `.size` を読んで throw する。これは React の useEditorState selector が
 * 古いノードビューに対して走る一過性の状態であり、選択外として扱えばよい。
 * そのため getPos の throw を捕捉して false を返す（クラッシュ＝エラーバウンダリ発火を防ぐ）。
 */
export function isSelectionWithinNode(
  editor: SelectionEditor | null | undefined,
  getPos: (() => number | null | undefined) | undefined,
  nodeSize: number,
): boolean {
  if (!editor || typeof getPos !== "function") return false;

  let pos: number | null | undefined;
  try {
    pos = getPos();
  } catch {
    // detached ノードに対する getPos() の throw は想定内の一過性状態（上記コメント参照）
    return false;
  }
  if (pos == null) return false;

  const from = editor.state.selection.from;
  return from >= pos && from <= pos + nodeSize;
}
