"use client";

import { FiberManualRecordIcon, GifIcon, PauseIcon, PlayArrowIcon } from "../ui/icons";
import { IconButton } from "../ui/IconButton";
import { Tooltip } from "../ui/Tooltip";
import type { NodeViewProps } from "@anytime-markdown/markdown-react";
import { NodeViewWrapper } from "@anytime-markdown/markdown-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useIsDark } from "../contexts/ThemeModeContext";
import { getDivider, getErrorMain, getTextDisabled } from "../constants/colors";
import { HANDLEBAR_CAPTION_FONT_SIZE } from "../constants/dimensions";
import { saveBlob,useBlockCapture } from "../hooks/useBlockCapture";
import { useBlockNodeState } from "../hooks/useBlockNodeState";
import { useMarkdownT } from "../i18n/context";
import type { GifSettings } from "../utils/gifEncoder";
import { Divider } from "../ui/Divider";
import { Text } from "../ui/Text";
import { BlockInlineToolbar } from "./codeblock/BlockInlineToolbar";
import { DeleteBlockDialog } from "./codeblock/DeleteBlockDialog";
import { GifPlayerDialog } from "./GifPlayerDialog";
import { GifRecorderDialog } from "./GifRecorderDialog";
import styles from "./GifNodeView.module.css";

// --- Extracted helper: capture GIF blob from ref or fetch ---
async function captureGifBlob(
  gifBlobRef: React.RefObject<Blob | null>,
  src: string,
  alt: string,
  pngCapture: () => Promise<void>,
): Promise<void> {
  const gifFileName = (alt || "animation").replace(/\.gif$/, "") + ".gif";

  if (gifBlobRef.current) {
    await saveBlob(gifBlobRef.current, gifFileName);
    return;
  }

  const imgSrc = src || "";
  if (imgSrc && (imgSrc.endsWith(".gif") || imgSrc.startsWith("blob:"))) {
    try {
      const res = await fetch(imgSrc);
      const blob = await res.blob();
      const gifBlob = blob.type === "image/gif" ? blob : new Blob([blob], { type: "image/gif" });
      await saveBlob(gifBlob, gifFileName);
      return;
    } catch {
      // フォールバック
    }
  }
  await pngCapture();
}

// --- Extracted helper: toggle GIF playback ---
function toggleGifPlayback(
  imgRef: React.RefObject<HTMLImageElement | null>,
  src: string,
  playing: boolean,
  pausedSrcRef: React.RefObject<string | null>,
  setPlaying: (v: boolean) => void,
): void {
  const img = imgRef.current;
  if (!img || !src) return;
  if (playing) {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      pausedSrcRef.current = canvas.toDataURL("image/png");
      img.src = pausedSrcRef.current;
    }
    setPlaying(false);
  } else {
    const originalSrc = src;
    if (originalSrc.startsWith("blob:")) {
      img.src = originalSrc;
    } else {
      img.src = originalSrc + (originalSrc.includes("?") ? "&" : "?") + "_t=" + Date.now();
    }
    pausedSrcRef.current = null;
    setPlaying(true);
  }
}

// --- Extracted helper: handle record complete ---
function onRecordComplete(
  blob: Blob,
  fileName: string,
  settings: GifSettings,
  gifBlobRef: React.RefObject<Blob | null>,
  setRecorderOpen: (v: boolean) => void,
  updateAttributes: (attrs: Record<string, unknown>) => void,
  requestId: string,
): void {
  setRecorderOpen(false);
  gifBlobRef.current = blob;
  const vscodeApi = window.__vscode;
  if (vscodeApi) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      // requestId で保存結果(imageSaved)をこの GIF ノードに紐付ける。
      // これによりグローバルの画像挿入ハンドラがカーソル位置へ二重挿入するのを防ぐ。
      vscodeApi.postMessage({
        type: "saveClipboardImage",
        dataUrl: reader.result,
        fileName,
        requestId,
      });
    };
    reader.readAsDataURL(blob);
    updateAttributes({ gifSettings: JSON.stringify(settings) });
  } else {
    // data URL を直接使用（blob URL はブラウザコンテキスト固有のため、
    // 他環境へのコピー時に解決できない）
    const reader = new FileReader();
    reader.onload = () => {
      updateAttributes({
        src: reader.result,
        alt: fileName,
        gifSettings: JSON.stringify(settings),
      });
    };
    reader.readAsDataURL(blob);
  }
}

