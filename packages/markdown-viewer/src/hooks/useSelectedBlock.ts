"use client";

import type { Editor } from "@anytime-markdown/markdown-react";
import { useEditorState } from "@anytime-markdown/markdown-react";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";
import { useCallback, useEffect, useState } from "react";

export interface SelectedBlock {
  /** 選択中ブロックの doc 位置。未選択は -1。 */
  pos: number;
  /** 選択中ブロックのノード。未選択は null。 */
  node: PMNode | null;
  /** ツールバー等の chrome 配置用の画面矩形。未選択 / 未計測は null。 */
  rect: DOMRect | null;
  /** 選択中ブロックの属性を更新する（per-NodeView updateAttributes の代替）。 */
  updateAttrs: (attrs: Record<string, unknown>) => void;
  /** 選択中ブロックを削除する。 */
  deleteBlock: () => void;
}

/**
 * `NodeSelection` で選択中の、指定 `nodeTypeName` のブロックを追跡する汎用フック。
 *
 * framework-decoupling Phase 2「反転」設計の scaffolding。各ブロックの編集
 * オーバーレイ（gif / image / table / code …）が共有する選択検出・画面位置計測・
 * 属性更新・削除を一箇所へ集約し、ブロック種別ごとの重複を防ぐ。オーバーレイ側は
 * これを使い、ブロック固有のツールバー・ダイアログだけを実装する。
 */
export function useSelectedBlock(
  editor: Editor | null,
  nodeTypeName: string,
): SelectedBlock {
  const selectedPos =
    useEditorState({
      editor,
      selector: (ctx) => {
        const ed = ctx.editor;
        if (!ed) return -1;
        const sel = ed.state.selection;
        // atom ブロック（gif / image 等）: NodeSelection が対象型ならその pos。
        const nodeSel = sel as { node?: { type: { name: string } }; from: number };
        if (nodeSel.node?.type?.name === nodeTypeName) return nodeSel.from;
        // コンテナブロック（table 等）: セル内 TextSelection を内包する、対象型の祖先ノードの pos。
        const $from = sel.$from;
        if (!$from) return -1;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === nodeTypeName) return $from.before(d);
        }
        return -1;
      },
    }) ?? -1;

  const node =
    editor && selectedPos >= 0 ? editor.state.doc.nodeAt(selectedPos) : null;

  const [rect, setRect] = useState<DOMRect | null>(null);

  const measure = useCallback(() => {
    if (!editor || selectedPos < 0) {
      setRect(null);
      return;
    }
    const dom = editor.view.nodeDOM(selectedPos) as HTMLElement | null;
    const next = dom ? dom.getBoundingClientRect() : null;
    // 同一矩形なら参照を据え置き、scroll 毎の無駄な再レンダーを避ける。
    setRect((prev) =>
      prev &&
      next &&
      prev.top === next.top &&
      prev.left === next.left &&
      prev.width === next.width &&
      prev.height === next.height
        ? prev
        : next,
    );
  }, [editor, selectedPos]);

  useEffect(() => {
    measure();
    if (selectedPos < 0) return;
    globalThis.addEventListener("scroll", measure, true);
    globalThis.addEventListener("resize", measure);
    return () => {
      globalThis.removeEventListener("scroll", measure, true);
      globalThis.removeEventListener("resize", measure);
    };
  }, [measure, selectedPos]);

  const updateAttrs = useCallback(
    (attrs: Record<string, unknown>) => {
      if (!editor || selectedPos < 0) return;
      editor
        .chain()
        .command(({ tr }) => {
          for (const [k, v] of Object.entries(attrs)) {
            tr.setNodeAttribute(selectedPos, k, v);
          }
          return true;
        })
        .run();
    },
    [editor, selectedPos],
  );

  const deleteBlock = useCallback(() => {
    if (!editor || selectedPos < 0) return;
    editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        const n = state.doc.nodeAt(selectedPos);
        if (!n) return false;
        tr.delete(selectedPos, selectedPos + n.nodeSize);
        return true;
      })
      .run();
  }, [editor, selectedPos]);

  return { pos: selectedPos, node, rect, updateAttrs, deleteBlock };
}
