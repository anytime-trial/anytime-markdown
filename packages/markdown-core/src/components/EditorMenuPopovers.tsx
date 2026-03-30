import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ListAltIcon from "@mui/icons-material/ListAlt";
import SchemaIcon from "@mui/icons-material/Schema";
import SettingsIcon from "@mui/icons-material/Settings";
import {
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Popover,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import type { Editor } from "@tiptap/react";
import { useLocale } from "next-intl";
import React, { useMemo } from "react";

import { getDivider } from "../constants/colors";
import { MENU_ITEM_FONT_SIZE } from "../constants/dimensions";
import { PLANTUML_SAMPLES } from "../constants/samples";
import { getBuiltinTemplates, type MarkdownTemplate } from "../constants/templates";
import MermaidIcon from "../icons/MermaidIcon";
import type { TranslationFn } from "../types";


interface EditorMenuPopoversProps {
  editor: Editor | null;
  helpAnchorEl: HTMLElement | null;
  setHelpAnchorEl: (el: HTMLElement | null) => void;
  diagramAnchorEl: HTMLElement | null;
  setDiagramAnchorEl: (el: HTMLElement | null) => void;
  sampleAnchorEl: HTMLElement | null;
  setSampleAnchorEl: (el: HTMLElement | null) => void;
  templateAnchorEl: HTMLElement | null;
  setTemplateAnchorEl: (el: HTMLElement | null) => void;
  onInsertTemplate: (template: MarkdownTemplate) => void;
  sourceMode?: boolean;
  onSourceInsertMermaid?: () => void;
  onSourceInsertPlantUml?: () => void;
  headingMenu: { anchorEl: HTMLElement; pos: number; currentLevel: number } | null;
  setHeadingMenu: (menu: { anchorEl: HTMLElement; pos: number; currentLevel: number } | null) => void;
  setSettingsOpen: (open: boolean) => void;
  setVersionDialogOpen: (open: boolean) => void;
  hideSettings?: boolean;
  hideVersionInfo?: boolean;
  hideTemplates?: boolean;
  templateDisabled?: boolean;
  outlineOpen?: boolean;
  commentOpen?: boolean;
  onToggleOutline?: () => void;
  onToggleComments?: () => void;
  onOpenSettings?: () => void;
  t: TranslationFn;
}

function stripListAndBlockquote(editor: Editor, anchorEl: HTMLElement): { chain: ReturnType<ReturnType<Editor["chain"]>["focus"]>; inBlockquote: boolean } {
  const inBlockquote = anchorEl.tagName.toLowerCase() === "blockquote" || !!anchorEl.closest("blockquote");
  const parentList = anchorEl.closest("ul, ol") as HTMLElement | null;
  const inTaskList = !!parentList?.dataset.type?.includes("taskList");
  const inBulletList = !inTaskList && parentList?.tagName.toLowerCase() === "ul";
  const inOrderedList = parentList?.tagName.toLowerCase() === "ol";
  const chain = editor.chain().focus();
  if (inBulletList) chain.toggleBulletList();
  else if (inOrderedList) chain.toggleOrderedList();
  else if (inTaskList) chain.toggleTaskList();
  if (inBlockquote) chain.lift("blockquote");
  return { chain, inBlockquote };
}

function applyHeadingLevel(editor: Editor, headingMenu: { anchorEl: HTMLElement; pos: number }, level: number) {
  editor.chain().focus().setTextSelection(headingMenu.pos).run();
  const { chain, inBlockquote } = stripListAndBlockquote(editor, headingMenu.anchorEl);
  if (level === 0) {
    if (!inBlockquote) chain.setParagraph();
  } else {
    chain.setHeading({ level: level as 1 | 2 | 3 | 4 | 5 });
  }
  chain.run();
}

export const EditorMenuPopovers = React.memo(function EditorMenuPopovers({
  editor,
  helpAnchorEl, setHelpAnchorEl,
  diagramAnchorEl, setDiagramAnchorEl,
  sampleAnchorEl, setSampleAnchorEl,
  templateAnchorEl, setTemplateAnchorEl, onInsertTemplate,
  sourceMode, onSourceInsertMermaid, onSourceInsertPlantUml,
  headingMenu, setHeadingMenu,
  setSettingsOpen: _setSettingsOpen, setVersionDialogOpen,
  hideSettings: _hideSettings,
  hideVersionInfo,
  hideTemplates: _hideTemplates,
  templateDisabled: _templateDisabled,
  outlineOpen,
  commentOpen,
  onToggleOutline,
  onToggleComments,
  onOpenSettings,
  t,
}: EditorMenuPopoversProps) {
  const locale = useLocale();
  const isDark = useTheme().palette.mode === "dark";
  const builtinTemplates = useMemo(() => getBuiltinTemplates(locale), [locale]);

  return (
    <>
      {/* Help popover */}
      <Popover
        open={!!helpAnchorEl}
        anchorEl={helpAnchorEl}
        onClose={() => setHelpAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { role: "menu", "aria-label": t("helpMenu") } }}
      >
        <Box sx={{ py: 0.5, minWidth: 160 }}>
          {onToggleOutline && (
            <MenuItem
              onClick={() => { onToggleOutline(); setHelpAnchorEl(null); }}
              disabled={sourceMode}
              sx={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36 }}
            >
              <ListItemIcon><ListAltIcon fontSize="small" color={outlineOpen ? "primary" : "inherit"} /></ListItemIcon>
              <ListItemText>{t("outline")}</ListItemText>
            </MenuItem>
          )}
          {onToggleComments && (
            <MenuItem
              onClick={() => { onToggleComments(); setHelpAnchorEl(null); }}
              disabled={sourceMode}
              sx={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36 }}
            >
              <ListItemIcon><ChatBubbleOutlineIcon fontSize="small" color={commentOpen ? "primary" : "inherit"} /></ListItemIcon>
              <ListItemText>{t("commentPanel")}</ListItemText>
            </MenuItem>
          )}
          {onOpenSettings && (
            <MenuItem
              onClick={() => { onOpenSettings(); setHelpAnchorEl(null); }}
              sx={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36 }}
            >
              <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t("editorSettings")}</ListItemText>
            </MenuItem>
          )}
          {(onToggleOutline || onToggleComments || onOpenSettings) && !hideVersionInfo && <Divider />}
          {!hideVersionInfo && (
            <MenuItem
              onClick={() => { setVersionDialogOpen(true); setHelpAnchorEl(null); }}
              sx={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36 }}
            >
              <ListItemIcon><InfoOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t("versionInfo")}</ListItemText>
            </MenuItem>
          )}
        </Box>
      </Popover>

      {/* 図挿入選択 popover */}
      <Popover
        open={!!diagramAnchorEl}
        anchorEl={diagramAnchorEl}
        onClose={() => setDiagramAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { role: "menu", "aria-label": t("diagramMenu") } }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", p: 0.5 }}>
          <Tooltip title={t("mermaid")} placement="right">
            <IconButton
              autoFocus
              size="small"
              role="menuitem"
              aria-label={t("mermaid")}
              onClick={() => {
                if (sourceMode) {
                  onSourceInsertMermaid?.();
                } else {
                  editor?.chain().focus().setCodeBlock({ language: "mermaid" }).run();
                  editor?.commands.insertContent({ type: "text", text: "" });
                }
                setDiagramAnchorEl(null);
              }}
              sx={{ minWidth: 32, minHeight: 32 }}
            >
              <MermaidIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("plantuml")} placement="right">
            <IconButton
              size="small"
              role="menuitem"
              aria-label={t("plantuml")}
              onClick={() => {
                if (sourceMode) {
                  onSourceInsertPlantUml?.();
                } else {
                  editor?.chain().focus().setCodeBlock({ language: "plantuml" }).run();
                }
                setDiagramAnchorEl(null);
              }}
              sx={{ minWidth: 32, minHeight: 32 }}
            >
              <SchemaIcon fontSize="small" />
            </IconButton>
          </Tooltip>

        </Box>
      </Popover>

      {/* PlantUML サンプル選択 popover */}
      <Popover
        open={!!sampleAnchorEl}
        anchorEl={sampleAnchorEl}
        onClose={() => setSampleAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { role: "menu", "aria-label": t("plantumlSampleMenu") } }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", p: 0.5 }}>
          {PLANTUML_SAMPLES.filter((s) => s.enabled).map((sample, idx) => {
            const code = sample.code;
            return (
              <Tooltip key={sample.label} title={t(sample.i18nKey)} placement="right">
                <IconButton
                  autoFocus={idx === 0}
                  size="small"
                  role="menuitem"
                  aria-label={t(sample.i18nKey)}
                  onClick={() => {
                    if (!editor) return;
                    const { $from } = editor.state.selection;
                    let depth = $from.depth;
                    while (depth > 0) {
                      const node = $from.node(depth);
                      if (node.type.name === "codeBlock" && node.attrs.language === "plantuml") break;
                      depth--;
                    }
                    if (depth > 0) {
                      const start = $from.start(depth);
                      const end = $from.end(depth);
                      editor.chain().focus()
                        .command(({ tr }) => {
                          tr.replaceWith(start, end, editor.schema.text(code));
                          return true;
                        }).run();
                    }
                    setSampleAnchorEl(null);
                  }}
                  sx={{ minWidth: 32, minHeight: 32 }}
                >
                  <Typography aria-hidden="true" sx={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, lineHeight: 1, border: 1, borderColor: getDivider(isDark), borderRadius: 0.5, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>{sample.icon}</Typography>
                </IconButton>
              </Tooltip>
            );
          })}
        </Box>
      </Popover>

      {/* Template selection popover */}
      <Popover
        open={!!templateAnchorEl}
        anchorEl={templateAnchorEl}
        onClose={() => setTemplateAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { role: "menu", "aria-label": t("templateMenu") } }}
      >
        <Box sx={{ py: 0.5, minWidth: 180 }}>
          {builtinTemplates.map((tmpl) => (
            <MenuItem
              key={tmpl.id}
              onClick={() => { onInsertTemplate(tmpl); setTemplateAnchorEl(null); }}
              sx={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36 }}
            >
              {t(tmpl.name)}
            </MenuItem>
          ))}


        </Box>
      </Popover>

      {/* Heading level change popover */}
      <Popover
        open={!!headingMenu}
        anchorEl={headingMenu?.anchorEl}
        onClose={() => setHeadingMenu(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { role: "menu", "aria-label": t("headingMenu") } }}
      >
        <Box sx={{ py: 0.5 }}>
          {[
            { level: 0, label: "Paragraph" },
            { level: 1, label: "H1" },
            { level: 2, label: "H2" },
            { level: 3, label: "H3" },
            { level: 4, label: "H4" },
            { level: 5, label: "H5" },
          ].map(({ level, label }) => (
            <MenuItem
              key={level}
              selected={
                headingMenu?.currentLevel === level
                && (level !== 0 || !(editor?.isActive("bulletList") || editor?.isActive("orderedList") || editor?.isActive("taskList") || editor?.isActive("blockquote")))
              }
              onClick={() => {
                if (!editor || !headingMenu) return;
                applyHeadingLevel(editor, headingMenu, level);
                setHeadingMenu(null);
              }}
              sx={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36 }}
            >
              {label}
            </MenuItem>
          ))}
          <Divider sx={{ my: 0.5 }} />
          <MenuItem
            onClick={() => {
              if (!editor || !headingMenu) return;
              editor.chain().focus().setTextSelection(headingMenu.pos).toggleBulletList().run();
              setHeadingMenu(null);
            }}
            selected={editor?.isActive("bulletList")}
            sx={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36, gap: 1 }}
          >
            <FormatListBulletedIcon sx={{ fontSize: 18 }} />
            {t("bulletList")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              if (!editor || !headingMenu) return;
              editor.chain().focus().setTextSelection(headingMenu.pos).toggleOrderedList().run();
              setHeadingMenu(null);
            }}
            selected={editor?.isActive("orderedList")}
            sx={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36, gap: 1 }}
          >
            <FormatListNumberedIcon sx={{ fontSize: 18 }} />
            {t("orderedList")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              if (!editor || !headingMenu) return;
              editor.chain().focus().setTextSelection(headingMenu.pos).toggleTaskList().run();
              setHeadingMenu(null);
            }}
            selected={editor?.isActive("taskList")}
            sx={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36, gap: 1 }}
          >
            <CheckBoxIcon sx={{ fontSize: 18 }} />
            {t("taskList")}
          </MenuItem>
          <Divider sx={{ my: 0.5 }} />
          <MenuItem
            onClick={() => {
              if (!editor || !headingMenu) return;
              editor.chain().focus().setTextSelection(headingMenu.pos).toggleBlockquote().run();
              setHeadingMenu(null);
            }}
            selected={editor?.isActive("blockquote")}
            sx={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36, gap: 1 }}
          >
            <FormatQuoteIcon sx={{ fontSize: 18 }} />
            {t("blockquote")}
          </MenuItem>
        </Box>
      </Popover>
    </>
  );
});
