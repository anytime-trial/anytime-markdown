"use client";

import type { Editor } from "@anytime-markdown/markdown-react";
import { useCallback, useState } from "react";

import {
  ChatBubbleOutlineIcon,
  EditIcon,
  ImageIcon,
  LinkIcon,
  ScreenshotMonitorIcon,
  WarningAmberIcon,
} from "../ui/icons";
import { IconButton } from "../ui/IconButton";
import { Tooltip } from "../ui/Tooltip";
import { Divider } from "../ui/Divider";
import {
  DEFAULT_DARK_BG,
  DEFAULT_LIGHT_BG,
  getDivider,
  getPrimaryMain,
  getTextSecondary,
  getWarningMain,
} from "../constants/colors";
import { useIsDark } from "../contexts/ThemeModeContext";
import { useMarkdownT } from "../i18n/context";
import { useSelectedBlock } from "../hooks/useSelectedBlock";
import { getEditorStorage } from "../types";
import {
  parseAnnotations,
  serializeAnnotations,
} from "../types/imageAnnotation";
import { BlockChromeAnchor } from "./BlockChromeAnchor";
import { BlockInlineToolbar } from "./codeblock/BlockInlineToolbar";
import { DeleteBlockDialog } from "./codeblock/DeleteBlockDialog";
import { EditDialogHeader } from "./EditDialogHeader";
import { EditDialogWrapper } from "./EditDialogWrapper";
import { ImageAnnotationDialog } from "./ImageAnnotationDialog";
import { ImageCropTool } from "./ImageCropTool";
import { ScreenCaptureDialog } from "./ScreenCaptureDialog";

/**
 * image ブロックの編集 chrome をページ層で提供する選択駆動オーバーレイ（React）。
 *
 * framework-decoupling Phase 2「反転」設計の chrome 側。content は native
 * {@link createImageBlockNodeView}（React 非依存）が描画し、本コンポーネントが
 * 選択中の image に対しツールバー＋編集ダイアログ（crop / annotation / screen capture）
 * を供給する。選択検出・位置計測・属性更新・削除は {@link useSelectedBlock} に委譲する。
 *
 * PoC スコープ: 単一エディタ・編集モード。compare/merge モード・collapsed・サイズ
 * バッジ・PNG エクスポートは横展開時に補完する（TODO）。URL 編集ダイアログは既存の
 * 集中管理（`editor.storage.image.onEditImage` → useEditorDialogs）へ委譲する。
 */
export function ImageBlockOverlay({ editor }: Readonly<{ editor: Editor | null }>) {
  const t = useMarkdownT("MarkdownEditor");
  const isDark = useIsDark();
  const { pos, node, rect, updateAttrs, deleteBlock } = useSelectedBlock(
    editor,
    "image",
  );
  const [editOpen, setEditOpen] = useState(false);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [screenCaptureOpen, setScreenCaptureOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const src = (node?.attrs.src as string) ?? "";
  const alt = (node?.attrs.alt as string) ?? "";
  const annotations = parseAnnotations(
    (node?.attrs.annotations as string | null) ?? null,
  );

  const handleDelete = useCallback(() => {
    deleteBlock();
    setDeleteOpen(false);
  }, [deleteBlock]);

  const handleEditUrl = useCallback(() => {
    if (!editor || pos < 0) return;
    const onEdit = getEditorStorage(editor).image?.onEditImage as
      | ((d: { pos: number; src: string; alt: string }) => void)
      | undefined;
    onEdit?.({ pos, src, alt });
  }, [editor, pos, src, alt]);

  const handleCrop = useCallback(
    (croppedDataUrl: string) => {
      if (src.startsWith("data:") || !window.__vscode) {
        updateAttrs({ src: croppedDataUrl });
        return;
      }
      window.__vscode.postMessage({
        type: "overwriteImage",
        path: src,
        dataUrl: croppedDataUrl,
      });
      updateAttrs({ src: src.split("?")[0] + "?t=" + Date.now() });
    },
    [src, updateAttrs],
  );

  const showToolbar = !!editor && !!node && editor.isEditable;
  const iconColor = getTextSecondary(isDark);

  return (
    <>
      {showToolbar && (
        <BlockChromeAnchor rect={rect}>
          <BlockInlineToolbar
            label={t("image")}
            onDelete={() => setDeleteOpen(true)}
            extra={
              <>
                {!alt && (
                  <>
                    <Divider orientation="vertical" flexItem style={{ marginLeft: 2, marginRight: 2 }} />
                    <Tooltip title={t("imageNoAltWarning")} placement="top">
                      <WarningAmberIcon fontSize={14} color={getWarningMain(isDark)} />
                    </Tooltip>
                  </>
                )}
                <Divider orientation="vertical" flexItem style={{ marginLeft: 2, marginRight: 2 }} />
                <Tooltip title={t("edit")} placement="top">
                  <IconButton size="xs" onClick={() => setEditOpen(true)} aria-label={t("edit")}>
                    <EditIcon fontSize={16} color={iconColor} />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t("imageUrl")} placement="top">
                  <IconButton size="xs" onClick={handleEditUrl} aria-label={t("imageUrl")}>
                    <LinkIcon fontSize={16} color={iconColor} />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t("annotate")} placement="top">
                  <IconButton size="xs" onClick={() => setAnnotationOpen(true)} aria-label={t("annotate")}>
                    <ChatBubbleOutlineIcon fontSize={16} color={annotations.length > 0 ? getPrimaryMain(isDark) : iconColor} />
                  </IconButton>
                </Tooltip>
              </>
            }
            t={t}
          />
        </BlockChromeAnchor>
      )}

      {editOpen && (
        <EditDialogWrapper
          open={editOpen}
          onClose={() => setEditOpen(false)}
          ariaLabelledBy="image-edit-title"
        >
          <EditDialogHeader
            label={t("image")}
            onClose={() => setEditOpen(false)}
            icon={<ImageIcon fontSize={18} />}
            t={t}
          />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG }}>
            {src && <ImageCropTool src={src} onCrop={handleCrop} t={t} />}
          </div>
          <div style={{ display: "flex", alignItems: "center", padding: "4px 16px", borderTop: `1px solid ${getDivider(isDark)}`, gap: 4 }}>
            <Tooltip title={t("screenCapture")} placement="top">
              <IconButton size="compact" onClick={() => { setEditOpen(false); setScreenCaptureOpen(true); }} aria-label={t("screenCapture")}>
                <ScreenshotMonitorIcon fontSize={18} color={iconColor} />
              </IconButton>
            </Tooltip>
          </div>
        </EditDialogWrapper>
      )}

      <DeleteBlockDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDelete={handleDelete}
        t={t}
      />
      {annotationOpen && (
        <ImageAnnotationDialog
          open={annotationOpen}
          onClose={() => setAnnotationOpen(false)}
          src={src}
          annotations={annotations}
          onSave={(items) => updateAttrs({ annotations: serializeAnnotations(items) })}
          t={t}
        />
      )}
      {screenCaptureOpen && (
        <ScreenCaptureDialog
          open={screenCaptureOpen}
          onClose={() => setScreenCaptureOpen(false)}
          onCapture={(dataUrl) => updateAttrs({ src: dataUrl })}
          t={t}
        />
      )}
    </>
  );
}
