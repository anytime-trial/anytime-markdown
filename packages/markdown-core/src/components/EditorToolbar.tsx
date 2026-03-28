import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import EditNoteIcon from "@mui/icons-material/EditNote";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import GitHubIcon from "@mui/icons-material/GitHub";
import ListAltIcon from "@mui/icons-material/ListAlt";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import RedoIcon from "@mui/icons-material/Redo";
import UndoIcon from "@mui/icons-material/Undo";
import ViewStreamIcon from "@mui/icons-material/ViewStream";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  Box,
  IconButton,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  useTheme,
} from "@mui/material";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import React, { useCallback, useRef, useState } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, DEFAULT_LIGHT_TEXT, getActionHover, getActionSelected, getBgPaper, getTextPrimary, getTextSecondary } from "../constants/colors";
import { modKey } from "../constants/shortcuts";
import { TOOLBAR_FONT_SIZE } from "../constants/dimensions";
import { Z_TOOLBAR } from "../constants/zIndex";
import AppIcon from "../icons/AppIcon";
import type { TranslationFn } from "../types";
import type { ToolbarFileCapabilities, ToolbarFileHandlers, ToolbarModeHandlers,ToolbarModeState, ToolbarVisibility } from "../types/toolbar";
import type { MergeUndoRedo } from "./InlineMergeView";
import { ToolbarFileActions } from "./ToolbarFileActions";
import { ToolbarMobileMenu } from "./ToolbarMobileMenu";

/** WAI-ARIA Toolbar パターン: 矢印キーでフォーカス移動 */
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [role="button"]:not([disabled]), input:not([disabled])';

/** Key→action map for roving tabindex keyboard navigation */
const KEY_ACTIONS: Record<string, (items: HTMLElement[], current: number) => number> = {
  ArrowRight: (items, c) => (c < items.length - 1 ? c + 1 : 0),
  ArrowLeft: (items, c) => (c > 0 ? c - 1 : items.length - 1),
  Home: () => 0,
  End: (items) => items.length - 1,
};

/** ツールチップキー → ショートカットキー表示マッピング */
const TOOLTIP_SHORTCUTS: Record<string, string> = {
  undo: `${modKey}+Z`,
  redo: `${modKey}+Shift+Z`,
  createNew: `${modKey}+Alt+N`,
  copy: `${modKey}+Shift+C`,
  openFile: `${modKey}+O`,
  saveFile: `${modKey}+S`,
  saveAsFile: `${modKey}+Shift+S`,
  upload: `${modKey}+Alt+U`,
  download: `${modKey}+Alt+E`,


  templates: `${modKey}+Alt+P`,
  sourceMode: `${modKey}+Alt+S`,
  normalMode: `${modKey}+Alt+M`,
  compareMode: `${modKey}+Alt+M`,
  outline: `${modKey}+Alt+O`,
};

/** ツールチップにショートカットキーを付加 */
function tip(t: TranslationFn, key: string): string {
  const shortcut = TOOLTIP_SHORTCUTS[key];
  return shortcut ? `${t(key)}  (${shortcut})` : t(key);
}

/** モード切替・比較切替の pill 型トグル共通スタイル */
function getPillToggleSx(isDark: boolean) {
  return {
    height: 34,
    borderRadius: "20px",
    bgcolor: getActionHover(isDark),
    p: 0.25,
    "& .MuiToggleButton-root": {
      border: "none",
      borderRadius: "20px !important",
      px: 2,
      py: 0,
      gap: 0.5,
      fontSize: TOOLBAR_FONT_SIZE,
      textTransform: "none",
      lineHeight: 1,
    },
    "& .Mui-selected": {
      bgcolor: `${getBgPaper(isDark)} !important`,
      color: `${getTextPrimary(isDark)} !important`,
      boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
    },
    "& .MuiToggleButton-root:not(.Mui-selected)": {
      bgcolor: "transparent",
      color: getTextSecondary(isDark),
      "&:hover": {
        bgcolor: getActionSelected(isDark),
      },
    },
  } as const;
}

interface EditorToolbarProps {
  editor: Editor | null;
  isInDiagramBlock: boolean;

  onToggleAllBlocks: () => void;
  fileHandlers: ToolbarFileHandlers;
  fileCapabilities?: ToolbarFileCapabilities;
  onSetTemplateAnchor: (el: HTMLElement) => void;
  onSetHelpAnchor: (el: HTMLElement) => void;
  modeState: ToolbarModeState;
  modeHandlers: ToolbarModeHandlers;

