"use client";

import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper, useEditorState } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useTheme } from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import CodeOffIcon from "@mui/icons-material/CodeOff";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import SchemaIcon from "@mui/icons-material/Schema";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import DOMPurify from "dompurify";
import { useTranslations } from "next-intl";
import { usePlantUmlToolbar } from "./types";
import { useEditorSettingsContext } from "./useEditorSettings";
import { useMermaidRender, SVG_SANITIZE_CONFIG, detectMermaidType } from "./hooks/useMermaidRender";
import { usePlantUmlRender } from "./hooks/usePlantUmlRender";
import { useDiagramCapture } from "./hooks/useDiagramCapture";
import { CodeBlockFullscreenDialog } from "./components/CodeBlockFullscreenDialog";
import { DiagramFullscreenDialog } from "./components/DiagramFullscreenDialog";
import { MermaidSamplePopover } from "./components/MermaidSamplePopover";
import { useZoomPan } from "./hooks/useZoomPan";
import { useTextareaSearch } from "./hooks/useTextareaSearch";

const pumlIconSx = { fontSize: 16 };

export function CodeBlockNodeView({ editor, node, updateAttributes, getPos }: NodeViewProps) {
  const theme = useTheme();
  const t = useTranslations("MarkdownEditor");
  const isDark = theme.palette.mode === "dark";
  const language = node.attrs.language;
  const isMermaid = language === "mermaid";
  const isPlantUml = language === "plantuml";
  const isDiagram = isMermaid || isPlantUml;
  const settings = useEditorSettingsContext();
  const { setSampleAnchorEl } = usePlantUmlToolbar();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const allCollapsed = !!node.attrs.collapsed;
  const codeCollapsed = !!node.attrs.codeCollapsed;
  const toggleAllCollapsed = useCallback(() => updateAttributes({ collapsed: !allCollapsed }), [allCollapsed, updateAttributes]);
  const [mermaidSampleAnchorEl, setMermaidSampleAnchorEl] = useState<HTMLElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fsCodeVisible, setFsCodeVisible] = useState(true);
  const [fsCode, setFsCode] = useState("");
  const normalZP = useZoomPan();
  const fsZP = useZoomPan();
  const fsTextareaRef = useRef<HTMLTextAreaElement>(null);

  const isSelected = useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor || typeof getPos !== "function") return false;
      const pos = getPos();
      if (pos == null) return false;
      const from = ctx.editor.state.selection.from;
      return from >= pos && from <= pos + node.nodeSize;
    },
  });

  const code = node.textContent;

  const { svg, error: mermaidError, setError: setMermaidError } = useMermaidRender({ code, isMermaid, isDark });
  const {
    plantUmlUrl, error: plantUmlError, plantUmlConsent,
    handlePlantUmlAccept, handlePlantUmlReject, setError: setPlantUmlError,
  } = usePlantUmlRender({ code, isPlantUml, isDark });
  const error = isMermaid ? mermaidError : plantUmlError;

  const handleCapture = useDiagramCapture({ isMermaid, isPlantUml, svg, plantUmlUrl });

  // 全画面オープン時にコードを同期
  useEffect(() => {
    if (fullscreen) setFsCode(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  /** 全画面コードエディタの変更をTipTapノードに反映 */
  const handleFsCodeChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCode = e.target.value;
    setFsCode(newCode);
    if (!editor || typeof getPos !== "function") return;
    const pos = getPos();
    if (pos == null) return;
    const from = pos + 1;
    const to = from + node.content.size;
    editor.chain().command(({ tr }) => {
      if (newCode) {
        tr.replaceWith(from, to, editor.schema.text(newCode));
      } else {
        tr.delete(from, to);
      }
      return true;
    }).run();
  }, [editor, getPos, node.content.size]);

  /** 検索/置換からのテキスト更新（handleFsCodeChangeと同等のTipTapノード同期） */
  const handleFsTextChange = useCallback((newCode: string) => {
    setFsCode(newCode);
    if (!editor || typeof getPos !== "function") return;
    const pos = getPos();
    if (pos == null) return;
    const from = pos + 1;
    const to = from + node.content.size;
    editor.chain().command(({ tr }) => {
      if (newCode) {
        tr.replaceWith(from, to, editor.schema.text(newCode));
      } else {
        tr.delete(from, to);
      }
      return true;
    }).run();
  }, [editor, getPos, node.content.size]);

  const fsSearch = useTextareaSearch(fsTextareaRef, fsCode, handleFsTextChange);

  /** コードブロック（PlantUML / Mermaid / 通常）を削除 */
  const handleDeleteBlock = useCallback(() => {
    if (!editor || typeof getPos !== "function") return;
    const pos = getPos();
    if (pos == null) return;
    const from = pos;
    const to = pos + node.nodeSize;
    editor.chain().focus().command(({ tr }) => { tr.delete(from, to); return true; }).run();
  }, [editor, getPos, node.nodeSize]);

  // Regular code block
  if (!isDiagram) {
    const codeLabel = language ? `Code (${language})` : "Code";
    return (
      <NodeViewWrapper>
        <Box sx={{
          border: 1, borderRadius: 1, overflow: "hidden", my: 1,
          borderColor: (allCollapsed || isSelected) ? "divider" : "transparent",
          ...(!allCollapsed && !isSelected && {
            "& > [data-block-toolbar]": {
              maxHeight: 0, opacity: 0, py: 0, overflow: "hidden",
            },
          }),
        }}>
          <Box
            data-block-toolbar=""
            sx={{ bgcolor: "action.hover", px: 0.75, py: 0.25, display: "flex", alignItems: "center", gap: 0.25 }}
            contentEditable={false}
          >
            {/* Drag handle */}
            <Box
              data-drag-handle=""
              sx={{ cursor: "grab", display: "flex", alignItems: "center", opacity: 0.5, "&:hover": { opacity: 1 } }}
            >
              <DragIndicatorIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            </Box>
            {/* Collapse/Expand */}
            <Tooltip title={allCollapsed ? t("unfoldAll") : t("foldAll")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={toggleAllCollapsed} aria-label={allCollapsed ? t("unfoldAll") : t("foldAll")}>
                {allCollapsed ? <UnfoldMoreIcon sx={{ fontSize: 16, color: "text.secondary" }} /> : <UnfoldLessIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
              </IconButton>
            </Tooltip>
            {/* Fullscreen */}
            {!allCollapsed && (
              <Tooltip title={t("fullscreen")} placement="top">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setFullscreen(true)} aria-label={t("fullscreen")}>
                  <FullscreenIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </IconButton>
              </Tooltip>
            )}
            {/* Label */}
            <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
              {codeLabel}
            </Typography>

            <Box sx={{ flex: 1 }} />

            {!allCollapsed && (<>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

              {/* Delete */}
              <Tooltip title={t("delete")} placement="top">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setDeleteDialogOpen(true)} aria-label={t("delete")}>
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </>)}
          </Box>
          {/* Code body */}
          <Box
            component="pre"
            spellCheck={false}
            sx={allCollapsed
              ? { position: "absolute", width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" }
              : { m: 0, p: 1.5, fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, bgcolor: isDark ? "grey.900" : "grey.50", overflow: "auto", maxHeight: 400 }
            }
          >
            {/* @ts-expect-error Tiptap NodeViewContent as prop type is too restrictive */}
            <NodeViewContent as="code" />
          </Box>
        </Box>
        {/* Fullscreen dialog */}
        <CodeBlockFullscreenDialog
          open={fullscreen}
          onClose={() => { fsSearch.reset(); setFullscreen(false); }}
          label={codeLabel}
          fsCode={fsCode}
          onFsCodeChange={handleFsCodeChange}
          fsTextareaRef={fsTextareaRef}
          fsSearch={fsSearch}
          t={t}
        />
        <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
          <DialogTitle>{t("delete")}</DialogTitle>
          <DialogContent><Typography>{t("clearConfirm")}</Typography></DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)}>{t("cancel")}</Button>
            <Button color="error" variant="contained" onClick={() => { setDeleteDialogOpen(false); handleDeleteBlock(); }}>{t("delete")}</Button>
          </DialogActions>
        </Dialog>
      </NodeViewWrapper>
    );
  }

  const label = isMermaid ? "Mermaid" : "PlantUML";

  return (
    <NodeViewWrapper>
      <Box sx={{
        border: 1, borderRadius: 1, overflow: "hidden", my: 1,
        borderColor: (allCollapsed || fullscreen || isSelected) ? "divider" : "transparent",
        ...(!allCollapsed && !fullscreen && !isSelected && {
          "& > [data-block-toolbar]": {
            maxHeight: 0, opacity: 0, py: 0, overflow: "hidden",
          },
        }),
      }}>
        <Box
          data-block-toolbar=""
          sx={{ bgcolor: "action.hover", px: 0.75, py: 0.25, display: "flex", alignItems: "center", gap: 0.25 }}
          contentEditable={false}
        >
          {/* Drag handle (hidden in fullscreen) */}
          {!fullscreen && (
            <Box
              data-drag-handle=""
              role="button"
              tabIndex={0}
              aria-roledescription="drag"
              aria-label={t("dragHandle")}
              sx={{ cursor: "grab", display: "flex", alignItems: "center", opacity: 0.5, "&:hover, &:focus-visible": { opacity: 1 }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", borderRadius: 0.5 } }}
            >
              <DragIndicatorIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            </Box>
          )}
          {/* All Collapse/Expand (hidden in fullscreen) */}
          {!fullscreen && (
            <Tooltip title={allCollapsed ? t("unfoldAll") : t("foldAll")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={toggleAllCollapsed} aria-label={allCollapsed ? t("unfoldAll") : t("foldAll")}>
                {allCollapsed ? <UnfoldMoreIcon sx={{ fontSize: 16, color: "text.secondary" }} /> : <UnfoldLessIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
              </IconButton>
            </Tooltip>
          )}

          {/* Fullscreen toggle (before label) */}
          {!allCollapsed && (svg || plantUmlUrl) && (
            <Tooltip title={fullscreen ? t("close") : t("fullscreen")} placement="top">
              <IconButton
                size="small"
                onClick={() => { if (fullscreen) { fsSearch.reset(); setFullscreen(false); } else { fsZP.reset(); setFullscreen(true); } }}
                sx={{ p: 0.25 }}
                aria-label={fullscreen ? t("close") : t("fullscreen")}
              >
                {fullscreen ? <FullscreenExitIcon sx={{ fontSize: 16, color: "text.secondary" }} /> : <FullscreenIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
              </IconButton>
            </Tooltip>
          )}

          {/* Label */}
          <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", mr: 0.5 }}>
            {label}
          </Typography>

          {!allCollapsed && (
            <>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

              {/* Zoom */}
              <ToggleButtonGroup size="small" sx={{ height: 24 }}>
                <ToggleButton value="zoomOut" aria-label={t("zoomOut")} sx={{ px: 0.5, py: 0.125 }} onClick={normalZP.zoomOut}>
                  <Tooltip title={t("zoomOut")} placement="top">
                    <ZoomOutIcon sx={{ fontSize: 16 }} />
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="zoomIn" aria-label={t("zoomIn")} sx={{ px: 0.5, py: 0.125 }} onClick={normalZP.zoomIn}>
                  <Tooltip title={t("zoomIn")} placement="top">
                    <ZoomInIcon sx={{ fontSize: 16 }} />
                  </Tooltip>
                </ToggleButton>
                {normalZP.isDirty && (
                  <ToggleButton value="zoomReset" aria-label={t("zoomReset")} sx={{ px: 0.5, py: 0.125 }} onClick={normalZP.reset}>
                    <Tooltip title={t("zoomReset")} placement="top">
                      <RestartAltIcon sx={{ fontSize: 16 }} />
                    </Tooltip>
                  </ToggleButton>
                )}
              </ToggleButtonGroup>
              <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 36, textAlign: "center", fontSize: "0.7rem" }}>
                {Math.round(normalZP.zoom * 100)}%
              </Typography>

              <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

              {/* Mermaid サンプル挿入 */}
              {isMermaid && (
                <Tooltip title={t("insertSample")} placement="top">
                  <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => setMermaidSampleAnchorEl(e.currentTarget)} aria-label={t("insertSample")}>
                    <SchemaIcon sx={pumlIconSx} />
                  </IconButton>
                </Tooltip>
              )}

              {/* PlantUML サンプル挿入 */}
              {isPlantUml && (
                <Tooltip title={t("insertSample")}>
                  <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => setSampleAnchorEl(e.currentTarget)} aria-label={t("insertSample")}>
                    <SchemaIcon sx={pumlIconSx} />
                  </IconButton>
                </Tooltip>
              )}

              <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
            </>
          )}

          <Box sx={{ flex: 1 }} />

          {/* Collapse/Expand (code only, right-aligned) */}
          {!allCollapsed && (
            <>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
              <Tooltip title={codeCollapsed ? t("diagramCodeShow") : t("diagramCodeHide")} placement="top">
                <IconButton
                  size="small"
                  onClick={() => updateAttributes({ codeCollapsed: !codeCollapsed })}
                  sx={{ p: 0.25 }}
                  aria-label={codeCollapsed ? t("diagramCodeShow") : t("diagramCodeHide")}
                >
                  {codeCollapsed
                    ? <CodeIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                    : <CodeOffIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
                </IconButton>
              </Tooltip>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
            </>
          )}

          {/* Capture (hidden when collapsed, shown when diagram exists) */}
          {!allCollapsed && (svg || plantUmlUrl) && (
            <Tooltip title={t("capture")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCapture} aria-label={t("capture")}>
                <PhotoCameraIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              </IconButton>
            </Tooltip>
          )}

          {/* Delete (hidden when collapsed) */}
          {!allCollapsed && isMermaid && (
            <Tooltip title={t("delete")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setDeleteDialogOpen(true)} aria-label={t("delete")}>
                <DeleteOutlineIcon sx={pumlIconSx} />
              </IconButton>
            </Tooltip>
          )}
          {!allCollapsed && isPlantUml && (
            <Tooltip title={t("delete")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setDeleteDialogOpen(true)} aria-label={t("delete")}>
                <DeleteOutlineIcon sx={pumlIconSx} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        {/* Code editor - always in DOM for TipTap, hidden via CSS when allCollapsed */}
        <Box sx={allCollapsed ? { position: "absolute", width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" } : {}}>
          <Box
            component="pre"
            sx={{
              m: 0, p: 1.5, fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, bgcolor: isDark ? "grey.900" : "grey.50",
              maxHeight: codeCollapsed ? 0 : 200, overflow: codeCollapsed ? "hidden" : "auto",
              py: codeCollapsed ? 0 : 1.5, px: codeCollapsed ? 0 : 1.5,
              opacity: codeCollapsed ? 0 : 1, transition: "max-height 0.2s, padding 0.2s, opacity 0.15s",
              "@media (prefers-reduced-motion: reduce)": { transition: "none" },
            }}
          >
            {/* @ts-expect-error Tiptap NodeViewContent as prop type is too restrictive */}
            <NodeViewContent as="code" />
          </Box>
        </Box>
        {!allCollapsed && (
          <>
            {isMermaid && svg && (
              <Box
                role="img"
                aria-label={t(detectMermaidType(code))}
                sx={{ overflow: "hidden", bgcolor: "background.paper", cursor: "grab", "&:active": { cursor: "grabbing" } }}
                contentEditable={false}
                onPointerDown={normalZP.handlePointerDown}
                onPointerMove={normalZP.handlePointerMove}
                onPointerUp={normalZP.handlePointerUp}
                onWheel={normalZP.handleWheel}
              >
                <Box
                  sx={{ p: 2, display: "flex", justifyContent: "center", transform: `translate(${normalZP.pan.x}px, ${normalZP.pan.y}px) scale(${normalZP.zoom})`, transformOrigin: "top center", transition: normalZP.isPanningRef.current ? "none" : "transform 0.15s", "@media (prefers-reduced-motion: reduce)": { transition: "none" }, pointerEvents: "none" }}
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg, SVG_SANITIZE_CONFIG) }}
                />
              </Box>
            )}
            {isPlantUml && plantUmlConsent !== "accepted" && (
              <Alert
                severity="warning"
                icon={<WarningAmberIcon />}
                contentEditable={false}
                sx={{ m: 1 }}
                action={
                  plantUmlConsent === "pending" ? (
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <Button size="small" color="inherit" onClick={handlePlantUmlReject}>{t("plantumlReject")}</Button>
                      <Button size="small" variant="contained" color="warning" onClick={handlePlantUmlAccept}>{t("plantumlAccept")}</Button>
                    </Box>
                  ) : undefined
                }
              >
                {t("plantumlExternalWarning")}
              </Alert>
            )}
            {isPlantUml && plantUmlUrl && (
              <Box
                sx={{ overflow: "hidden", bgcolor: isDark ? "grey.900" : "background.paper", cursor: "grab", "&:active": { cursor: "grabbing" } }}
                contentEditable={false}
                onPointerDown={normalZP.handlePointerDown}
                onPointerMove={normalZP.handlePointerMove}
                onPointerUp={normalZP.handlePointerUp}
                onWheel={normalZP.handleWheel}
              >
                <Box sx={{ p: 2, display: "flex", justifyContent: "center", transform: `translate(${normalZP.pan.x}px, ${normalZP.pan.y}px) scale(${normalZP.zoom})`, transformOrigin: "top center", transition: normalZP.isPanningRef.current ? "none" : "transform 0.15s", "@media (prefers-reduced-motion: reduce)": { transition: "none" }, pointerEvents: "none" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={plantUmlUrl} alt={t("plantUmlDiagram")} style={{ maxWidth: "100%" }} />
                </Box>
              </Box>
            )}
            {error && (
              <Typography variant="caption" sx={{ p: 1.5, color: "error.main", display: "block" }} contentEditable={false}>
                {error}
              </Typography>
            )}
          </>
        )}
      </Box>
      {/* Fullscreen dialog */}
      <DiagramFullscreenDialog
        open={fullscreen}
        onClose={() => { fsSearch.reset(); setFullscreen(false); }}
        label={label}
        isMermaid={isMermaid}
        isPlantUml={isPlantUml}
        svg={svg}
        plantUmlUrl={plantUmlUrl}
        code={code}
        fsCode={fsCode}
        onFsCodeChange={handleFsCodeChange}
        fsTextareaRef={fsTextareaRef}
        fsSearch={fsSearch}
        fsCodeVisible={fsCodeVisible}
        onToggleFsCodeVisible={() => setFsCodeVisible((v) => !v)}
        fsZP={fsZP}
        t={t}
      />
      {/* Mermaid サンプル選択 Popover */}
      <MermaidSamplePopover
        anchorEl={mermaidSampleAnchorEl}
        onClose={() => setMermaidSampleAnchorEl(null)}
        editor={editor}
        t={t}
      />
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t("delete")}</DialogTitle>
        <DialogContent><Typography>{t("clearConfirm")}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t("cancel")}</Button>
          <Button color="error" variant="contained" onClick={() => { setDeleteDialogOpen(false); handleDeleteBlock(); }}>{t("delete")}</Button>
        </DialogActions>
      </Dialog>
    </NodeViewWrapper>
  );
}
