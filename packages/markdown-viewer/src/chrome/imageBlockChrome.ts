import type { Editor } from "@anytime-markdown/markdown-core";

import { getEditorStorage } from "../types";
import { parseAnnotations } from "../types/imageAnnotation";
import { createBlockChromeAnchor, createSelectedBlockTracker } from "./blockChrome";
import {
  ICON,
  createToolbarContainer,
  mkDivider,
  mkDragHandle,
  mkIconButton,
  mkLabel,
  mkSpacer,
  svgIcon,
} from "./vanillaToolbar";

/**
 * image ブロックの編集 chrome を **React なし**で提供する vanilla コントローラ
 * （Phase 3 / ホスト隔離・E 横展開）。
 *
 * 選択追従・配置・インラインツールバー（drag-handle / label / 警告 / edit / url /
 * annotate / delete）を素 DOM で構成し、crop / annotation / screen capture の各
 * ダイアログ（React・重量 UI）は host（{@link ImageDialogHost}）が intent を受けて
 * 表示する。url 編集は集中管理（`editor.storage.image.onEditImage` → useEditorDialogs）
 * へ vanilla から直接委譲する。テーマは `--am-color-*` CSS 変数で追従する。
 */

export interface ImageBlockChromeCallbacks {
  t: (key: string) => string;
  /** crop 編集 intent（host が crop ダイアログを開く）。 */
  onEditCrop: (pos: number, ctx: { src: string }) => void;
  /** 注釈 intent（host が annotation ダイアログを開く）。annotations は raw JSON 文字列。 */
  onAnnotate: (pos: number, ctx: { src: string; annotations: string | null }) => void;
  /** 削除 intent（host が確認ダイアログを開く）。 */
  onDelete: (pos: number) => void;
}

/**
 * image ブロックの vanilla chrome を生成する。戻り値は破棄関数。
 */
export function createImageBlockChrome(
  editor: Editor,
  cb: ImageBlockChromeCallbacks,
): () => void {
  const anchor = createBlockChromeAnchor();
  let currentPos = -1;

  const readNode = () =>
    currentPos >= 0 ? editor.state.doc.nodeAt(currentPos) : null;

  // --- インラインツールバー ---
  const toolbar = createToolbarContainer(cb.t("image"));

  // 警告（alt 未設定時のみ表示）。
  const warning = svgIcon(ICON.warning);
  const warningWrap = document.createElement("span");
  warningWrap.setAttribute("data-image-alt-warning", "");
  warningWrap.title = cb.t("imageNoAltWarning");
  warningWrap.style.cssText =
    "display:none;align-items:center;color:var(--am-color-warning-main);";
  warningWrap.appendChild(warning);

  const editBtn = mkIconButton(cb.t("edit"), ICON.edit, () => {
    const node = readNode();
    if (!node) return;
    cb.onEditCrop(currentPos, { src: (node.attrs.src as string) ?? "" });
  });
  const urlBtn = mkIconButton(cb.t("imageUrl"), ICON.link, () => {
    const node = readNode();
    if (!node) return;
    const onEdit = getEditorStorage(editor).image?.onEditImage as
      | ((d: { pos: number; src: string; alt: string }) => void)
      | undefined;
    onEdit?.({
      pos: currentPos,
      src: (node.attrs.src as string) ?? "",
      alt: (node.attrs.alt as string) ?? "",
    });
  });
  const annotateBtn = mkIconButton(cb.t("annotate"), ICON.annotate, () => {
    const node = readNode();
    if (!node) return;
    cb.onAnnotate(currentPos, {
      src: (node.attrs.src as string) ?? "",
      annotations: (node.attrs.annotations as string | null) ?? null,
    });
  });
  const deleteBtn = mkIconButton(cb.t("delete"), ICON.delete, () => {
    if (currentPos >= 0) cb.onDelete(currentPos);
  });

  toolbar.append(
    mkDragHandle(cb.t("dragHandle")),
    mkLabel(cb.t("image")),
    warningWrap,
    mkDivider(),
    editBtn,
    urlBtn,
    annotateBtn,
    mkSpacer(),
    deleteBtn,
  );
  anchor.el.appendChild(toolbar);

  // node.attrs に応じてツールバーの動的部分（警告表示・注釈アクティブ色）を更新する。
  // alt / annotations が変わらない限りスキップし、scroll 由来の onChange での JSON.parse を避ける。
  let lastAlt: string | undefined;
  let lastAnnStr: string | null | undefined;
  const syncDynamic = (node: ReturnType<typeof readNode>): void => {
    const alt = (node?.attrs.alt as string) ?? "";
    const annStr = (node?.attrs.annotations as string | null) ?? null;
    if (alt === lastAlt && annStr === lastAnnStr) return;
    lastAlt = alt;
    lastAnnStr = annStr;
    warningWrap.style.display = alt ? "none" : "inline-flex";
    annotateBtn.style.color =
      parseAnnotations(annStr).length > 0
        ? "var(--am-color-primary-main)"
        : "var(--am-color-text-secondary)";
  };

  const stop = createSelectedBlockTracker(editor, "image", ({ pos, node, rect }) => {
    currentPos = pos;
    anchor.setRect(editor.isEditable && pos >= 0 ? rect : null);
    if (pos >= 0) syncDynamic(node);
  });

  return () => {
    stop();
    anchor.destroy();
  };
}
