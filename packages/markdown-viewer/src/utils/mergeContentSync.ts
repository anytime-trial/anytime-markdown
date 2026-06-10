/**
 * 比較（マージ）ビューのコンテンツ同期コアロジック（脱 React 共有層）。
 *
 * React hook `hooks/useMergeContentSync.ts` と vanilla ファクトリ
 * `components-vanilla/InlineMergeView.ts` の双方から利用する純粋ロジックを集約する。
 * ここには React 依存（useEffect / useRef / useState）を一切持たせない。Editor は
 * markdown-core 型を使う（markdown-react の Editor は core の re-export であり代入互換）。
 */

import type { Node as ProseMirrorNode } from "@anytime-markdown/markdown-pm/model";
import type { Transaction } from "@anytime-markdown/markdown-pm/state";
import type { Editor } from "@anytime-markdown/markdown-core";

import { applyMarkdownToEditor } from "./editorContentLoader";
import { prependFrontmatter } from "./frontmatterHelpers";
import { getMarkdownFromEditor } from "./markdownSerializer";

/** collapsed / codeCollapsed 状態を持つノード種別。 */
export const SYNC_TARGET_TYPES = new Set(["codeBlock", "table", "image"]);

/**
 * 比較（左）テキストを比較用エディタで Tiptap 往復し、編集（右）側と同一の
 * 正規化レベルに揃える。ソースモードでは左パネルが生テキスト表示のため、
 * これを通さないと computeDiff が「見た目は同一なのに modified」と判定する
 * 偽差分（phantom diff）を出す。冪等: 正規化済みを再度通しても結果は変わらない。
 */
export function normalizeCompareMarkdown(editor: Editor, raw: string): string {
  const { frontmatter } = applyMarkdownToEditor(editor, raw);
  return prependFrontmatter(getMarkdownFromEditor(editor), frontmatter);
}

export interface CollapsedState {
  type: string;
  index: number;
  collapsed?: boolean;
  codeCollapsed?: boolean;
}

/** ProseMirror doc から collapsed / codeCollapsed 状態を収集する。 */
export function collectCollapsedStates(doc: ProseMirrorNode): CollapsedState[] {
  const states: CollapsedState[] = [];
  const counters: Record<string, number> = {};
  doc.descendants((node) => {
    if (SYNC_TARGET_TYPES.has(node.type.name)) {
      const key = node.type.name;
      counters[key] = (counters[key] || 0) + 1;
      states.push({
        type: key,
        index: counters[key] - 1,
        collapsed: node.attrs.collapsed,
        codeCollapsed: node.attrs.codeCollapsed,
      });
    }
  });
  return states;
}

/** 収集した collapsed 状態を transaction 経由で target doc に適用する。変更があれば true。 */
export function applyCollapsedStates(
  doc: ProseMirrorNode,
  tr: Transaction,
  sourceStates: CollapsedState[],
): boolean {
  const counters: Record<string, number> = {};
  let changed = false;
  doc.descendants((node, pos) => {
    if (SYNC_TARGET_TYPES.has(node.type.name)) {
      const key = node.type.name;
      counters[key] = (counters[key] || 0) + 1;
      const idx = counters[key] - 1;
      const srcState = sourceStates.find((s) => s.type === key && s.index === idx);
      if (!srcState) return;
      let nodeChanged = false;
      const newAttrs: Record<string, unknown> = { ...node.attrs };
      if (srcState.collapsed !== undefined && node.attrs.collapsed !== srcState.collapsed) {
        newAttrs.collapsed = srcState.collapsed;
        nodeChanged = true;
      }
      if (srcState.codeCollapsed !== undefined && node.attrs.codeCollapsed !== srcState.codeCollapsed) {
        newAttrs.codeCollapsed = srcState.codeCollapsed;
        nodeChanged = true;
      }
      if (nodeChanged) {
        tr.setNodeMarkup(pos, undefined, newAttrs);
        changed = true;
      }
    }
  });
  return changed;
}