  mergeUndoRedo?: MergeUndoRedo | null;
  hide?: ToolbarVisibility;
  onOpenSettings?: () => void;
  onOpenVersionDialog?: () => void;
  onAnnounce?: (message: string) => void;
  t: TranslationFn;
}

function selectToolbarEditorState(ctx: { editor: Editor | null }) {
  let allDiagramCodeCollapsed = true;
  let hasDiagrams = false;
  ctx.editor?.state.doc.descendants((node) => {
    if (node.type.name === "codeBlock") {
      const lang = (node.attrs.language || "").toLowerCase();
      if (lang === "mermaid" || lang === "plantuml") {
        hasDiagrams = true;
        if (!node.attrs.codeCollapsed) allDiagramCodeCollapsed = false;
      }
    }
  });
  const activeLang = (ctx.editor?.getAttributes("codeBlock")?.language || "").toLowerCase();
  const isInDiagramCode = (ctx.editor?.isActive("codeBlock") ?? false)
    && (activeLang === "mermaid" || activeLang === "plantuml");
  return {
    canUndo: ctx.editor?.can().undo() ?? false,
    canRedo: ctx.editor?.can().redo() ?? false,
    isCodeBlock: ctx.editor?.isActive("codeBlock") ?? false,
    isInDiagramCode,
    allDiagramCodeCollapsed: hasDiagrams && allDiagramCodeCollapsed,
    hasDiagrams,
  };
}