// --- Extracted sub-component: GIF placeholder ---
function GifPlaceholder({ isEditable, isDark, onClick }: Readonly<{ isEditable: boolean; isDark: boolean; onClick: () => void }>) {
  const hoverClass = isEditable
    ? isDark
      ? styles.placeholderHoverDark
      : styles.placeholderHoverLight
    : undefined;
  return (
    <div
      onClick={onClick}
      className={hoverClass}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 32,
        paddingBottom: 32,
        cursor: isEditable ? "pointer" : "default",
        backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
        borderTop: `1px solid ${getDivider(isDark)}`,
      }}
    >
      <GifIcon fontSize={36} color={getTextDisabled(isDark)} style={{ marginBottom: 4 }} />
      <Text variant="caption" style={{ color: getTextDisabled(isDark) }}>
        Click to record GIF
      </Text>
    </div>
  );
}

// --- Extracted sub-component: GIF playback image with overlay ---
function GifPlaybackImage({
  imgRef, src, alt, width, isSelected, playing, onToggle,
}: Readonly<{
  imgRef: React.RefObject<HTMLImageElement | null>;
  src: string;
  alt: string;
  width: string | undefined;
  isSelected: boolean;
  playing: boolean;
  onToggle: () => void;
}>) {
  return (
    <>
      <img
        ref={imgRef}
        src={src}
        alt={alt || "GIF"}
        style={{ width: width || undefined, maxWidth: "100%", height: "auto", display: "block" }}
      />
      {isSelected && (
        <div
          style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            display: "flex",
            gap: 4,
            backgroundColor: "rgba(0,0,0,0.6)",
            borderRadius: 4,
            paddingLeft: 4,
            paddingRight: 4,
          }}
        >
          <IconButton size="xs" onClick={onToggle} className={styles.playbackIconButton} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <PauseIcon fontSize={18} /> : <PlayArrowIcon fontSize={18} />}
          </IconButton>
        </div>
      )}
    </>
  );
}

