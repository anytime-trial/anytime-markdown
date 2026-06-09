"use client";

import type { Editor } from "@anytime-markdown/markdown-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ImageIcon, ScreenshotMonitorIcon } from "../ui/icons";
import { IconButton } from "../ui/IconButton";
import { Tooltip } from "../ui/Tooltip";
import {
  DEFAULT_DARK_BG,
  DEFAULT_LIGHT_BG,
  getDivider,
  getTextSecondary,
} from "../constants/colors";
import { useIsDark } from "../contexts/ThemeModeContext";
import { useMarkdownT } from "../i18n/context";
import { deleteBlockAt, setBlockAttrs } from "../chrome/blockChrome";
import { createImageBlockChrome } from "../chrome/imageBlockChrome";
import {
  parseAnnotations,
  serializeAnnotations,
} from "../types/imageAnnotation";
import { DeleteBlockDialog } from "./codeblock/DeleteBlockDialog";
import { EditDialogHeader } from "./EditDialogHeader";
import { EditDialogWrapper } from "./EditDialogWrapper";
import { ImageAnnotationDialog } from "./ImageAnnotationDialog";
import { ImageCropTool } from "./ImageCropTool";
import { ScreenCaptureDialog } from "./ScreenCaptureDialog";

/**
 * image ブロックのダイアログ host（Phase 3 / ホスト隔離・E 横展開）。
 *
 * 選択追従・配置・インラインツールバーは React なしの {@link createImageBlockChrome}
 * が担い、本コンポーネントは crop / annotation / screen capture / 削除ダイアログ
 * （React・重量 UI）と VS Code 上書きフローのみを host 側 React として提供する。
 * vanilla chrome からの intent（editCrop / annotate / delete）を受けて開閉する。
 */
export function ImageDialogHost({ editor }: Readonly<{ editor: Editor | null }>) {
  const t = useMarkdownT("MarkdownEditor");
  const isDark = useIsDark();
  const [editOpen, setEditOpen] = useState(false);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [screenCaptureOpen, setScreenCaptureOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [src, setSrc] = useState("");
  const [annotationsStr, setAnnotationsStr] = useState<string | null>(null);
  const targetPosRef = useRef(-1);

  useEffect(() => {
    if (!editor) return;
    const destroy = createImageBlockChrome(editor, {
      t,
      onEditCrop: (pos, ctx) => {
        targetPosRef.current = pos;
        setSrc(ctx.src);
        setEditOpen(true);
      },
      onAnnotate: (pos, ctx) => {
        targetPosRef.current = pos;
        setSrc(ctx.src);
        setAnnotationsStr(ctx.annotations);
        setAnnotationOpen(true);
      },
      onDelete: (pos) => {
        targetPosRef.current = pos;
        setDeleteOpen(true);
      },
    });
    return destroy;
  }, [editor, t]);

  const handleCrop = useCallback(
    (croppedDataUrl: string) => {
      if (!editor) return;
      const pos = targetPosRef.current;
      if (src.startsWith("data:") || !window.__vscode) {
        setBlockAttrs(editor, pos, { src: croppedDataUrl });
        return;
      }
      window.__vscode.postMessage({
        type: "overwriteImage",
        path: src,
        dataUrl: croppedDataUrl,
      });
      setBlockAttrs(editor, pos, { src: src.split("?")[0] + "?t=" + Date.now() });
    },
    [editor, src],
  );

  const handleDelete = useCallback(() => {
    if (editor) deleteBlockAt(editor, targetPosRef.current);
    setDeleteOpen(false);
  }, [editor]);

  const iconColor = getTextSecondary(isDark);
  const annotations = parseAnnotations(annotationsStr);

  return (
    <>
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
          onSave={(items) => {
            if (editor)
              setBlockAttrs(editor, targetPosRef.current, {
                annotations: serializeAnnotations(items),
              });
          }}
          t={t}
        />
      )}
      {screenCaptureOpen && (
        <ScreenCaptureDialog
          open={screenCaptureOpen}
          onClose={() => setScreenCaptureOpen(false)}
          onCapture={(dataUrl) => {
            if (editor) setBlockAttrs(editor, targetPosRef.current, { src: dataUrl });
          }}
          t={t}
        />
      )}
    </>
  );
}
