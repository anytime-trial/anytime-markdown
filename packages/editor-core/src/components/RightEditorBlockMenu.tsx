import React from "react";
import {
  Box,
  Divider,
  MenuItem,
  Popover,
} from "@mui/material";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import type { Editor } from "@tiptap/react";

export interface HeadingMenuState {
  anchorEl: HTMLElement;
  pos: number;
  currentLevel: number;
}

interface RightEditorBlockMenuProps {
  headingMenu: HeadingMenuState | null;
  onClose: () => void;
  editor: Editor | null;
  t: (key: string) => string;
}

export function RightEditorBlockMenu({
  headingMenu,
  onClose,
  editor,
  t,
}: RightEditorBlockMenuProps) {
  return (
    <Popover
      open={!!headingMenu}
      anchorEl={headingMenu?.anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
    >
      <Box sx={{ py: 0.5 }}>
        {[
          { level: 0, label: t("headingParagraph") },
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
              const el = headingMenu.anchorEl;
              const inBlockquote = el.tagName.toLowerCase() === "blockquote" || !!el.closest("blockquote");
              const parentList = el.closest("ul, ol");
              const inTaskList = !!parentList?.getAttribute("data-type")?.includes("taskList");
              const inBulletList = !inTaskList && parentList?.tagName.toLowerCase() === "ul";
              const inOrderedList = parentList?.tagName.toLowerCase() === "ol";
              editor.chain().focus().setTextSelection(headingMenu.pos).run();
              const chain = editor.chain().focus();
              if (inBulletList) chain.toggleBulletList();
              else if (inOrderedList) chain.toggleOrderedList();
              else if (inTaskList) chain.toggleTaskList();
              if (inBlockquote) chain.lift("blockquote");
              if (level === 0) {
                chain.setParagraph();
              } else {
                chain.setHeading({ level: level as 1 | 2 | 3 | 4 | 5 });
              }
              chain.run();
              onClose();
            }}
            sx={{ fontSize: "0.85rem", minHeight: 36 }}
          >
            {label}
          </MenuItem>
        ))}
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          onClick={() => {
            if (!editor || !headingMenu) return;
            editor.chain().focus().setTextSelection(headingMenu.pos).toggleBulletList().run();
            onClose();
          }}
          selected={editor?.isActive("bulletList")}
          sx={{ fontSize: "0.85rem", minHeight: 36, gap: 1 }}
        >
          <FormatListBulletedIcon sx={{ fontSize: 18 }} />
          {t("bulletList")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!editor || !headingMenu) return;
            editor.chain().focus().setTextSelection(headingMenu.pos).toggleOrderedList().run();
            onClose();
          }}
          selected={editor?.isActive("orderedList")}
          sx={{ fontSize: "0.85rem", minHeight: 36, gap: 1 }}
        >
          <FormatListNumberedIcon sx={{ fontSize: 18 }} />
          {t("orderedList")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!editor || !headingMenu) return;
            editor.chain().focus().setTextSelection(headingMenu.pos).toggleTaskList().run();
            onClose();
          }}
          selected={editor?.isActive("taskList")}
          sx={{ fontSize: "0.85rem", minHeight: 36, gap: 1 }}
        >
          <CheckBoxIcon sx={{ fontSize: 18 }} />
          {t("taskList")}
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          onClick={() => {
            if (!editor || !headingMenu) return;
            editor.chain().focus().setTextSelection(headingMenu.pos).toggleBlockquote().run();
            onClose();
          }}
          selected={editor?.isActive("blockquote")}
          sx={{ fontSize: "0.85rem", minHeight: 36, gap: 1 }}
        >
          <FormatQuoteIcon sx={{ fontSize: 18 }} />
          {t("blockquote")}
        </MenuItem>
      </Box>
    </Popover>
  );
}
