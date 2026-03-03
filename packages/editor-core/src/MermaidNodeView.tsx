"use client";

import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper, useEditorState } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Tooltip, Typography, useTheme } from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import SchemaIcon from "@mui/icons-material/Schema";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import DOMPurify from "dompurify";
import { useTranslations } from "next-intl";
import { usePlantUmlToolbar } from "./types";
import { useEditorSettingsContext } from "./useEditorSettings";
import { useMermaidRender, SVG_SANITIZE_CONFIG, detectMermaidType } from "./hooks/useMermaidRender";
import { useKatexRender, MATH_SANITIZE_CONFIG } from "./hooks/useKatexRender";
import { usePlantUmlRender } from "./hooks/usePlantUmlRender";
import { useDiagramCapture } from "./hooks/useDiagramCapture";
import { CodeBlockFullscreenDialog } from "./components/CodeBlockFullscreenDialog";
import { DiagramFullscreenDialog } from "./components/DiagramFullscreenDialog";
import { MermaidSamplePopover } from "./components/MermaidSamplePopover";
import { HtmlSamplePopover } from "./components/HtmlSamplePopover";
import { MathSamplePopover } from "./components/MathSamplePopover";
import { useZoomPan } from "./hooks/useZoomPan";
import { useDiagramResize } from "./hooks/useDiagramResize";
import { useTextareaSearch } from "./hooks/useTextareaSearch";

const pumlIconSx = { fontSize: 16 };

const HTML_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "div", "span", "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
    "strong", "em", "b", "i", "u", "s", "code", "pre", "sub", "sup", "mark", "small",
    "a", "img",
    "form", "input", "select", "option", "textarea", "button", "label", "fieldset", "legend",
    "details", "summary", "blockquote", "figure", "figcaption",
    "nav", "header", "footer", "main", "section", "article", "aside",
    "dl", "dt", "dd",
  ],
  ALLOWED_ATTR: [
    "class", "style", "id",
    "href", "src", "alt", "title", "target", "rel",
    "type", "name", "value", "placeholder", "for",
    "colspan", "rowspan", "width", "height",
    "rows", "open",
  ],
  ALLOW_DATA_ATTR: false,
};

