/**
 * diagram（mermaid/plantuml）コードブロックの集計を ProseMirror Plugin state で増分維持する拡張。
 *
 * ツールバー（EditorToolbar）が必要とする `hasDiagrams` / `allDiagramCodeCollapsed` は
 * ドキュメント構造（diagram コードブロックの有無・折りたたみ状態）が変わったときしか変化しない。
 * useEditorState の selector で全トランザクションごとに doc.descendants 全走査するのを避け、
 * diagram コードブロックに触れた step のときだけ再計算し、selector からは O(1) で読み取る。
 */

import { Extension } from "@anytime-markdown/markdown-core";
import type { Node as PmNode } from "@anytime-markdown/markdown-pm/model";
import type { EditorState, Transaction } from "@anytime-markdown/markdown-pm/state";
import { Plugin, PluginKey } from "@anytime-markdown/markdown-pm/state";

export interface DiagramAggregate {
  /** mermaid/plantuml コードブロックが 1 つ以上存在するか */
  hasDiagrams: boolean;
  /** 全 diagram コードブロックが折りたたまれているか（diagram が無い場合は true） */
  allDiagramCodeCollapsed: boolean;
}

const DEFAULT_AGGREGATE: DiagramAggregate = {
  hasDiagrams: false,
  allDiagramCodeCollapsed: true,
};

export const diagramAggregatePluginKey = new PluginKey<DiagramAggregate>("diagramAggregate");

function isDiagramCodeBlock(node: PmNode): boolean {
  if (node.type.name !== "codeBlock") return false;
  const lang = String(node.attrs.language || "").toLowerCase();
  return lang === "mermaid" || lang === "plantuml";
}

/** ドキュメント全体から diagram 集計を計算する（codeBlock 内のテキストには降りない） */
export function computeDiagramAggregate(doc: PmNode): DiagramAggregate {
  let hasDiagrams = false;
  let allDiagramCodeCollapsed = true;
  doc.descendants((node) => {
    if (node.type.name === "codeBlock") {
      if (isDiagramCodeBlock(node)) {
        hasDiagrams = true;
        if (!node.attrs.codeCollapsed) allDiagramCodeCollapsed = false;
      }
      return false; // codeBlock 内のテキストには降りない
    }
    return undefined; // 容器ブロックのみ降りる
  });
  return { hasDiagrams, allDiagramCodeCollapsed };
}

/** node とその子に diagram コードブロックが含まれるか（非 diagram codeBlock の中身は無視） */
function containsDiagram(fragmentRoot: PmNode): boolean {
  let found = false;
  fragmentRoot.descendants((node) => {
    if (found) return false;
    if (node.type.name === "codeBlock") {
      if (isDiagramCodeBlock(node)) found = true;
      return false; // codeBlock 内には降りない
    }
    return undefined;
  });
  return found;
}

/**
 * トランザクションの step が diagram コードブロックに触れたか判定する。
 * - 旧ドキュメントの変更レンジに diagram codeBlock が含まれる（削除・attr/言語変更）
 * - 挿入スライスに diagram codeBlock が含まれる（挿入・setNodeMarkup 後のノード）
 * - attr 系 step の対象ノードが diagram codeBlock（AttrStep 等への安全側フォールバック）
 *
 * プレーンテキスト編集・非 diagram コードブロック内の編集・マーク変更では false を返す。
 */
export function stepsTouchCodeBlock(tr: Transaction): boolean {
  const steps = tr.steps;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const docBefore = tr.docs[i] ?? tr.before;

    // 1. 旧ドキュメントの変更レンジ
    let touched = false;
    step.getMap().forEach((oldStart, oldEnd) => {
      if (touched) return;
      const from = Math.max(0, Math.min(oldStart, docBefore.content.size));
      const to = Math.max(from, Math.min(oldEnd, docBefore.content.size));
      docBefore.nodesBetween(from, to, (node) => {
        if (touched) return false;
        if (node.type.name === "codeBlock") {
          if (isDiagramCodeBlock(node)) touched = true;
          return false;
        }
        return undefined;
      });
    });
    if (touched) return true;

    // 2. 挿入スライス
    const slice = (step as { slice?: { content?: PmNode } }).slice;
    if (slice?.content && containsDiagram(slice.content)) return true;

    // 3. attr 系 step（pos を持つ）の対象ノード（AttrStep 等へのフォールバック）
    const pos = (step as { pos?: number }).pos;
    if (typeof pos === "number") {
      const node = docBefore.nodeAt(pos);
      if (node && isDiagramCodeBlock(node)) return true;
    }
  }
  return false;
}

export function createDiagramAggregatePlugin(): Plugin<DiagramAggregate> {
  return new Plugin<DiagramAggregate>({
    key: diagramAggregatePluginKey,
    state: {
      init: (_config, state) => computeDiagramAggregate(state.doc),
      apply: (tr, value, _oldState, newState) => {
        if (!tr.docChanged) return value; // 選択のみ → 再計算しない
        if (!stepsTouchCodeBlock(tr)) return value; // diagram に無関係 → 再計算しない
        const next = computeDiagramAggregate(newState.doc);
        // 値が同一なら参照を維持して下流（useEditorState）の再描画も抑制
        return next.hasDiagrams === value.hasDiagrams
          && next.allDiagramCodeCollapsed === value.allDiagramCodeCollapsed
          ? value
          : next;
      },
    },
  });
}

/** EditorState から diagram 集計を取得する（未登録時はデフォルトを返す） */
export function getDiagramAggregate(state: EditorState): DiagramAggregate {
  return diagramAggregatePluginKey.getState(state) ?? DEFAULT_AGGREGATE;
}

export const DiagramAggregateExtension = Extension.create({
  name: "diagramAggregate",
  addProseMirrorPlugins() {
    return [createDiagramAggregatePlugin()];
  },
});
