import type { Editor } from "@anytime-markdown/markdown-core";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";
import {
  createBlockChromeAnchor,
  createSelectedBlockTracker,
  createToolbarContainer,
  ICON,
  mkDragHandle,
  mkIconButton,
  mkLabel,
  mkSpacer,
  setBlockAttrs,
} from "@anytime-markdown/markdown-viewer";

import { classifyCodeBlock, type CodeBlockKind, CODE_BLOCK_EDIT_INTENT_EVENT } from "./CodeBlockBlockContent";
import { applySelectionCollapse, codeBlockToolbarLabel } from "./codeBlockOverlayHelpers";

/**
 * codeBlock（CodeBlockWithMermaid）の編集 chrome を **React なし**で提供する vanilla
 * コントローラ（Phase 3 / ホスト隔離・E 横展開）。
 *
 * 選択追従・配置・ツールバー（種別別の edit / diagram export / math グラフトグル /
 * delete）を素 DOM で構成し、選択駆動の折畳み（applySelectionCollapse）と autoEditOpen も
 * 担う。全画面編集ダイアログ群と図描画（mermaid/plantuml 描画・zoom・capture）は React
 * フックに深く結合するため host（{@link CodeDialogHost}）が intent / onSelect を受けて担う。
 *
 * グラフトグルは `editor` 属性を直接更新し、その他は intent でホストへ委譲する。
 */

export interface CodeBlockChromeCallbacks {
  t: (key: string) => string;
  /** math グラフトグルを隠すか（host の useEditorFeaturesContext.hideGraph）。 */
  isGraphHidden: () => boolean;
  /** 選択中 codeBlock の pos / node を host へ通知（host の図描画フックが参照する）。 */
  onSelect: (pos: number, node: PMNode | null) => void;
  /** 編集 intent（host が種別別の全画面ダイアログを開く）。 */
  onEdit: (pos: number) => void;
  /** 図 PNG エクスポート intent（host が svg/url から capture）。 */
  onExport: (pos: number) => void;
  /** 図ソース（.mmd/.puml）エクスポート intent。 */
  onExportSource: (pos: number) => void;
  /** 削除 intent。 */
  onDelete: (pos: number) => void;
}

/**
 * codeBlock の vanilla chrome を生成する。戻り値は破棄関数。
 */
export function createCodeBlockChrome(
  editor: Editor,
  cb: CodeBlockChromeCallbacks,
): () => void {
  const anchor = createBlockChromeAnchor();
  let currentPos = -1;
  let prevPos = -1;

  const toolbar = createToolbarContainer("Code");
  // 動的部分（kind 依存ボタン）を入れ替えるためのラッパ。drag/label は据え置き。
  const labelEl = mkLabel("Code");
  const actions = document.createElement("div");
  actions.style.cssText = "display:inline-flex;align-items:center;gap:2px;flex:1;";
  toolbar.append(mkDragHandle(cb.t("dragHandle")), labelEl, actions);
  anchor.el.appendChild(toolbar);

  // ツールバー内容は language / kind / graphEnabled / hideGraph のみで決まる（どのブロックかには
  // 依存しない）。同一キーなら DOM 再構築をスキップし、scroll 由来の onChange での無駄な churn を防ぐ。
  let lastKey = "";
  const rebuildActions = (language: string, node: PMNode | null): CodeBlockKind => {
    const kind = classifyCodeBlock(language);
    const enabled = !!node?.attrs.graphEnabled;
    const hidden = cb.isGraphHidden();
    const key = `${language}|${kind}|${enabled}|${hidden}`;
    if (key === lastKey) return kind;
    lastKey = key;

    labelEl.textContent = codeBlockToolbarLabel(kind, language, cb.t);
    actions.replaceChildren();

    actions.append(
      mkIconButton(cb.t("edit"), ICON.edit, () => {
        if (currentPos >= 0) cb.onEdit(currentPos);
      }),
    );

    // math: グラフ表示トグル（hideGraph でない時のみ）。属性を直接更新する。
    if (kind === "math" && !hidden) {
      const graphBtn = mkIconButton(
        enabled ? cb.t("hideGraph") : cb.t("showGraph"),
        ICON.showChart,
        () => {
          if (currentPos < 0) return;
          const cur = editor.state.doc.nodeAt(currentPos);
          setBlockAttrs(editor, currentPos, { graphEnabled: !cur?.attrs.graphEnabled });
        },
      );
      if (enabled) graphBtn.style.color = "var(--am-color-primary-main)";
      actions.append(graphBtn);
    }

    actions.append(mkSpacer());

    // diagram: PNG / ソースのエクスポート（旧 Menu を 2 ボタンに分解）。
    if (kind === "diagram") {
      const sourceKey =
        language === "mermaid" ? "exportMmd" : language === "anytime-thinking-model" ? "exportGraphSrc" : "exportPuml";
      actions.append(
        mkIconButton(cb.t("exportPng"), ICON.image, () => {
          if (currentPos >= 0) cb.onExport(currentPos);
        }),
        mkIconButton(cb.t(sourceKey), ICON.fileDownload, () => {
          if (currentPos >= 0) cb.onExportSource(currentPos);
        }),
      );
    }

    actions.append(
      mkIconButton(cb.t("delete"), ICON.delete, () => {
        if (currentPos >= 0) cb.onDelete(currentPos);
      }),
    );
    return kind;
  };

  // 編集 intent（native NodeView のダブルクリック）。
  const root = editor.view?.dom;
  const onEditIntent = (): void => {
    if (currentPos >= 0) cb.onEdit(currentPos);
  };
  root?.addEventListener(CODE_BLOCK_EDIT_INTENT_EVENT, onEditIntent as EventListener);

  const stop = createSelectedBlockTracker(editor, "codeBlock", ({ pos, node, rect }) => {
    currentPos = pos;
    // 選択駆動の折畳み（前ブロック折畳み・新ブロック展開）。
    if (pos !== prevPos) {
      applySelectionCollapse(editor, prevPos, pos);
      prevPos = pos;
    }
    cb.onSelect(pos, node);
    if (pos >= 0) {
      const kind = rebuildActions((node?.attrs.language as string) ?? "", node);
      // autoEditOpen: スラッシュコマンド作成直後に全画面編集（preview 種別のみ）。
      if (node?.attrs.autoEditOpen && editor.isEditable && kind !== "regular") {
        setBlockAttrs(editor, pos, { autoEditOpen: false });
        cb.onEdit(pos);
      }
    }
    anchor.setRect(editor.isEditable && pos >= 0 ? rect : null);
  });

  return () => {
    stop();
    root?.removeEventListener(CODE_BLOCK_EDIT_INTENT_EVENT, onEditIntent as EventListener);
    anchor.destroy();
  };
}
