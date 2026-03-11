import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import DescriptionIcon from "@mui/icons-material/Description";
import DownloadIcon from "@mui/icons-material/Download";
import WysiwygIcon from "@mui/icons-material/Wysiwyg";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import SaveIcon from "@mui/icons-material/Save";
import SaveAsIcon from "@mui/icons-material/SaveAs";

import MenuIcon from "@mui/icons-material/Menu";
import VisibilityIcon from "@mui/icons-material/Visibility";


import ViewStreamIcon from "@mui/icons-material/ViewStream";
import EditNoteIcon from "@mui/icons-material/EditNote";
import ListAltIcon from "@mui/icons-material/ListAlt";
import RedoIcon from "@mui/icons-material/Redo";

import UndoIcon from "@mui/icons-material/Undo";
import CodeIcon from "@mui/icons-material/Code";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import SettingsIcon from "@mui/icons-material/Settings";

import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import LockIcon from "@mui/icons-material/Lock";

import {
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  useTheme,
} from "@mui/material";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";

import React, { useCallback, useRef, useState } from "react";
import type { TranslationFn } from "../types";
import { modKey } from "../constants/shortcuts";
import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, DEFAULT_LIGHT_TEXT } from "../constants/colors";

import type { MergeUndoRedo } from "./InlineMergeView";

/** WAI-ARIA Toolbar パターン: 矢印キーでフォーカス移動 */
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [role="button"]:not([disabled]), input:not([disabled])';

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

interface EditorToolbarProps {
  editor: Editor | null;
  isInDiagramBlock: boolean;

  onToggleAllBlocks: () => void;
  onDownload: () => void;
  onImport: () => void;
  onClear: () => void;
  onSetTemplateAnchor: (el: HTMLElement) => void;
  onSetHelpAnchor: (el: HTMLElement) => void;
  sourceMode: boolean;
  readonlyMode?: boolean;
  reviewMode?: boolean;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  onMerge: () => void;
  inlineMergeOpen: boolean;
  onSwitchToSource: () => void;
  onSwitchToWysiwyg: () => void;
  onSwitchToReview?: () => void;
  onSwitchToReadonly?: () => void;

  mergeUndoRedo?: MergeUndoRedo | null;
  hideFileOps?: boolean;
  hideUndoRedo?: boolean;
  hideMoreMenu?: boolean;
  hideSettings?: boolean;
  hideVersionInfo?: boolean;
  onOpenSettings?: () => void;
  onOpenVersionDialog?: () => void;
  onLoadRightFile?: () => void;
  onExportRightFile?: () => void;
  onOpenFile?: () => void;
  onSaveFile?: () => void;
  onSaveAsFile?: () => void;
  hasFileHandle?: boolean;
  supportsDirectAccess?: boolean;
  onExportPdf?: () => void;
  onAnnounce?: (message: string) => void;
  commentOpen?: boolean;
  onToggleComments?: () => void;
  hideModeToggle?: boolean;
  hideReadonlyToggle?: boolean;
  hideOutline?: boolean;
  hideComments?: boolean;
  hideTemplates?: boolean;
  hideFoldAll?: boolean;
  t: TranslationFn;
}

