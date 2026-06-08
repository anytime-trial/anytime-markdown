import {
  ChatBubbleOutlineIcon,
  CheckBoxIcon,
  FormatListBulletedIcon,
  FormatListNumberedIcon,
  FormatQuoteIcon,
  InfoOutlinedIcon,
  ListAltIcon,
  SchemaIcon,
  SettingsIcon,
} from "../ui/icons";
import { IconButton } from "../ui/IconButton";
import { ListItemIcon } from "../ui/ListItemIcon";
import { ListItemText } from "../ui/ListItemText";
import { MenuItem } from "../ui/MenuItem";
import { Popover } from "../ui/Popover";
import { Tooltip } from "../ui/Tooltip";
import styles from "./EditorMenuPopovers.module.css";
import { Divider } from "../ui/Divider";
import type { Editor } from "@anytime-markdown/markdown-react";
import React, { useMemo } from "react";

import { getDivider } from "../constants/colors";
import { useIsDark } from "../contexts/ThemeModeContext";
import { MENU_ITEM_FONT_SIZE } from "../constants/dimensions";
import { PLANTUML_SAMPLES } from "../constants/samples";
import { getBuiltinTemplates, type MarkdownTemplate } from "../constants/templates";
import { useMarkdownLocale } from "../i18n/context";
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
  const locale = useMarkdownLocale();
  const isDark = useIsDark();
  const builtinTemplates = useMemo(() => getBuiltinTemplates(locale), [locale]);

  return (
    <>
      {/* Help popover */}
      <Popover
        open={!!helpAnchorEl}
        anchorEl={helpAnchorEl}
        onClose={() => setHelpAnchorEl(null)}
        paperRole="menu"
        aria-label={t("helpMenu")}
      >
        <div style={{ paddingTop: 4, paddingBottom: 4, minWidth: 160 }}>
          {onToggleOutline && (
            <MenuItem
              onClick={() => { onToggleOutline(); setHelpAnchorEl(null); }}
              disabled={sourceMode}
              style={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36 }}
            >
              <ListItemIcon><ListAltIcon fontSize="small" color={outlineOpen ? "primary" : "inherit"} /></ListItemIcon>
              <ListItemText>{t("outline")}</ListItemText>
            </MenuItem>
          )}
          {onToggleComments && (
            <MenuItem
              onClick={() => { onToggleComments(); setHelpAnchorEl(null); }}
              disabled={sourceMode}
              style={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36 }}
            >
              <ListItemIcon><ChatBubbleOutlineIcon fontSize="small" color={commentOpen ? "primary" : "inherit"} /></ListItemIcon>
              <ListItemText>{t("commentPanel")}</ListItemText>
            </MenuItem>
          )}
          {onOpenSettings && (
            <MenuItem
              onClick={() => { onOpenSettings(); setHelpAnchorEl(null); }}
              style={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36 }}
            >
              <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t("editorSettings")}</ListItemText>
            </MenuItem>
          )}
          {(onToggleOutline || onToggleComments || onOpenSettings) && !hideVersionInfo && <Divider />}
          {!hideVersionInfo && (
            <MenuItem
              onClick={() => { setVersionDialogOpen(true); setHelpAnchorEl(null); }}
              style={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36 }}
            >
              <ListItemIcon><InfoOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t("versionInfo")}</ListItemText>
            </MenuItem>
          )}
        </div>
      </Popover>

      {/* 図挿入選択 popover */}
      <Popover
        open={!!diagramAnchorEl}
        anchorEl={diagramAnchorEl}
        onClose={() => setDiagramAnchorEl(null)}
        paperRole="menu"
        aria-label={t("diagramMenu")}
      >
        <div style={{ display: "flex", flexDirection: "column", padding: 4 }}>
          <Tooltip title={t("mermaid")} placement="right">
            <IconButton
              autoFocus
              size="small"
              role="menuitem"
              aria-label={t("mermaid")}
              className={styles.diagramIconButton}
              onClick={() => {
                if (sourceMode) {
                  onSourceInsertMermaid?.();
                } else {
                  editor?.chain().focus().setCodeBlock({ language: "mermaid" }).run();
                  editor?.commands.insertContent({ type: "text", text: "" });
                }
                setDiagramAnchorEl(null);
              }}
            >
              <MermaidIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("plantuml")} placement="right">
            <IconButton
              size="small"
              role="menuitem"
              aria-label={t("plantuml")}
              className={styles.diagramIconButton}
              onClick={() => {
                if (sourceMode) {
                  onSourceInsertPlantUml?.();
                } else {
                  editor?.chain().focus().setCodeBlock({ language: "plantuml" }).run();
                }
                setDiagramAnchorEl(null);
              }}
            >
              <SchemaIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      </Popover>

      {/* PlantUML サンプル選択 popover */}
      <Popover
        open={!!sampleAnchorEl}
        anchorEl={sampleAnchorEl}
        onClose={() => setSampleAnchorEl(null)}
        paperRole="menu"
        aria-label={t("plantumlSampleMenu")}
      >
        <div style={{ display: "flex", flexDirection: "column", padding: 4 }}>
          {PLANTUML_SAMPLES.filter((s) => s.enabled).map((sample, idx) => {
            const code = sample.code;
            return (
              <Tooltip key={sample.label} title={t(sample.i18nKey)} placement="right">
                <IconButton
                  autoFocus={idx === 0}
                  size="small"
                  role="menuitem"
                  aria-label={t(sample.i18nKey)}
                  className={styles.diagramIconButton}
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
                >
                  <span aria-hidden="true" style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, lineHeight: 1, border: "1px solid", borderColor: getDivider(isDark), borderRadius: 2, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>{sample.icon}</span>
                </IconButton>
              </Tooltip>
            );
          })}
        </div>
      </Popover>

      {/* Template selection popover */}
      <Popover
        open={!!templateAnchorEl}
        anchorEl={templateAnchorEl}
        onClose={() => setTemplateAnchorEl(null)}
        paperRole="menu"
        aria-label={t("templateMenu")}
      >
        <div style={{ paddingTop: 4, paddingBottom: 4, minWidth: 180 }}>
          {builtinTemplates.map((tmpl) => (
            <MenuItem
              key={tmpl.id}
              onClick={() => { onInsertTemplate(tmpl); setTemplateAnchorEl(null); }}
              style={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36 }}
            >
              {t(tmpl.name)}
            </MenuItem>
          ))}
        </div>
      </Popover>

      {/* Heading level change popover */}
      <Popover
        open={!!headingMenu}
        anchorEl={headingMenu?.anchorEl ?? null}
        onClose={() => setHeadingMenu(null)}
        paperRole="menu"
        aria-label={t("headingMenu")}
      >
        <div style={{ paddingTop: 4, paddingBottom: 4 }}>
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
              style={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36 }}
            >
              {label}
            </MenuItem>
          ))}
          <Divider style={{ marginTop: 4, marginBottom: 4 }} />
          <MenuItem
            onClick={() => {
              if (!editor || !headingMenu) return;
              editor.chain().focus().setTextSelection(headingMenu.pos).toggleBulletList().run();
              setHeadingMenu(null);
            }}
            selected={editor?.isActive("bulletList")}
            style={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36, gap: 8 }}
          >
            <FormatListBulletedIcon fontSize={18} />
            {t("bulletList")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              if (!editor || !headingMenu) return;
              editor.chain().focus().setTextSelection(headingMenu.pos).toggleOrderedList().run();
              setHeadingMenu(null);
            }}
            selected={editor?.isActive("orderedList")}
            style={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36, gap: 8 }}
          >
            <FormatListNumberedIcon fontSize={18} />
            {t("orderedList")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              if (!editor || !headingMenu) return;
              editor.chain().focus().setTextSelection(headingMenu.pos).toggleTaskList().run();
              setHeadingMenu(null);
            }}
            selected={editor?.isActive("taskList")}
            style={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36, gap: 8 }}
          >
            <CheckBoxIcon fontSize={18} />
            {t("taskList")}
          </MenuItem>
          <Divider style={{ marginTop: 4, marginBottom: 4 }} />
          <MenuItem
            onClick={() => {
              if (!editor || !headingMenu) return;
              editor.chain().focus().setTextSelection(headingMenu.pos).toggleBlockquote().run();
              setHeadingMenu(null);
            }}
            selected={editor?.isActive("blockquote")}
            style={{ fontSize: MENU_ITEM_FONT_SIZE, minHeight: 36, gap: 8 }}
          >
            <FormatQuoteIcon fontSize={18} />
            {t("blockquote")}
          </MenuItem>
        </div>
      </Popover>
    </>
  );
});