export const EditorToolbar = React.memo(function EditorToolbar({
  editor,
  isInDiagramBlock: _isInDiagramBlock,

  onToggleAllBlocks: _onToggleAllBlocks,
  fileHandlers,
  fileCapabilities,
  onSetTemplateAnchor: _onSetTemplateAnchor,
  onSetHelpAnchor,
  modeState,
  modeHandlers,

  mergeUndoRedo,
  hide = {},
  onOpenSettings,
  onOpenVersionDialog,
  onAnnounce: _onAnnounce,
  t,
}: EditorToolbarProps) {
  const {
    fileOps: hideFileOps, undoRedo: hideUndoRedo, moreMenu: hideMoreMenu,
    settings: hideSettings, versionInfo: hideVersionInfo,
    modeToggle: hideModeToggle, readonlyToggle: hideReadonlyToggle,
    outline: hideOutline, comments: hideComments, explorer: hideExplorer,
    compareToggle: hideCompareToggle,
    templates: _hideTemplates, foldAll: _hideFoldAll,
  } = hide;
  const { sourceMode, readonlyMode, reviewMode, outlineOpen, inlineMergeOpen, commentOpen, explorerOpen } = modeState;
  const { onSwitchToSource, onSwitchToWysiwyg, onSwitchToReview, onSwitchToReadonly, onToggleOutline, onToggleComments, onMerge, onToggleExplorer } = modeHandlers;
  const isDark = useTheme().palette.mode === "dark";

  const [mobileMenuAnchorEl, setMobileMenuAnchorEl] = useState<HTMLElement | null>(null);
  const mobileMoreRef = useRef<HTMLButtonElement>(null);

  /** Roving tabindex: 最後にフォーカスされたボタンのインデックス */
  const [rovingIndex, setRovingIndex] = useState(0);

  /** ツールバー内のフォーカス可能要素に roving tabindex を適用 */
  const applyRovingTabindex = useCallback((toolbar: HTMLElement, activeIdx: number) => {
    const items = Array.from(toolbar.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    items.forEach((item, i) => {
      item.setAttribute("tabindex", i === activeIdx ? "0" : "-1");
    });
  }, []);

  /** ツールバーがマウントされたら初期 roving tabindex を適用 */
  const toolbarRefCallback = useCallback((node: HTMLElement | null) => {
    if (node) applyRovingTabindex(node, rovingIndex);
  }, [applyRovingTabindex, rovingIndex]);

  const handleToolbarKeyDown = useCallback((e: React.KeyboardEvent) => {
    const toolbar = e.currentTarget;
    const items = Array.from(toolbar.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (currentIndex === -1) return;

    const action = KEY_ACTIONS[e.key];
    if (!action) return;
    const nextIndex = action(items, currentIndex);
    e.preventDefault();
    items.forEach((item, i) => {
      item.setAttribute("tabindex", i === nextIndex ? "0" : "-1");
    });
    setRovingIndex(nextIndex);
    items[nextIndex]?.focus();
  }, []);

  const editorState = useEditorState({
    editor,
    selector: selectToolbarEditorState,
  });

  let currentMode: string;
  if (readonlyMode) currentMode = "readonly";
  else if (reviewMode) currentMode = "review";
  else if (sourceMode) currentMode = "source";
  else currentMode = "wysiwyg";

  return (
    <>
    <Paper
      id="md-editor-toolbar"
      ref={toolbarRefCallback}
      variant="outlined"
      role="toolbar"
      aria-label={t("editorToolbar")}
      onKeyDown={handleToolbarKeyDown}
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 0.5,
        py: 0.5,
        pr: 0.5,
        pl: "2px",
        minHeight: 44,
        maxHeight: 44,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        borderBottom: inlineMergeOpen ? undefined : "none",
        position: "sticky",
        top: 0,
        zIndex: Z_TOOLBAR,
        bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
        color: isDark ? undefined : DEFAULT_LIGHT_TEXT,
      }}
    >
      {/* File actions */}
      {!hideFileOps && (
        <ToolbarFileActions
          fileHandlers={fileHandlers}
          fileCapabilities={fileCapabilities}
          sourceMode={sourceMode}
          readonlyMode={readonlyMode}
          reviewMode={reviewMode}
          inlineMergeOpen={inlineMergeOpen}
          tooltipShortcuts={TOOLTIP_SHORTCUTS}
          t={t}
        />
      )}

      {/* Undo/Redo */}
      {!hideUndoRedo && (
        <ToggleButtonGroup size="small" aria-label={`${t("undo")} / ${t("redo")}`} sx={{ height: 30 }}>
          <ToggleButton
            value="undo"
            aria-label={t("undo")}
            onClick={() => mergeUndoRedo ? mergeUndoRedo.undo() : editor?.chain().focus().undo().run()}
            disabled={readonlyMode || reviewMode || (mergeUndoRedo ? !mergeUndoRedo.canUndo : !editorState?.canUndo)}
            sx={{ px: 0.75, py: 0.25 }}
          >
            <Tooltip title={tip(t, "undo")}>
              <span style={{ display: "inline-flex" }}><UndoIcon fontSize="small" /></span>
            </Tooltip>
          </ToggleButton>
          <ToggleButton
            value="redo"
            aria-label={t("redo")}
            onClick={() => mergeUndoRedo ? mergeUndoRedo.redo() : editor?.chain().focus().redo().run()}
            disabled={readonlyMode || reviewMode || (mergeUndoRedo ? !mergeUndoRedo.canRedo : !editorState?.canRedo)}
            sx={{ px: 0.75, py: 0.25 }}
          >
            <Tooltip title={tip(t, "redo")}>
              <span style={{ display: "inline-flex" }}><RedoIcon fontSize="small" /></span>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      )}

      {/* Outline, Comments - hidden on mobile */}
      <Box sx={{ display: { xs: "none", md: "contents" } }}>
      <ToggleButtonGroup size="small" aria-label={t("view")} sx={{ height: 30 }}>
        {!hideExplorer && onToggleExplorer && (
          <ToggleButton value="explorer" selected={!!explorerOpen} onClick={onToggleExplorer} aria-label={t("explorer")} sx={{ px: 0.75, py: 0.25 }}>
            <Tooltip title={t("explorer")}>
              <span style={{ display: "inline-flex" }}><GitHubIcon fontSize="small" /></span>
            </Tooltip>
          </ToggleButton>
        )}
        {!hideOutline && <ToggleButton value="outline" selected={outlineOpen} onClick={onToggleOutline} disabled={sourceMode} aria-label={t("outline")} sx={{ px: 0.75, py: 0.25 }}>
          <Tooltip title={tip(t, "outline")}>
            <span style={{ display: "inline-flex" }}><ListAltIcon fontSize="small" /></span>
          </Tooltip>
        </ToggleButton>}
        {!hideComments && onToggleComments && (
          <ToggleButton value="comments" selected={commentOpen} onClick={onToggleComments} disabled={sourceMode} aria-label={t("commentPanel") || "Comments"} sx={{ px: 0.75, py: 0.25 }}>
            <Tooltip title={t("commentPanel") || "Comments"}>
              <span style={{ display: "inline-flex" }}><ChatBubbleOutlineIcon fontSize="small" /></span>
            </Tooltip>
          </ToggleButton>
        )}
      </ToggleButtonGroup>
      </Box>

      <Box sx={{ flexGrow: 1 }} />

      {/* Source / Edit / Review toggle */}
      {!hideModeToggle && <ToggleButtonGroup
        value={currentMode}
        exclusive
        size="small"
        aria-label={t("editMode")}
        sx={getPillToggleSx(isDark)}
      >
        {!hideReadonlyToggle && (
          <ToggleButton value="readonly" aria-label={t("readonly")} onClick={onSwitchToReadonly}>
            <LockOutlinedIcon sx={{ fontSize: "1rem" }} />
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{t("readonly")}</Box>
          </ToggleButton>
        )}
        <ToggleButton value="review" aria-label={t("review")} onClick={onSwitchToReview}>
          <VisibilityOutlinedIcon sx={{ fontSize: "1rem" }} />
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{t("review")}</Box>
        </ToggleButton>
        <ToggleButton value="wysiwyg" aria-label={t("wysiwyg")} onClick={onSwitchToWysiwyg}>
          <EditOutlinedIcon sx={{ fontSize: "1rem" }} />
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{t("wysiwyg")}</Box>
        </ToggleButton>
        <ToggleButton value="source" aria-label={t("source")} onClick={onSwitchToSource}>
          <CodeOutlinedIcon sx={{ fontSize: "1rem" }} />
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{t("source")}</Box>
        </ToggleButton>
      </ToggleButtonGroup>}

      {/* Compare toggle (md 以上のみ表示) */}
      {!hideModeToggle && !hideCompareToggle && <ToggleButtonGroup
        value={inlineMergeOpen ? "compare" : "edit"}
        exclusive
        size="small"
        aria-label={t("compareMode")}
        sx={{ ...getPillToggleSx(isDark), display: { xs: "none", md: "inline-flex" } }}
      >
        <ToggleButton
          value="edit"
          aria-label={t("normalMode")}
          disabled={readonlyMode}
          onClick={() => { if (inlineMergeOpen) onMerge(); }}
        >
          <EditNoteIcon sx={{ fontSize: "1rem" }} />
          {t("normalMode")}
        </ToggleButton>
        <ToggleButton
          value="compare"
          aria-label={t("compare")}
          disabled={readonlyMode}
          onClick={() => { if (!inlineMergeOpen) onMerge(); }}
        >
          <ViewStreamIcon sx={{ fontSize: "1rem", transform: "rotate(90deg)" }} />
          {t("compare")}
        </ToggleButton>
      </ToggleButtonGroup>}

      {/* More menu */}
      {!hideMoreMenu && (
        <>
          <Box sx={{ display: { xs: "none", md: "contents" } }}>
            <Tooltip title={t("more")}>
              <IconButton aria-label={t("more")}
                size="small"
                onClick={(e) => onSetHelpAnchor(e.currentTarget)}
                sx={{ mr: 0, p: 0 }}
              >
                <AppIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <IconButton
            ref={mobileMoreRef}
            aria-label={t("more")}
            size="small"
            onClick={(e) => setMobileMenuAnchorEl(e.currentTarget)}
            sx={{ display: { xs: "inline-flex", md: "none" }, mr: 0, p: 0 }}
          >
            <AppIcon fontSize="small" />
          </IconButton>
        </>
      )}
    </Paper>

    {/* Mobile More menu */}
    <ToolbarMobileMenu
      anchorEl={mobileMenuAnchorEl}
      onClose={() => setMobileMenuAnchorEl(null)}
      mobileMoreRef={mobileMoreRef}
      outlineOpen={outlineOpen}
      commentOpen={commentOpen}
      inlineMergeOpen={inlineMergeOpen}
      sourceMode={sourceMode}
      readonlyMode={readonlyMode}
      hideOutline={hideOutline}
      hideComments={hideComments}
      hideSettings={hideSettings}
      hideVersionInfo={hideVersionInfo}
      onToggleOutline={onToggleOutline}
      onToggleComments={onToggleComments}
      onSetHelpAnchor={onSetHelpAnchor}
      onOpenSettings={onOpenSettings}
      onOpenVersionDialog={onOpenVersionDialog}
      t={t}
    />
    </>
  );
});
