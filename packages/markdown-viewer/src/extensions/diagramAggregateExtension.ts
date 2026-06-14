/**
 * diagram（mermaid/plantuml）コードブロックの集計を ProseMirror Plugin state で増分維持する拡張。
 *
 * ツールバー（EditorToolbar）が必要とする `hasDiagrams` / `allDiagramCodeCollapsed` は
 * ドキュメント構造（diagram コードブロックの有無・折りたたみ状態）が変わったときしか変化しない。
 * useEditorState の selector で全トランザクションごとに doc.descendants 全走査するのを避け、
 * diagram コードブロックに触れた step のときだけ再計算し、selector からは O(1) で読み取る。
 */

import { Extension } from "@anytime-markdown/markdown-core";
import type { Fragment, Node as PmNode } from "@anytime-markdown/markdown-pm/model";
import type { EditorState, Transaction } from "@anytime-markdown/markdown-pm/state";
import { Plugin, PluginKey } from "@anytime-markdown/markdown-pm/state";
import { AddMarkStep, RemoveMarkStep, ReplaceAroundStep, ReplaceStep } from "@anytime-markdown/markdown-pm/transform";

export interface DiagramAggregate {
  /** mermaid/plantuml コードブロックが 1 つ以上存在するか */
  hasDiagrams: boolean;
  /** 全 diagram コードブロックが折りたたまれているか（diagram が無い場合は true） */
  allDiagramCodeCollapsed: boolean;
}

export const DEFAULT_AGGREGATE: DiagramAggregate = {
  hasDiagrams: false,
  allDiagramCodeCollapsed: true,
};

/** diagram としてレンダリングされるコードブロックの言語集合（single source of truth） */
export const DIAGRAM_LANGUAGES = new Set(["mermaid", "plantuml", "anytime-graph"]);

export const diagramAggregatePluginKey = new PluginKey<DiagramAggregate>("diagramAggregate");

/** コードブロックの言語が diagram（mermaid/plantuml）か */
export function isDiagramLanguage(language: string): boolean {
  return DIAGRAM_LANGUAGES.has(language.toLowerCase());
}

export function isDiagramCodeBlock(node: PmNode): boolean {
  return node.type.name === "codeBlock" && isDiagramLanguage(String(node.attrs.language || ""));
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

/** フラグメントに diagram コードブロックが含まれるか（非 diagram codeBlock の中身は無視） */
function fragmentHasDiagram(content: Fragment): boolean {
  let found = false;
  content.descendants((node) => {
    if (found) return false;
    if (node.type.name === "codeBlock") {
      if (isDiagramCodeBlock(node)) found = true;
      return false; // codeBlock 内には降りない
    }
    return undefined;
  });
  return found;
}

/** 旧ドキュメントの変更レンジに diagram コードブロックが含まれるか */
function rangeHasDiagram(step: ReplaceStep | ReplaceAroundStep, docBefore: PmNode): boolean {
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
  return touched;
}

/**
 * トランザクションの step が diagram コードブロックに触れたか判定する。
 *
 * - マーク変更（太字等）は diagram 集計に無関係 → スキップ
 * - Replace 系: 挿入スライス（挿入・setNodeMarkup 後のノード）と旧レンジ（削除・言語変更）を検査
 * - attr / node-mark 系（pos を持つ）: 対象ノードが diagram codeBlock か
 * - 未知の step: 安全側で再計算する（誤スキップで集計が古く残るより安全）
 *
 * プレーンテキスト編集・非 diagram コードブロック内の編集では false を返す。
 */
export function stepsTouchCodeBlock(tr: Transaction): boolean {
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i];
    const docBefore = tr.docs[i] ?? tr.before;

    if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) continue;

    if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
      // 挿入スライス（通常小さい）を先に、続いて旧レンジを検査
      if (fragmentHasDiagram(step.slice.content)) return true;
      if (rangeHasDiagram(step, docBefore)) return true;
      continue;
    }

    // attr / node-mark 系 step（AttrStep など pos を持つ）の対象ノード
    const pos = (step as { pos?: number }).pos;
    if (typeof pos === "number") {
      const node = docBefore.nodeAt(pos);
      if (node && isDiagramCodeBlock(node)) return true;
      continue;
    }

    // pos も slice も持たない未知 step → 安全側で再計算をトリガー
    return true;
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