export function GifNodeView({ editor, node, updateAttributes, getPos }: Readonly<NodeViewProps>) {
  const t = useMarkdownT("MarkdownEditor");
  const isDark = useIsDark();
  const {
    deleteDialogOpen, setDeleteDialogOpen,
    editOpen: _editOpen, setEditOpen: _setEditOpen,
    collapsed, isEditable, isSelected, handleDeleteBlock, showToolbar, isCompareLeft, isCompareLeftEditable,
  } = useBlockNodeState(editor, node, getPos);
  const pngCapture = useBlockCapture(editor, getPos, "gif-block.png");
  const { src, alt, width } = node.attrs;
  const gifBlobRef = useRef<Blob | null>(null);
  // 進行中の GIF 保存リクエストを識別し、imageSaved をこのノードに紐付けるための ID
  const pendingSaveIdRef = useRef<string | null>(null);

  const handleCapture = useCallback(async () => {
    await captureGifBlob(gifBlobRef, src as string, alt as string, pngCapture);
  }, [src, alt, pngCapture]);

  const [recorderOpen, setRecorderOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playing, setPlaying] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const pausedSrcRef = useRef<string | null>(null);

  const togglePlayback = useCallback(() => {
    toggleGifPlayback(imgRef, src as string, playing, pausedSrcRef, setPlaying);
  }, [playing, src]);

  const handleRecordComplete = useCallback(
    (blob: Blob, fileName: string, settings: GifSettings) => {
      const requestId =
        globalThis.crypto?.randomUUID?.() ?? `gif-${fileName}-${performance.now()}`;
      pendingSaveIdRef.current = requestId;
      onRecordComplete(blob, fileName, settings, gifBlobRef, setRecorderOpen, updateAttributes, requestId);
    },
    [updateAttributes],
  );

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // VS Code webview: origin は空文字列または vscode-webview:// スキーム
      // Web: origin は同一オリジン（空文字列）
      if (event.origin && !event.origin.startsWith('vscode-webview://') && event.origin !== globalThis.location?.origin) return;
      const data = event.data;
      // requestId が一致する imageSaved のみをこの GIF ノードの保存結果として処理する。
      // 一致しない imageSaved（通常のペースト画像など）はグローバルハンドラに任せる。
      if (
        data?.type === "imageSaved" &&
        typeof data.requestId === "string" &&
        data.requestId === pendingSaveIdRef.current &&
        typeof data.path === "string" &&
        data.path
      ) {
        pendingSaveIdRef.current = null;
        updateAttributes({ src: data.path });
      }
    };
    globalThis.addEventListener("message", handler);
    return () => globalThis.removeEventListener("message", handler);
  }, [updateAttributes]);

  // autoEditOpen: スラッシュコマンドから作成された場合、即座にレコーダーを開く
  useEffect(() => {
    if (!node.attrs.autoEditOpen || !isEditable) return;
    const rafId = requestAnimationFrame(() => {
      updateAttributes({ autoEditOpen: false });
      setRecorderOpen(true);
    });
    // アンマウント/即時削除時に破棄済み NodeView へのコマンド実行を防ぐ
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlaceholderClick = useCallback(() => {
    if (isEditable) setRecorderOpen(true);
  }, [isEditable]);

  const handleEditClick = useCallback(() => {
    if (src) setPlayerOpen(true);
    else setRecorderOpen(true);
  }, [src]);

  const showBorder = showToolbar || (isCompareLeftEditable && isSelected);

  return (
    <NodeViewWrapper data-drag-handle className="image-node-wrapper">
      {/* Inline view */}
      <div
        className={!showBorder ? styles.rootHideToolbar : undefined}
        style={{
          border: `1px solid ${showBorder ? getDivider(isDark) : "transparent"}`,
          borderRadius: 4,
          overflow: "hidden",
          marginTop: 8,
          marginBottom: 8,
        }}
      >
        {(isEditable || isCompareLeftEditable) && (
          <BlockInlineToolbar
            label="GIF"
            onEdit={!collapsed && !isCompareLeft ? handleEditClick : undefined}
            onDelete={!collapsed && !isCompareLeft ? () => setDeleteDialogOpen(true) : undefined}
            onExport={handleCapture}
            labelOnly={isCompareLeftEditable}
            collapsed={collapsed}
            extra={
              <>
                {!isCompareLeft && isEditable && !collapsed && (
                  <>
                    <Divider orientation="vertical" flexItem style={{ marginLeft: 2, marginRight: 2 }} />
                    <Tooltip title="Record GIF" placement="top">
                      <IconButton size="xs" onClick={() => setRecorderOpen(true)} aria-label="Record GIF">
                        <FiberManualRecordIcon fontSize={16} color={getErrorMain(isDark)} />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
                {src && (
                  <>
                    <Divider orientation="vertical" flexItem style={{ marginLeft: 2, marginRight: 2 }} />
                    <Text variant="caption" style={{ color: getTextDisabled(isDark), fontSize: HANDLEBAR_CAPTION_FONT_SIZE, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                      {src.startsWith("data:") || src.startsWith("blob:") ? "(embedded)" : `(${src})`}
                    </Text>
                  </>
                )}
              </>
            }
            t={t}
          />
        )}
        {/* Content area */}
        {!collapsed && (
          <div contentEditable={false} style={{ position: "relative", lineHeight: 0 }}>
            {src ? (
              <GifPlaybackImage
                imgRef={imgRef}
                src={src}
                alt={alt}
                width={width}
                isSelected={isSelected}
                playing={playing}
                onToggle={togglePlayback}
              />
            ) : (
              <GifPlaceholder isEditable={isEditable} isDark={isDark} onClick={handlePlaceholderClick} />
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <DeleteBlockDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onDelete={handleDeleteBlock}
        t={t}
      />
      {recorderOpen && (
        <GifRecorderDialog
          open={recorderOpen}
          onClose={() => setRecorderOpen(false)}
          onComplete={handleRecordComplete}
        />
      )}
      {playerOpen && src && (
        <GifPlayerDialog
          open={playerOpen}
          onClose={() => setPlayerOpen(false)}
          src={src}
          settings={node.attrs.gifSettings ? JSON.parse(node.attrs.gifSettings as string) : undefined}
        />
      )}
    </NodeViewWrapper>
  );
}
