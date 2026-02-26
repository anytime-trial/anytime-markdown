import AccountTreeIcon from "@mui/icons-material/AccountTree";
import ArticleIcon from "@mui/icons-material/Article";
import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DescriptionIcon from "@mui/icons-material/Description";
import DownloadIcon from "@mui/icons-material/Download";
import WysiwygIcon from "@mui/icons-material/Wysiwyg";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import GridOnIcon from "@mui/icons-material/GridOn";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import ImageIcon from "@mui/icons-material/Image";
import CompareIcon from "@mui/icons-material/Compare";
import ViewStreamIcon from "@mui/icons-material/ViewStream";
import EditNoteIcon from "@mui/icons-material/EditNote";
import ListAltIcon from "@mui/icons-material/ListAlt";
import RedoIcon from "@mui/icons-material/Redo";
import TerminalIcon from "@mui/icons-material/Terminal";
import UndoIcon from "@mui/icons-material/Undo";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import CodeOffIcon from "@mui/icons-material/CodeOff";
import CodeIcon from "@mui/icons-material/Code";

import {
  Box,
  Divider,
  IconButton,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";

import { useCallback } from "react";
import { modKey } from "../constants/shortcuts";
import { SearchReplaceBar } from "./SearchReplaceBar";
import type { MergeUndoRedo } from "./InlineMergeView";

/** WAI-ARIA Toolbar パターン: 矢印キーでフォーカス移動 */
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [role="button"]:not([disabled]), input:not([disabled])';

/** ツールチップキー → ショートカットキー表示マッピング */
const TOOLTIP_SHORTCUTS: Record<string, string> = {
  undo: `${modKey}+Z`,
  redo: `${modKey}+Shift+Z`,
  codeBlock: `${modKey}+Alt+C`,
  image: `${modKey}+Alt+I`,
  horizontalRule: `${modKey}+Alt+R`,
  insertTable: `${modKey}+Alt+T`,
  insertDiagram: `${modKey}+Alt+D`,
  templates: `${modKey}+Alt+P`,
  sourceMode: `${modKey}+Alt+S`,
  normalMode: `${modKey}+Alt+M`,
  compareMode: `${modKey}+Alt+M`,
};

/** ツールチップにショートカットキーを付加 */
function tip(t: (key: string) => string, key: string): string {
  const shortcut = TOOLTIP_SHORTCUTS[key];
  return shortcut ? `${t(key)}  (${shortcut})` : t(key);
}

interface EditorToolbarProps {
  editor: Editor | null;
  isInDiagramBlock: boolean;
  onImage: () => void;
  onToggleAllBlocks: () => void;
  onToggleDiagramCode: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onImport: () => void;
  onClear: () => void;
  copied: boolean;
  onSetDiagramAnchor: (el: HTMLElement) => void;
  onSetTemplateAnchor: (el: HTMLElement) => void;
  onSetHelpAnchor: (el: HTMLElement) => void;
  sourceMode: boolean;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  onMerge: () => void;
  inlineMergeOpen: boolean;
  onSwitchToSource: () => void;
  onSwitchToWysiwyg: () => void;
  onSourceInsertHr?: () => void;
  onSourceInsertCodeBlock?: () => void;
  onSourceInsertTable?: () => void;
  mergeUndoRedo?: MergeUndoRedo | null;
  hideFileOps?: boolean;
  hideUndoRedo?: boolean;
  hideMoreMenu?: boolean;
  onLoadRightFile?: () => void;
  onExportRightFile?: () => void;
  t: (key: string) => string;
}

export function EditorToolbar({
  editor,
  isInDiagramBlock,
  onImage,
  onToggleAllBlocks,
  onToggleDiagramCode,
  onCopy,
  onDownload,
  onImport,
  onClear,
  copied,
  onSetDiagramAnchor,
  onSetTemplateAnchor,
  onSetHelpAnchor,
  sourceMode,
  outlineOpen,
  onToggleOutline,
  onMerge,
  inlineMergeOpen,
  onSwitchToSource,
  onSwitchToWysiwyg,
  onSourceInsertHr,
  onSourceInsertCodeBlock,
  onSourceInsertTable,
  mergeUndoRedo,
  hideFileOps,
  hideUndoRedo,
  hideMoreMenu,
  onLoadRightFile,
  onExportRightFile,
  t,
}: EditorToolbarProps) {
  const handleToolbarKeyDown = useCallback((e: React.KeyboardEvent) => {
    const toolbar = e.currentTarget;
    const items = Array.from(toolbar.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    switch (e.key) {
      case "ArrowRight":
        nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        break;
      case "ArrowLeft":
        nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    items[nextIndex]?.focus();
  }, []);

  const editorState = useEditorState({
    editor,
    selector: (ctx) => {
      let allCollapsed = true;
      let hasBlocks = false;
      let allDiagramCodeCollapsed = true;
      let hasDiagrams = false;
      ctx.editor?.state.doc.descendants((node) => {
        if (node.type.name === "codeBlock" || node.type.name === "table" || node.type.name === "image") {
          hasBlocks = true;
          if (!node.attrs.collapsed) allCollapsed = false;
        }
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
        allBlocksCollapsed: hasBlocks && allCollapsed,
        hasBlocks,
        allDiagramCodeCollapsed: hasDiagrams && allDiagramCodeCollapsed,
        hasDiagrams,
      };
    },
  });

  return (
    <>
    <Paper
      variant="outlined"
      role="toolbar"
      aria-label={t("editorToolbar")}
      onKeyDown={handleToolbarKeyDown}
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 0.5,
        p: 1,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        borderBottom: "none",
        position: "sticky",
        top: 0,
        zIndex: 10,
        bgcolor: "background.paper",
      }}
    >
      {/* File actions */}
      {!hideFileOps && (
        <>
          <Tooltip title={t("createNew")}>
            <IconButton
              size="small"
              aria-label={t("createNew")}
              onClick={onClear}
            >
              <DescriptionIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={copied ? t("copied") : t("copy")}>
            <IconButton
              size="small"
              aria-label={copied ? t("copied") : t("copy")}
              onClick={onCopy}
              color={copied ? "success" : "default"}
            >
              {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title={t("upload")}>
            <IconButton
              size="small"
              aria-label={t("upload")}
              onClick={onImport}
            >
              <FileUploadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("download")}>
            <IconButton
              size="small"
              aria-label={t("download")}
              onClick={onDownload}
            >
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        </>
      )}

      {/* Undo/Redo */}
      {!hideUndoRedo && (
        <>
          <Tooltip title={tip(t, "undo")}>
            <span>
              <IconButton aria-label={t("undo")}
                size="small"
                onClick={() => mergeUndoRedo ? mergeUndoRedo.undo() : editor?.chain().focus().undo().run()}
                disabled={mergeUndoRedo ? !mergeUndoRedo.canUndo : !editorState?.canUndo}
              >
                <UndoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={tip(t, "redo")}>
            <span>
              <IconButton aria-label={t("redo")}
                size="small"
                onClick={() => mergeUndoRedo ? mergeUndoRedo.redo() : editor?.chain().focus().redo().run()}
                disabled={mergeUndoRedo ? !mergeUndoRedo.canRedo : !editorState?.canRedo}
              >
                <RedoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </>
      )}

      {/* Search / Replace (inline in toolbar) */}
      {editor && <SearchReplaceBar editor={editor} t={t} />}

      {/* Image + Table */}
      <Tooltip title={tip(t, "image")}>
        <span>
        <IconButton aria-label={t("image")}
          size="small"
          onClick={onImage}
          disabled={isInDiagramBlock || editorState?.isInDiagramCode || inlineMergeOpen}
        >
          <ImageIcon fontSize="small" />
        </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={tip(t, "horizontalRule")}>
        <span>
        <IconButton aria-label={t("horizontalRule")}
          size="small"
          onClick={() => sourceMode ? onSourceInsertHr?.() : editor?.chain().focus().setHorizontalRule().run()}
          disabled={isInDiagramBlock || editorState?.isInDiagramCode || inlineMergeOpen}
        >
          <HorizontalRuleIcon fontSize="small" />
        </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={tip(t, "insertTable")}>
        <span>
        <IconButton aria-label={t("insertTable")}
          size="small"
          onClick={() =>
            sourceMode ? onSourceInsertTable?.() : editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          disabled={isInDiagramBlock || editorState?.isInDiagramCode || inlineMergeOpen}
        >
          <GridOnIcon fontSize="small" />
        </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={tip(t, "codeBlock")}>
        <span>
        <IconButton aria-label={t("codeBlock")}
          size="small"
          onClick={() => sourceMode ? onSourceInsertCodeBlock?.() : editor?.chain().focus().toggleCodeBlock().run()}
          disabled={isInDiagramBlock || editorState?.isInDiagramCode || inlineMergeOpen}
          color="default"
        >
          <TerminalIcon fontSize="small" />
        </IconButton>
        </span>
      </Tooltip>

      {/* Diagrams */}
      <Tooltip title={tip(t, "insertDiagram")}>
        <span>
        <IconButton aria-label={t("insertDiagram")}
          size="small"
          onClick={(e) => onSetDiagramAnchor(e.currentTarget)}
          disabled={isInDiagramBlock || editorState?.isInDiagramCode || inlineMergeOpen}
        >
          <AccountTreeIcon fontSize="small" />
        </IconButton>
        </span>
      </Tooltip>

      {/* Templates */}
      <Tooltip title={tip(t, "templates")}>
        <span>
        <IconButton aria-label={t("templates")}
          size="small"
          onClick={(e) => onSetTemplateAnchor(e.currentTarget)}
          disabled={editorState?.isInDiagramCode || inlineMergeOpen}
        >
          <ArticleIcon fontSize="small" />
        </IconButton>
        </span>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      <Box sx={{ flexGrow: 1 }} />

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Collapse/Expand all blocks */}
      {editorState?.hasBlocks && (
        <Tooltip title={editorState.allBlocksCollapsed ? t("unfoldAll") : t("foldAll")}>
          <span>
          <IconButton
            size="small"
            onClick={onToggleAllBlocks}
            disabled={inlineMergeOpen || sourceMode}
            aria-label={editorState.allBlocksCollapsed ? t("unfoldAll") : t("foldAll")}
          >
            {editorState.allBlocksCollapsed
              ? <UnfoldMoreIcon fontSize="small" />
              : <UnfoldLessIcon fontSize="small" />}
          </IconButton>
          </span>
        </Tooltip>
      )}

      {/* Collapse/Expand diagram code panes */}
      {editorState?.hasDiagrams && (
        <Tooltip title={editorState.allDiagramCodeCollapsed ? t("diagramCodeShow") : t("diagramCodeHide")}>
          <span>
          <IconButton
            size="small"
            onClick={onToggleDiagramCode}
            disabled={inlineMergeOpen || sourceMode}
            aria-label={editorState.allDiagramCodeCollapsed ? t("diagramCodeShow") : t("diagramCodeHide")}
          >
            {editorState.allDiagramCodeCollapsed
              ? <CodeIcon fontSize="small" />
              : <CodeOffIcon fontSize="small" />}
          </IconButton>
          </span>
        </Tooltip>
      )}

      {/* Outline toggle (lg 以上のみ表示) */}
      <Tooltip title={t("outline")}>
        <span>
        <IconButton aria-label={t("outline")}
          size="small"
          onClick={onToggleOutline}
          disabled={inlineMergeOpen}
          color={outlineOpen ? "primary" : "default"}
          sx={{ display: { xs: "none", lg: "inline-flex" } }}
        >
          <ListAltIcon fontSize="small" />
        </IconButton>
        </span>
      </Tooltip>

      {/* Compare toggle (md 以上のみ表示) */}
      <ToggleButtonGroup
        value={inlineMergeOpen ? "compare" : "edit"}
        exclusive
        size="small"
        sx={{ height: 30, display: { xs: "none", lg: "inline-flex" } }}
      >
        <ToggleButton
          value="edit"
          aria-label={t("normalMode")}
          onClick={() => { if (inlineMergeOpen) onMerge(); }}
          sx={{ px: 0.75, py: 0.25 }}
        >
          <Tooltip title={tip(t, "normalMode")}>
            <EditNoteIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton
          value="compare"
          aria-label={t("compare")}
          onClick={() => { if (!inlineMergeOpen) onMerge(); }}
          sx={{ px: 0.75, py: 0.25 }}
        >
          <Tooltip title={tip(t, "compareMode")}>
            <ViewStreamIcon fontSize="small" sx={{ transform: "rotate(90deg)" }} />
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      {/* Right panel file ops (compare mode only) */}
      {inlineMergeOpen && (
        <>
          <Tooltip title={t("mergeLoadFileRight")}>
            <IconButton size="small" onClick={onLoadRightFile}>
              <FileUploadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("mergeExportRight")}>
            <IconButton size="small" onClick={onExportRightFile}>
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      )}

      {/* Source / WYSIWYG toggle */}
      <ToggleButtonGroup
        value={sourceMode ? "source" : "wysiwyg"}
        exclusive
        size="small"
        sx={{ height: 30 }}
      >
        <ToggleButton
          value="wysiwyg"
          aria-label={t("wysiwyg")}
          onClick={onSwitchToWysiwyg}
          sx={{ px: 0.75, py: 0.25 }}
        >
          <Tooltip title={tip(t, "sourceMode")}>
            <WysiwygIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton
          value="source"
          aria-label={t("source")}
          onClick={onSwitchToSource}
          sx={{ px: 0.75, py: 0.25 }}
        >
          <Tooltip title={tip(t, "sourceMode")}>
            <CodeIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      {/* More menu */}
      {!hideMoreMenu && (
        <Tooltip title={t("more")}>
          <IconButton aria-label={t("more")}
            size="small"
            onClick={(e) => onSetHelpAnchor(e.currentTarget)}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Paper>
    </>
  );
}