export function CodeBlockNodeView({ editor, node, updateAttributes, getPos }: NodeViewProps) {
  const theme = useTheme();
  const t = useTranslations("MarkdownEditor");
  const isDark = theme.palette.mode === "dark";
  const language = node.attrs.language;
  const isMermaid = language === "mermaid";
  const isPlantUml = language === "plantuml";
  const isHtml = language === "html";
  const isMath = language === "math";
  const isDiagram = isMermaid || isPlantUml;
  const settings = useEditorSettingsContext();
  const { setSampleAnchorEl } = usePlantUmlToolbar();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const allCollapsed = !!node.attrs.collapsed;
  const codeCollapsed = !!node.attrs.codeCollapsed;
  const toggleAllCollapsed = useCallback(() => updateAttributes(allCollapsed ? { collapsed: false, codeCollapsed: false } : { collapsed: true }), [allCollapsed, updateAttributes]);
  const [mermaidSampleAnchorEl, setMermaidSampleAnchorEl] = useState<HTMLElement | null>(null);
  const [htmlSampleAnchorEl, setHtmlSampleAnchorEl] = useState<HTMLElement | null>(null);
  const [mathSampleAnchorEl, setMathSampleAnchorEl] = useState<HTMLElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fsCodeVisible, setFsCodeVisible] = useState(true);
  const [fsCode, setFsCode] = useState("");
  const normalZP = useZoomPan();
  const fsZP = useZoomPan();
  const diagramResize = useDiagramResize({
    width: node.attrs.width,
    updateAttributes,
    onResizeEnd: normalZP.reset,
  });
  const [diagramSize, setDiagramSize] = useState<{ w: number; h: number } | null>(null);
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

  const selectNode = useCallback(() => {
    if (!editor || typeof getPos !== "function") return;
    const pos = getPos();
    if (pos == null) return;
    editor.commands.setTextSelection(pos + 1);
    if (codeCollapsed) updateAttributes({ codeCollapsed: false });
  }, [editor, getPos, codeCollapsed, updateAttributes]);

  // 選択解除時にコードを折りたたむ
  useEffect(() => {
    if (!isSelected && !codeCollapsed) {
      updateAttributes({ codeCollapsed: true });
    }
  }, [isSelected]);

  const code = node.textContent;

  const { svg, error: mermaidError, setError: setMermaidError } = useMermaidRender({ code, isMermaid, isDark });
  const { html: mathHtml, error: mathError } = useKatexRender({ code, isMath });
  const {
    plantUmlUrl, error: plantUmlError, plantUmlConsent,
    handlePlantUmlAccept, handlePlantUmlReject, setError: setPlantUmlError,
  } = usePlantUmlRender({ code, isPlantUml, isDark });
  const error = isMermaid ? mermaidError : plantUmlError;

  const handleCapture = useDiagramCapture({ isMermaid, isPlantUml, svg, plantUmlUrl, code, isDark });
  const handleCopyCode = useCallback(() => { navigator.clipboard.writeText(code); }, [code]);
  const diagramScale = 1;

  // SVG の幅をエディタフォントサイズに合わせて調整（表示用のみ）
  const displaySvg = useMemo(() => {
    if (!svg) return svg;
    const viewBoxMatch = svg.match(/viewBox="[\d.]+ [\d.]+ ([\d.]+) [\d.]+"/);
    if (!viewBoxMatch) return svg;
    const viewBoxWidth = parseFloat(viewBoxMatch[1]);
    const targetWidth = (settings.fontSize / 16) * viewBoxWidth;
    return svg
      .replace(/width="100%"/, `width="${targetWidth}"`)
      .replace(/max-width:\s*[\d.]+px/, `max-width: 100%`);
  }, [svg, settings.fontSize]);

  // ダイアグラムコンテナのサイズを追跡
  useEffect(() => {
    const container = diagramResize.containerRef.current;
    if (!container) { setDiagramSize(null); return; }
    const diagramType = isMermaid ? "Mermaid" : isPlantUml ? "PlantUML" : "Diagram";
    const update = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      console.log(`[${diagramType}] size: ${w}x${h}px`);
      setDiagramSize({ w, h });

      // デバッグ: SVG 内テキストの見た目フォントサイズを出力
      const svgEl = container.querySelector("svg");
      const textEl = container.querySelector("svg foreignObject span, svg text");
      if (svgEl && textEl) {
        const internalFontSize = parseFloat(window.getComputedStyle(textEl).fontSize);
        const viewBox = svgEl.getAttribute("viewBox");
        const renderedWidth = svgEl.getBoundingClientRect().width;
        const viewBoxWidth = viewBox ? parseFloat(viewBox.split(" ")[2]) : renderedWidth;
        const visualScale = renderedWidth / viewBoxWidth;
        const visualFontSize = internalFontSize * visualScale;
        console.debug(`[${diagramType}] visualFontSize: ${visualFontSize.toFixed(1)}px (internal: ${internalFontSize}px, viewBoxWidth: ${viewBoxWidth}, renderedWidth: ${Math.round(renderedWidth)}, scale: ${visualScale.toFixed(3)})`);
      } else {
        console.debug(`[${diagramType}] No SVG/text element found`);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, [svg, plantUmlUrl, allCollapsed, settings.fontSize, diagramScale]);

  // 全画面オープン時にコードを同期
  useEffect(() => {
    if (fullscreen) setFsCode(code);
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

  // Math (KaTeX) preview block
  if (isMath) {
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
              Math
            </Typography>
            {/* Math サンプル挿入 */}
            {!allCollapsed && (<>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
              <Tooltip title={t("insertSample")} placement="top">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => setMathSampleAnchorEl(e.currentTarget)} aria-label={t("insertSample")}>
                  <SchemaIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </IconButton>
              </Tooltip>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
            </>)}

            <Box sx={{ flex: 1 }} />

            {!allCollapsed && (<>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

              {/* Copy code */}
              <Tooltip title={t("copyCode")} placement="top">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCopyCode} aria-label={t("copyCode")}>
                  <ContentCopyIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </IconButton>
              </Tooltip>

              {/* Delete */}
              <Tooltip title={t("delete")} placement="top">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setDeleteDialogOpen(true)} aria-label={t("delete")}>
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </>)}
          </Box>
          {/* Code editor with collapse support */}
          <Box
            component="pre"
            spellCheck={false}
            sx={allCollapsed
              ? { position: "absolute", width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" }
              : {
                  m: 0, p: 1.5, fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, bgcolor: isDark ? "grey.900" : "grey.50",
                  maxHeight: codeCollapsed ? 0 : 200, overflow: codeCollapsed ? "hidden" : "auto",
                  py: codeCollapsed ? 0 : 1.5, px: codeCollapsed ? 0 : 1.5,
                  opacity: codeCollapsed ? 0 : 1, transition: "max-height 0.2s, padding 0.2s, opacity 0.15s",
                  "@media (prefers-reduced-motion: reduce)": { transition: "none" },
                }
            }
          >
            {/* @ts-expect-error Tiptap NodeViewContent as prop type is too restrictive */}
            <NodeViewContent as="code" />
          </Box>
          {/* KaTeX Preview */}
          {!allCollapsed && mathError && (
            <Alert severity="warning" sx={{ borderRadius: 0 }}>{mathError}</Alert>
          )}
          {!allCollapsed && mathHtml && (
            <Box
              contentEditable={false}
              onClick={selectNode}
              sx={{ p: 2, bgcolor: "background.paper", borderTop: codeCollapsed ? 0 : 1, borderColor: "divider", overflow: "auto", maxHeight: 400, display: "flex", justifyContent: "center" }}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(mathHtml, MATH_SANITIZE_CONFIG) }}
            />
          )}
        </Box>
        {/* Fullscreen dialog */}
        <CodeBlockFullscreenDialog
          open={fullscreen}
          onClose={() => { fsSearch.reset(); setFullscreen(false); }}
          label="Math"
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
        {/* Math サンプル選択 Popover */}
        <MathSamplePopover
          anchorEl={mathSampleAnchorEl}
          onClose={() => setMathSampleAnchorEl(null)}
          editor={editor}
          t={t}
          getPos={getPos}
          nodeContentSize={node.content.size}
        />
      </NodeViewWrapper>
    );
  }

  // HTML preview block
  if (isHtml) {
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
              {t("htmlPreview")}
            </Typography>
            {/* HTML サンプル挿入 */}
            {!allCollapsed && (<>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
              <Tooltip title={t("insertSample")} placement="top">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => setHtmlSampleAnchorEl(e.currentTarget)} aria-label={t("insertSample")}>
                  <SchemaIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </IconButton>
              </Tooltip>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
            </>)}

            <Box sx={{ flex: 1 }} />

            {!allCollapsed && (<>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

              {/* Copy code */}
              <Tooltip title={t("copyCode")} placement="top">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCopyCode} aria-label={t("copyCode")}>
                  <ContentCopyIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </IconButton>
              </Tooltip>

              {/* Delete */}
              <Tooltip title={t("delete")} placement="top">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setDeleteDialogOpen(true)} aria-label={t("delete")}>
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </>)}
          </Box>
          {/* Code editor with collapse support */}
          <Box
            component="pre"
            spellCheck={false}
            sx={allCollapsed
              ? { position: "absolute", width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" }
              : {
                  m: 0, p: 1.5, fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, bgcolor: isDark ? "grey.900" : "grey.50",
                  maxHeight: codeCollapsed ? 0 : 200, overflow: codeCollapsed ? "hidden" : "auto",
                  py: codeCollapsed ? 0 : 1.5, px: codeCollapsed ? 0 : 1.5,
                  opacity: codeCollapsed ? 0 : 1, transition: "max-height 0.2s, padding 0.2s, opacity 0.15s",
                  "@media (prefers-reduced-motion: reduce)": { transition: "none" },
                }
            }
          >
            {/* @ts-expect-error Tiptap NodeViewContent as prop type is too restrictive */}
            <NodeViewContent as="code" />
          </Box>
          {/* HTML Preview */}
          {!allCollapsed && (
            <Box
              contentEditable={false}
              onClick={selectNode}
              sx={{ p: 2, bgcolor: "background.paper", borderTop: 1, borderColor: "divider", overflow: "auto", maxHeight: 400, "& img": { maxWidth: "100%" } }}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(code, HTML_SANITIZE_CONFIG) }}
            />
          )}
        </Box>
        {/* Fullscreen dialog */}
        <CodeBlockFullscreenDialog
          open={fullscreen}
          onClose={() => { fsSearch.reset(); setFullscreen(false); }}
          label={t("htmlPreview")}
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
        {/* HTML サンプル選択 Popover */}
        <HtmlSamplePopover
          anchorEl={htmlSampleAnchorEl}
          onClose={() => setHtmlSampleAnchorEl(null)}
          editor={editor}
          t={t}
        />
      </NodeViewWrapper>
    );
  }

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

  const label = isMermaid ? t("mermaid") : t("plantuml");

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

          {/* Diagram size display */}
          {diagramSize && !allCollapsed && (<>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
            <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.65rem", fontFamily: "monospace", whiteSpace: "nowrap", flexShrink: 0 }}>
              {diagramSize.w}×{diagramSize.h}
            </Typography>
          </>)}

          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

          {/* Copy code */}
          <Tooltip title={t("copyCode")} placement="top">
            <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCopyCode} aria-label={t("copyCode")}>
              <ContentCopyIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            </IconButton>
          </Tooltip>

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
                ref={diagramResize.containerRef}
                role="img"
                aria-label={t(detectMermaidType(code))}
                sx={{ overflow: "hidden", bgcolor: "background.paper", position: "relative", width: diagramResize.displayWidth || "fit-content", maxWidth: "100%", cursor: diagramResize.resizing ? "nwse-resize" : "grab", "&:active": { cursor: diagramResize.resizing ? "nwse-resize" : "grabbing" } }}
                contentEditable={false}
                onClick={selectNode}
                onPointerDown={normalZP.handlePointerDown}
                onPointerMove={(e) => diagramResize.resizing ? diagramResize.handlePointerMove(e) : normalZP.handlePointerMove(e)}
                onPointerUp={() => diagramResize.resizing ? diagramResize.handlePointerUp() : normalZP.handlePointerUp()}
                onWheel={normalZP.handleWheel}
              >
                <Box
                  sx={{ p: 2, display: "flex", justifyContent: "flex-start", zoom: diagramScale, transform: `translate(${normalZP.pan.x}px, ${normalZP.pan.y}px) scale(${normalZP.zoom})`, transformOrigin: "top left", transition: normalZP.isPanningRef.current ? "none" : "transform 0.15s", "@media (prefers-reduced-motion: reduce)": { transition: "none" }, pointerEvents: "none" }}
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(displaySvg, SVG_SANITIZE_CONFIG) }}
                />
                {isSelected && (
                  <Box
                    role="slider"
                    tabIndex={0}
                    aria-label={t("resizeDiagram")}
                    aria-valuemin={diagramResize.MIN_WIDTH}
                    aria-valuemax={800}
                    aria-valuenow={parseInt(node.attrs.width, 10) || undefined}
                    onPointerDown={diagramResize.handlePointerDown}
                    onKeyDown={diagramResize.handleKeyDown}
                    sx={{
                      position: "absolute", right: 0, bottom: 0, width: 16, height: 16,
                      cursor: "nwse-resize", bgcolor: "primary.main", opacity: 0.7, borderTopLeftRadius: 4,
                      "&:hover": { opacity: 1 },
                      "&:focus-visible": { opacity: 1, outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 },
                      clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
                    }}
                  />
                )}
                {diagramResize.resizing && diagramResize.resizeWidth !== null && (
                  <Box sx={{
                    position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)",
                    bgcolor: "rgba(0,0,0,0.7)", color: "white", px: 1, py: 0.25,
                    borderRadius: 1, fontSize: "0.7rem", fontFamily: "monospace", pointerEvents: "none",
                  }}>
                    {diagramResize.resizeWidth}px
                  </Box>
                )}
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
                ref={diagramResize.containerRef}
                sx={{ overflow: "hidden", bgcolor: "background.paper", position: "relative", width: diagramResize.displayWidth || "fit-content", maxWidth: "100%", cursor: diagramResize.resizing ? "nwse-resize" : "grab", "&:active": { cursor: diagramResize.resizing ? "nwse-resize" : "grabbing" } }}
                contentEditable={false}
                onClick={selectNode}
                onPointerDown={normalZP.handlePointerDown}
                onPointerMove={(e) => diagramResize.resizing ? diagramResize.handlePointerMove(e) : normalZP.handlePointerMove(e)}
                onPointerUp={() => diagramResize.resizing ? diagramResize.handlePointerUp() : normalZP.handlePointerUp()}
                onWheel={normalZP.handleWheel}
              >
                <Box sx={{ p: 2, display: "flex", justifyContent: "flex-start", zoom: diagramScale, transform: `translate(${normalZP.pan.x}px, ${normalZP.pan.y}px) scale(${normalZP.zoom})`, transformOrigin: "top left", transition: normalZP.isPanningRef.current ? "none" : "transform 0.15s", "@media (prefers-reduced-motion: reduce)": { transition: "none" }, pointerEvents: "none" }}>
                  <img src={plantUmlUrl} alt={t("plantUmlDiagram")} referrerPolicy="no-referrer" style={{ maxWidth: "100%", height: "auto" }} />
                </Box>
                {isSelected && (
                  <Box
                    role="slider"
                    tabIndex={0}
                    aria-label={t("resizeDiagram")}
                    aria-valuemin={diagramResize.MIN_WIDTH}
                    aria-valuemax={800}
                    aria-valuenow={parseInt(node.attrs.width, 10) || undefined}
                    onPointerDown={diagramResize.handlePointerDown}
                    onKeyDown={diagramResize.handleKeyDown}
                    sx={{
                      position: "absolute", right: 0, bottom: 0, width: 16, height: 16,
                      cursor: "nwse-resize", bgcolor: "primary.main", opacity: 0.7, borderTopLeftRadius: 4,
                      "&:hover": { opacity: 1 },
                      "&:focus-visible": { opacity: 1, outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 },
                      clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
                    }}
                  />
                )}
                {diagramResize.resizing && diagramResize.resizeWidth !== null && (
                  <Box sx={{
                    position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)",
                    bgcolor: "rgba(0,0,0,0.7)", color: "white", px: 1, py: 0.25,
                    borderRadius: 1, fontSize: "0.7rem", fontFamily: "monospace", pointerEvents: "none",
                  }}>
                    {diagramResize.resizeWidth}px
                  </Box>
                )}
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
