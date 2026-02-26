"use client";

import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper, useEditorState } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Popover, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
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
import type mermaidAPI from "mermaid";
import plantumlEncoder from "plantuml-encoder";

/** Lazy-load mermaid (~1.5 MB) only when needed */
let mermaidInstance: typeof mermaidAPI | null = null;
async function getMermaid() {
  if (!mermaidInstance) {
    const mod = await import("mermaid");
    mermaidInstance = mod.default;
  }
  return mermaidInstance;
}
import DOMPurify from "dompurify";
import { useTranslations } from "next-intl";
import { usePlantUmlToolbar } from "./types";
import { MERMAID_SAMPLES } from "./constants/samples";
import { useEditorSettingsContext } from "./useEditorSettings";

let mermaidIdCounter = 0;

/** Mermaid SVG用のDOMPurify設定: foreignObject経由のXSSを防止 */
const SVG_SANITIZE_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true, html: true },
  ADD_TAGS: ["foreignObject"] as string[],
  ADD_ATTR: ["xmlns", "style", "class", "requiredExtensions"] as string[],
  FORBID_TAGS: ["script", "iframe", "object", "embed"] as string[],
};

import { PLANTUML_SERVER, PLANTUML_CONSENT_KEY, PLANTUML_DARK_SKINPARAMS } from "./utils/plantumlHelpers";
import { useZoomPan } from "./hooks/useZoomPan";
import { useTextareaSearch } from "./hooks/useTextareaSearch";
import { FsSearchBar } from "./components/FsSearchBar";

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

  const [svg, setSvg] = useState("");
  const [plantUmlUrl, setPlantUmlUrl] = useState("");
  const [error, setError] = useState("");
  const [plantUmlConsent, setPlantUmlConsent] = useState<"pending" | "accepted" | "rejected">(() => {
    if (typeof window === "undefined") return "pending";
    const v = sessionStorage.getItem(PLANTUML_CONSENT_KEY);
    return v === "accepted" || v === "rejected" ? v : "pending";
  });
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
  const [fsSplitPct, setFsSplitPct] = useState(40);
  const [fsDragging, setFsDragging] = useState(false);
  const fsContainerRef = useRef<HTMLDivElement>(null);

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

  const handleCapture = useCallback(async () => {
    try {
      if (isMermaid && svg) {
        const svgEl = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
        const w = parseFloat(svgEl.getAttribute("width") || "800");
        const h = parseFloat(svgEl.getAttribute("height") || "600");
        const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const scale = 2;
          const canvas = document.createElement("canvas");
          canvas.width = w * scale;
          canvas.height = h * scale;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          canvas.toBlob((b) => {
            if (!b) return;
            const a = document.createElement("a");
            a.href = URL.createObjectURL(b);
            a.download = "diagram.png";
            a.click();
            URL.revokeObjectURL(a.href);
          }, "image/png");
        };
        img.src = url;
      } else if (isPlantUml && plantUmlUrl) {
        const pngUrl = plantUmlUrl.replace("/svg/", "/png/");
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = "diagram.png";
        a.click();
      }
    } catch { /* ignore */ }
  }, [isMermaid, isPlantUml, svg, plantUmlUrl]);

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

  // Mermaid rendering
  useEffect(() => {
    if (!isMermaid || !code.trim()) {
      if (isMermaid) { setSvg(""); setError(""); }
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      const mermaid = await getMermaid();
      if (cancelled) return;
      mermaid.initialize({
        startOnLoad: false,
        suppressErrorRendering: true,
        theme: isDark ? "dark" : "default",
      });

      try {
        await mermaid.parse(code);
      } catch (err) {
        if (!cancelled) { setError(`Mermaid: ${err instanceof Error ? err.message : "syntax error"}`); setSvg(""); }
        return;
      }

      if (cancelled) return;
      try {
        const id = `mermaid-${++mermaidIdCounter}`;
        const { svg: rendered } = await mermaid.render(id, code);
        if (!cancelled) { setSvg(rendered); setError(""); }
      } catch (err) {
        if (!cancelled) { setError(`Mermaid: ${err instanceof Error ? err.message : "render error"}`); setSvg(""); }
      }

      document.querySelectorAll('[id^="dmermaid-"]').forEach((el) => el.remove());
    }, 500);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [code, isMermaid, isDark]);

  // PlantUML rendering — gated by user consent
  useEffect(() => {
    if (!isPlantUml || !code.trim() || plantUmlConsent !== "accepted") {
      if (isPlantUml) { setPlantUmlUrl(""); setError(""); }
      return;
    }

    const timer = setTimeout(() => {
      try {
        const startMatch = code.match(/@start(uml|mindmap|wbs|json|yaml)/);
        const diagramType = startMatch ? startMatch[1] : null;
        const needsSkinParam = diagramType === "uml" || diagramType === null;
        let src: string;
        if (diagramType) {
          src = needsSkinParam && isDark ? code.replace(/@startuml/, `@startuml\n${PLANTUML_DARK_SKINPARAMS}`) : code;
        } else {
          src = isDark ? `@startuml\n${PLANTUML_DARK_SKINPARAMS}\n${code}\n@enduml` : `@startuml\n${code}\n@enduml`;
        }
        const encoded = plantumlEncoder.encode(src);
        setPlantUmlUrl(`${PLANTUML_SERVER}/svg/${encoded}`);
        setError("");
      } catch (err) {
        setError(`PlantUML: ${err instanceof Error ? err.message : "encode error"}`);
        setPlantUmlUrl("");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [code, isPlantUml, isDark, plantUmlConsent]);

  const handlePlantUmlAccept = useCallback(() => {
    sessionStorage.setItem(PLANTUML_CONSENT_KEY, "accepted");
    setPlantUmlConsent("accepted");
  }, []);

  const handlePlantUmlReject = useCallback(() => {
    sessionStorage.setItem(PLANTUML_CONSENT_KEY, "rejected");
    setPlantUmlConsent("rejected");
  }, []);

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
        <Dialog
          open={fullscreen}
          onClose={() => { fsSearch.reset(); setFullscreen(false); }}
          fullScreen
          aria-labelledby="codeblock-fullscreen-title"
          slotProps={{ paper: { sx: { bgcolor: settings.editorBg === "grey" && !isDark ? "grey.50" : undefined, display: "flex", flexDirection: "column" } } }}
          onKeyDown={(e: React.KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            if (mod && (e.key === "f" || e.key === "h")) {
              e.preventDefault();
              e.stopPropagation();
              fsSearch.focusSearch();
            }
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 1, borderBottom: 1, borderColor: "divider", position: "relative" }}>
            <DialogTitle id="codeblock-fullscreen-title" sx={{ p: 0, fontSize: "0.875rem", fontWeight: 600, mr: 1 }}>
              {codeLabel}
            </DialogTitle>
            {/* Search & Replace bar */}
            <FsSearchBar search={fsSearch} t={t} />
            <Box sx={{ flex: 1 }} />
            <Tooltip title={t("close")} placement="bottom">
              <IconButton size="small" onClick={() => { fsSearch.reset(); setFullscreen(false); }} sx={{ ml: 1 }} aria-label={t("close")}>
                <CloseIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          </Box>
          <Box
            component="textarea"
            ref={fsTextareaRef}
            value={fsCode}
            onChange={handleFsCodeChange}
            spellCheck={false}
            sx={{
              flex: 1,
              width: "100%",
              border: "none",
              outline: "none",
              resize: "none",
              fontFamily: "monospace",
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
              p: 2,
              color: "text.primary",
              bgcolor: isDark ? "grey.900" : "grey.50",
              boxSizing: "border-box",
              overflow: "auto",
            }}
          />
        </Dialog>
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
                  <img src={plantUmlUrl} alt="PlantUML diagram" style={{ maxWidth: "100%" }} />
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
      <Dialog
        open={fullscreen}
        onClose={() => { fsSearch.reset(); setFullscreen(false); }}
        fullScreen
        aria-labelledby="diagram-fullscreen-title"
        slotProps={{ paper: { sx: { bgcolor: settings.editorBg === "grey" && !isDark ? "grey.50" : undefined, display: "flex", flexDirection: "column" } } }}
        onKeyDown={(e: React.KeyboardEvent) => {
          const mod = e.metaKey || e.ctrlKey;
          if (mod && (e.key === "f" || e.key === "h")) {
            e.preventDefault();
            e.stopPropagation();
            fsSearch.focusSearch();
          }
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 1, borderBottom: 1, borderColor: "divider", position: "relative" }}>
          <DialogTitle id="diagram-fullscreen-title" sx={{ p: 0, fontSize: "0.875rem", fontWeight: 600, mr: 1 }}>
            {label}
          </DialogTitle>
          <ToggleButtonGroup size="small" sx={{ height: 30 }}>
            <ToggleButton value="zoomOut" aria-label={t("zoomOut")} sx={{ px: 0.75, py: 0.25 }} onClick={fsZP.zoomOut}>
              <Tooltip title={t("zoomOut")} placement="bottom">
                <ZoomOutIcon sx={{ fontSize: 18 }} />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="zoomIn" aria-label={t("zoomIn")} sx={{ px: 0.75, py: 0.25 }} onClick={fsZP.zoomIn}>
              <Tooltip title={t("zoomIn")} placement="bottom">
                <ZoomInIcon sx={{ fontSize: 18 }} />
              </Tooltip>
            </ToggleButton>
            {fsZP.isDirty && (
              <ToggleButton value="zoomReset" aria-label={t("zoomReset")} sx={{ px: 0.75, py: 0.25 }} onClick={fsZP.reset}>
                <Tooltip title={t("zoomReset")} placement="bottom">
                  <RestartAltIcon sx={{ fontSize: 18 }} />
                </Tooltip>
              </ToggleButton>
            )}
          </ToggleButtonGroup>
          <Typography variant="caption" sx={{ minWidth: 40, textAlign: "center" }}>
            {Math.round(fsZP.zoom * 100)}%
          </Typography>
          {/* Search & Replace bar */}
          {fsCodeVisible && (
            <FsSearchBar search={fsSearch} t={t} />
          )}
          <Box sx={{ flex: 1 }} />
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          {/* Code toggle */}
          <Tooltip title={fsCodeVisible ? t("foldAll") : t("unfoldAll")} placement="bottom">
            <IconButton
              size="small"
              onClick={() => setFsCodeVisible((v) => !v)}
              aria-label={fsCodeVisible ? t("foldAll") : t("unfoldAll")}
            >
              {fsCodeVisible ? <CodeOffIcon sx={{ fontSize: 18 }} /> : <CodeIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
          <Tooltip title={t("close")} placement="bottom">
            <IconButton size="small" onClick={() => { fsSearch.reset(); setFullscreen(false); }} sx={{ ml: 1 }} aria-label={t("close")}>
              <CloseIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        </Box>
        {/* Split view: Code + Divider + Preview */}
        <Box
          ref={fsContainerRef}
          sx={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}
          onPointerMove={(e: React.PointerEvent) => {
            if (fsDragging && fsContainerRef.current) {
              const rect = fsContainerRef.current.getBoundingClientRect();
              const pct = ((e.clientX - rect.left) / rect.width) * 100;
              setFsSplitPct(Math.min(80, Math.max(15, pct)));
            }
            if (!fsDragging) fsZP.handlePointerMove(e);
          }}
          onPointerUp={(e: React.PointerEvent) => {
            if (fsDragging) {
              setFsDragging(false);
              (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
            } else {
              fsZP.handlePointerUp();
            }
          }}
        >
          {/* Code editor */}
          {fsCodeVisible && (
            <Box sx={{ width: `${fsSplitPct}%`, minWidth: 120, display: "flex", flexDirection: "column", pointerEvents: fsDragging ? "none" : "auto" }}>
              <Box
                component="textarea"
                ref={fsTextareaRef}
                value={fsCode}
                onChange={handleFsCodeChange}
                spellCheck={false}
                sx={{
                  flex: 1,
                  width: "100%",
                  border: "none",
                  outline: "none",
                  resize: "none",
                  fontFamily: "monospace",
                  fontSize: `${settings.fontSize}px`,
                  lineHeight: settings.lineHeight,
                  p: 2,
                  color: "text.primary",
                  bgcolor: isDark ? "grey.900" : "grey.50",
                  boxSizing: "border-box",
                  overflow: "auto",
                }}
              />
            </Box>
          )}
          {/* Draggable divider */}
          {fsCodeVisible && (
            <Box
              onPointerDown={(e: React.PointerEvent) => {
                setFsDragging(true);
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                e.preventDefault();
              }}
              sx={{
                width: 4,
                cursor: "col-resize",
                bgcolor: "divider",
                flexShrink: 0,
                "&:hover": { bgcolor: "primary.main" },
                transition: "background-color 0.15s",
                "@media (prefers-reduced-motion: reduce)": { transition: "none" },
              }}
            />
          )}
          {/* Preview */}
          <Box
            sx={{
              flex: 1,
              overflow: "hidden",
              bgcolor: isDark ? "grey.900" : "background.paper",
              cursor: fsDragging ? "col-resize" : "grab",
              "&:active": { cursor: fsDragging ? "col-resize" : "grabbing" },
              // Prevent iframe/textarea stealing pointer events during drag
              pointerEvents: fsDragging ? "none" : "auto",
            }}
            onPointerDown={fsZP.handlePointerDown}
            onWheel={fsZP.handleWheel}
          >
            <Box sx={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", transform: `translate(${fsZP.pan.x}px, ${fsZP.pan.y}px) scale(${fsZP.zoom})`, transformOrigin: "center center", transition: fsZP.isPanningRef.current ? "none" : "transform 0.15s", "@media (prefers-reduced-motion: reduce)": { transition: "none" }, pointerEvents: "none" }}>
              {isMermaid && svg && (
                <Box dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg, SVG_SANITIZE_CONFIG) }} />
              )}
              {isPlantUml && plantUmlUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={plantUmlUrl} alt="PlantUML diagram" style={{ maxWidth: "90vw", maxHeight: "85vh" }} />
              )}
            </Box>
          </Box>
        </Box>
      </Dialog>
      {/* Mermaid サンプル選択 Popover */}
      <Popover
        open={!!mermaidSampleAnchorEl}
        anchorEl={mermaidSampleAnchorEl}
        onClose={() => setMermaidSampleAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", p: 0.5 }}>
          {MERMAID_SAMPLES.filter((s) => s.enabled).map((sample) => {
            const sampleCode = sample.code;
            return (
              <Tooltip key={sample.label} title={t(sample.i18nKey)} placement="right">
                <IconButton
                  size="small"
                  aria-label={t(sample.i18nKey)}
                  onClick={() => {
                    if (!editor) return;
                    const { $from } = editor.state.selection;
                    let depth = $from.depth;
                    while (depth > 0) {
                      const nd = $from.node(depth);
                      if (nd.type.name === "codeBlock" && nd.attrs.language === "mermaid") break;
                      depth--;
                    }
                    if (depth > 0) {
                      const start = $from.start(depth);
                      const end = $from.end(depth);
                      editor.chain().focus().command(({ tr }) => {
                        tr.replaceWith(start, end, editor.schema.text(sampleCode));
                        return true;
                      }).run();
                    }
                    setMermaidSampleAnchorEl(null);
                  }}
                  sx={{ minWidth: 32, minHeight: 32 }}
                >
                  <Typography aria-hidden="true" sx={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, lineHeight: 1, border: 1, borderColor: "divider", borderRadius: 0.5, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>{sample.icon}</Typography>
                </IconButton>
              </Tooltip>
            );
          })}
        </Box>
      </Popover>
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