export const EditorToolbar = React.memo(function EditorToolbar({
  editor,
  isInDiagramBlock: _isInDiagramBlock,

  onToggleAllBlocks,
  onDownload,
  onImport,
  onClear,
  onSetTemplateAnchor,
  onSetHelpAnchor,
  sourceMode,
  readonlyMode,
  reviewMode,
  outlineOpen,
  onToggleOutline,
  onMerge,
  inlineMergeOpen,
  onSwitchToSource,
  onSwitchToWysiwyg,
  onSwitchToReview,
  onSwitchToReadonly,

  mergeUndoRedo,
  hideFileOps,
  hideUndoRedo,
  hideMoreMenu,
  hideSettings,
  hideVersionInfo,
  onOpenSettings,
  onOpenVersionDialog,
  onLoadRightFile,
  onExportRightFile,
  onOpenFile,
  onSaveFile,
  onSaveAsFile,
  hasFileHandle,
  onAnnounce: _onAnnounce,
  supportsDirectAccess,
  onExportPdf,
  commentOpen,
  onToggleComments,
  hideModeToggle,
  hideReadonlyToggle,
  hideOutline,
  hideComments,
  hideTemplates,
  hideFoldAll,
  t,
}: EditorToolbarProps) {
  const isDark = useTheme().palette.mode === "dark";
  const [fileMenuAnchorEl, setFileMenuAnchorEl] = useState<HTMLElement | null>(null);

  const [mobileMenuAnchorEl, setMobileMenuAnchorEl] = useState<HTMLElement | null>(null);

  const mobileMoreRef = useRef<HTMLButtonElement>(null);

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
    },
  });

  return (
    <>
    <Paper
      id="md-editor-toolbar"
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
        borderBottom: inlineMergeOpen ? undefined : "none",
        position: "sticky",
        top: 0,
        zIndex: 10,
        bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
        color: isDark ? undefined : DEFAULT_LIGHT_TEXT,
      }}
    >
      {/* File actions */}
      {!hideFileOps && (
        <>
          {/* Mobile: single file menu button */}
          <IconButton
            size="small"
            aria-label={t("fileActions")}
            onClick={(e) => setFileMenuAnchorEl(e.currentTarget)}
            sx={{ display: { xs: "inline-flex", md: "none" } }}
          >
            <InsertDriveFileIcon fontSize="small" />
          </IconButton>
          <Menu
            anchorEl={fileMenuAnchorEl}
            open={!!fileMenuAnchorEl}
            onClose={() => setFileMenuAnchorEl(null)}
          >
            <MenuItem onClick={() => { onClear(); setFileMenuAnchorEl(null); }} disabled={readonlyMode || reviewMode}>
              <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t("createNew")}</ListItemText>
            </MenuItem>
            {supportsDirectAccess ? ([
              <MenuItem key="open" onClick={() => { onOpenFile?.(); setFileMenuAnchorEl(null); }}>
                <ListItemIcon><FolderOpenIcon fontSize="small" /></ListItemIcon>
                <ListItemText>{t("openFile")}</ListItemText>
              </MenuItem>,
              <MenuItem key="save" onClick={() => { onSaveFile?.(); setFileMenuAnchorEl(null); }} disabled={!hasFileHandle}>
                <ListItemIcon><SaveIcon fontSize="small" /></ListItemIcon>
                <ListItemText>{t("saveFile")}</ListItemText>
              </MenuItem>,
              <MenuItem key="saveAs" onClick={() => { onSaveAsFile?.(); setFileMenuAnchorEl(null); }}>
                <ListItemIcon><SaveAsIcon fontSize="small" /></ListItemIcon>
                <ListItemText>{t("saveAsFile")}</ListItemText>
              </MenuItem>,
            ]) : ([
              <MenuItem key="upload" onClick={() => { onImport(); setFileMenuAnchorEl(null); }} disabled={readonlyMode || reviewMode}>
                <ListItemIcon><FileUploadIcon fontSize="small" /></ListItemIcon>
                <ListItemText>{t("upload")}</ListItemText>
              </MenuItem>,
              <MenuItem key="download" onClick={() => { onDownload(); setFileMenuAnchorEl(null); }}>
                <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
                <ListItemText>{t("download")}</ListItemText>
              </MenuItem>,
            ])}
            {onExportPdf && (
              <MenuItem onClick={() => { onExportPdf(); setFileMenuAnchorEl(null); }} disabled={sourceMode || inlineMergeOpen}>
                <ListItemIcon><PictureAsPdfIcon fontSize="small" /></ListItemIcon>
                <ListItemText>{t("exportPdf")}</ListItemText>
              </MenuItem>
            )}
          </Menu>

          {/* Desktop: individual file buttons */}
          <Box sx={{ display: { xs: "none", md: "contents" } }}>
            <ToggleButtonGroup size="small" aria-label={t("fileActions")} sx={{ height: 30 }}>
              <ToggleButton value="new" onClick={onClear} disabled={readonlyMode || reviewMode} aria-label={t("createNew")} sx={{ px: 0.75, py: 0.25 }}>
                <Tooltip title={tip(t, "createNew")}>
                  <DescriptionIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
            {supportsDirectAccess ? ([
              <ToggleButton key="open" value="open" onClick={onOpenFile} aria-label={t("openFile")} sx={{ px: 0.75, py: 0.25 }}>
                <Tooltip title={tip(t, "openFile")}>
                  <FolderOpenIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>,
              <ToggleButton key="save" value="save" onClick={onSaveFile} disabled={!hasFileHandle} aria-label={t("saveFile")} sx={{ px: 0.75, py: 0.25 }}>
                <Tooltip title={hasFileHandle ? tip(t, "saveFile") : t("saveFileNoHandle")}>
                  <span style={{ display: "inline-flex" }}><SaveIcon fontSize="small" /></span>
                </Tooltip>
              </ToggleButton>,
              <ToggleButton key="saveAs" value="saveAs" onClick={onSaveAsFile} aria-label={t("saveAsFile")} sx={{ px: 0.75, py: 0.25 }}>
                <Tooltip title={tip(t, "saveAsFile")}>
                  <SaveAsIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>,
            ]) : ([
              <ToggleButton key="upload" value="upload" onClick={onImport} disabled={readonlyMode || reviewMode} aria-label={t("upload")} sx={{ px: 0.75, py: 0.25 }}>
                <Tooltip title={tip(t, "upload")}>
                  <FileUploadIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>,
              <ToggleButton key="download" value="download" onClick={onDownload} aria-label={t("download")} sx={{ px: 0.75, py: 0.25 }}>
                <Tooltip title={tip(t, "download")}>
                  <DownloadIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>,
            ])}
            {onExportPdf && (
              <ToggleButton value="exportPdf" onClick={onExportPdf} disabled={sourceMode || inlineMergeOpen} aria-label={t("exportPdf")} sx={{ px: 0.75, py: 0.25 }}>
                <Tooltip title={t("exportPdf")}>
                  <span style={{ display: "inline-flex" }}><PictureAsPdfIcon fontSize="small" /></span>
                </Tooltip>
              </ToggleButton>
            )}
            </ToggleButtonGroup>
            {inlineMergeOpen && (
              <>
                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                <ToggleButtonGroup size="small" aria-label={t("mergeRight")} sx={{ height: 30 }}>
                  <ToggleButton value="open" onClick={onLoadRightFile} aria-label={t("loadCompareFile")} sx={{ px: 0.75, py: 0.25 }}>
                    <Tooltip title={t("mergeLoadFileRight")}>
                      <FolderOpenIcon fontSize="small" />
                    </Tooltip>
                  </ToggleButton>
                </ToggleButtonGroup>
              </>
            )}
          </Box>
        </>
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

      {/* Fold/Unfold, DiagramCode, Outline - hidden on mobile */}
      <Box sx={{ display: { xs: "none", md: "contents" } }}>
      <ToggleButtonGroup size="small" aria-label={t("view")} sx={{ height: 30 }}>
        {!hideOutline && <ToggleButton value="outline" selected={outlineOpen} onClick={onToggleOutline} disabled={inlineMergeOpen || sourceMode} aria-label={t("outline")} sx={{ px: 0.75, py: 0.25 }}>
          <Tooltip title={tip(t, "outline")}>
            <span style={{ display: "inline-flex" }}><ListAltIcon fontSize="small" /></span>
          </Tooltip>
        </ToggleButton>}
        {!hideComments && onToggleComments && (
          <ToggleButton value="comments" selected={commentOpen} onClick={onToggleComments} disabled={inlineMergeOpen || sourceMode} aria-label={t("commentPanel") || "Comments"} sx={{ px: 0.75, py: 0.25 }}>
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
        value={readonlyMode ? "readonly" : reviewMode ? "review" : sourceMode ? "source" : "wysiwyg"}
        exclusive
        size="small"
        aria-label={t("editMode")}
        sx={{
          height: 34,
          borderRadius: "20px",
          bgcolor: "action.hover",
          p: 0.25,
          "& .MuiToggleButton-root": {
            border: "none",
            borderRadius: "20px !important",
            px: 2,
            py: 0,
            gap: 0.5,
            fontSize: "0.8rem",
            textTransform: "none",
            lineHeight: 1,
          },
          "& .Mui-selected": {
            bgcolor: "background.paper !important",
            color: "text.primary !important",
            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          },
          "& .MuiToggleButton-root:not(.Mui-selected)": {
            bgcolor: "transparent",
            color: "text.secondary",
            "&:hover": {
              bgcolor: "action.selected",
            },
          },
        }}
      >
        {!hideReadonlyToggle && (
          <ToggleButton
            value="readonly"
            aria-label={t("readonly")}
            onClick={onSwitchToReadonly}
          >
            <LockIcon sx={{ fontSize: "1rem" }} />
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{t("readonly")}</Box>
          </ToggleButton>
        )}
        <ToggleButton
          value="review"
          aria-label={t("review")}
          onClick={onSwitchToReview}
        >
          <VisibilityIcon sx={{ fontSize: "1rem" }} />
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{t("review")}</Box>
        </ToggleButton>
        <ToggleButton
          value="wysiwyg"
          aria-label={t("wysiwyg")}
          onClick={onSwitchToWysiwyg}
        >
          <WysiwygIcon sx={{ fontSize: "1rem" }} />
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{t("wysiwyg")}</Box>
        </ToggleButton>
        <ToggleButton
          value="source"
          aria-label={t("source")}
          onClick={onSwitchToSource}
        >
          <CodeIcon sx={{ fontSize: "1rem" }} />
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{t("source")}</Box>
        </ToggleButton>
      </ToggleButtonGroup>}

      {/* Compare toggle (md 以上のみ表示) */}
      {!hideModeToggle && <ToggleButtonGroup
        value={inlineMergeOpen ? "compare" : "edit"}
        exclusive
        size="small"
        aria-label={t("compareMode")}
        sx={{
          height: 34,
          borderRadius: "20px",
          bgcolor: "action.hover",
          p: 0.25,
          display: { xs: "none", md: "inline-flex" },
          "& .MuiToggleButton-root": {
            border: "none",
            borderRadius: "20px !important",
            px: 2,
            py: 0,
            gap: 0.5,
            fontSize: "0.8rem",
            textTransform: "none",
            lineHeight: 1,
          },
          "& .Mui-selected": {
            bgcolor: "background.paper !important",
            color: "text.primary !important",
            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          },
          "& .MuiToggleButton-root:not(.Mui-selected)": {
            bgcolor: "transparent",
            color: "text.secondary",
            "&:hover": {
              bgcolor: "action.selected",
            },
          },
        }}
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

      {/* More menu - desktop: help/settings, mobile: all hidden items */}
      {!hideMoreMenu && (
        <>
          <Box sx={{ display: { xs: "none", md: "contents" } }}>
            <Tooltip title={t("more")}>
              <IconButton aria-label={t("more")}
                size="small"
                onClick={(e) => onSetHelpAnchor(e.currentTarget)}
              >
                <MenuIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <IconButton
            ref={mobileMoreRef}
            aria-label={t("more")}
            size="small"
            onClick={(e) => setMobileMenuAnchorEl(e.currentTarget)}
            sx={{ display: { xs: "inline-flex", md: "none" } }}
          >
            <MenuIcon fontSize="small" />
          </IconButton>
        </>
      )}
    </Paper>

    {/* Mobile More menu */}
    <Menu
      anchorEl={mobileMenuAnchorEl}
      open={!!mobileMenuAnchorEl}
      onClose={() => setMobileMenuAnchorEl(null)}
    >
      {!hideOutline && <MenuItem
        onClick={() => { onToggleOutline(); setMobileMenuAnchorEl(null); }}
        disabled={inlineMergeOpen || sourceMode}
      >
        <ListItemIcon><ListAltIcon fontSize="small" color={outlineOpen ? "primary" : "inherit"} /></ListItemIcon>
        <ListItemText>{t("outline")}</ListItemText>
      </MenuItem>}
      {!hideComments && onToggleComments && (
        <MenuItem
          onClick={() => { onToggleComments(); setMobileMenuAnchorEl(null); }}
          disabled={inlineMergeOpen || sourceMode}
        >
          <ListItemIcon><ChatBubbleOutlineIcon fontSize="small" color={commentOpen ? "primary" : "inherit"} /></ListItemIcon>
          <ListItemText>{t("commentPanel") || "Comments"}</ListItemText>
        </MenuItem>
      )}
      <MenuItem
        onClick={() => { onMerge(); setMobileMenuAnchorEl(null); }}
        disabled={readonlyMode}
      >
        <ListItemIcon>
          <ViewStreamIcon fontSize="small" sx={{ transform: "rotate(90deg)" }} color={inlineMergeOpen ? "primary" : "inherit"} />
        </ListItemIcon>
        <ListItemText>{inlineMergeOpen ? t("normalMode") : t("compare")}</ListItemText>
      </MenuItem>
      <Divider />
      <MenuItem
        onClick={() => {
          setMobileMenuAnchorEl(null);
          if (mobileMoreRef.current) onSetHelpAnchor(mobileMoreRef.current);
        }}
      >
        <ListItemIcon><InfoOutlinedIcon fontSize="small" /></ListItemIcon>
        <ListItemText>{t("helpMenu")}</ListItemText>
      </MenuItem>
      {!hideSettings && (
        <MenuItem
          onClick={() => { onOpenSettings?.(); setMobileMenuAnchorEl(null); }}
        >
          <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("editorSettings")}</ListItemText>
        </MenuItem>
      )}
      {!hideVersionInfo && (
        <MenuItem
          onClick={() => { onOpenVersionDialog?.(); setMobileMenuAnchorEl(null); }}
        >
          <ListItemIcon><InfoOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("versionInfo")}</ListItemText>
        </MenuItem>
      )}
    </Menu>
    </>
  );
});
