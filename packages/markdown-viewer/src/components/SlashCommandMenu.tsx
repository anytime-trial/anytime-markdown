import { useTheme } from "@mui/material/styles";
import type { Editor } from "@anytime-markdown/markdown-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { getTextSecondary } from "../constants/colors";
import { SLASH_COMMAND_FONT_SIZE } from "../constants/dimensions";
import { Z_FULLSCREEN } from "../constants/zIndex";
import type { SlashCommandState } from "../extensions/slashCommandExtension";
import {
  filterSlashItems,
  slashCommandItems,
} from "../extensions/slashCommandItems";
import type { TranslationFn } from "../types";
import { ListItemIcon } from "../ui/ListItemIcon";
import { ListItemText } from "../ui/ListItemText";
import { MenuItem } from "../ui/MenuItem";
import { MenuList } from "../ui/MenuList";
import { Paper } from "../ui/Paper";
import { Text } from "../ui/Text";
import { useFloating } from "../ui/useFloating";

interface SlashCommandMenuProps {
  editor: Editor;
  t: TranslationFn;
  slashCommandCallbackRef: React.RefObject<(state: SlashCommandState) => void>;
}

export const SlashCommandMenu = React.memo(function SlashCommandMenu({
  editor,
  t,
  slashCommandCallbackRef,
}: SlashCommandMenuProps) {
  const isDark = useTheme().palette.mode === "dark";
  const [active, setActive] = useState(false);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedIndexRef = useRef(0);
  const menuListRef = useRef<HTMLUListElement>(null);

  // Keep ref in sync with state
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  const filteredItems = useMemo(() => filterSlashItems(slashCommandItems, query, t), [query, t]);

  const executeCommand = useCallback(
    (index: number) => {
      const item = filteredItems[index];
      if (!item) return;

      // Delete the "/" + query text
      const cursorPos = editor.state.selection.from;
      editor.chain().focus().deleteRange({ from, to: cursorPos }).run();

      // Execute the command
      item.action(editor);

      setActive(false);
      setQuery("");
      setSelectedIndex(0);
    },
    [editor, from, filteredItems],
  );

  // Handle state changes from the ProseMirror plugin
  useEffect(() => {
    slashCommandCallbackRef.current = (state: SlashCommandState) => {
      setActive(state.active);
      setQuery(state.query);
      setFrom(state.from);

      if (!state.active) {
        setSelectedIndex(0);
        return;
      }

      if (state.navigationKey === "ArrowDown") {
        setSelectedIndex((prev) => {
          const items = filterSlashItems(slashCommandItems, state.query, t);
          return prev < items.length - 1 ? prev + 1 : 0;
        });
      } else if (state.navigationKey === "ArrowUp") {
        setSelectedIndex((prev) => {
          const items = filterSlashItems(slashCommandItems, state.query, t);
          return prev > 0 ? prev - 1 : items.length - 1;
        });
      } else if (state.navigationKey === "Enter") {
        // Defer execution to avoid side effects during ProseMirror transaction
        setTimeout(() => {
          const currentIndex = selectedIndexRef.current;
          const items = filterSlashItems(slashCommandItems, state.query, t);
          const item = items[currentIndex];
          if (!item) return;

          const cursorPos = editor.state.selection.from;
          editor
            .chain()
            .focus()
            .deleteRange({ from: state.from, to: cursorPos })
            .run();
          item.action(editor);

          setActive(false);
          setQuery("");
          setSelectedIndex(0);
        }, 0);
      } else if (state.navigationKey === "Escape") {
        setActive(false);
        setQuery("");
        setSelectedIndex(0);
      }

      // Reset selectedIndex when query changes (non-navigation update)
      if (state.navigationKey === null) {
        setSelectedIndex(0);
      }
    };

    return () => {
      // Reset callback on unmount to prevent stale calls
      slashCommandCallbackRef.current = () => {};
    };
  }, [editor, t, slashCommandCallbackRef]);

  // Scroll selected item into view
  useEffect(() => {
    if (!active || !menuListRef.current) return;
    const items = menuListRef.current.querySelectorAll('[role="menuitem"]');
    items[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [active, selectedIndex]);

  // Build virtual anchor element from editor cursor position
  const virtualAnchor = React.useMemo(() => {
    if (!active || !editor?.view) return null;
    try {
      const coords = editor.view.coordsAtPos(from);
      return {
        getBoundingClientRect: () => ({
          x: coords.left,
          y: coords.bottom,
          top: coords.bottom,
          left: coords.left,
          bottom: coords.bottom + 4,
          right: coords.left,
          width: 0,
          height: 4,
          toJSON: () => ({}),
        }),
      };
    } catch (err) {
      console.warn("SlashCommandMenu: failed to get cursor coordinates", err);
      return null;
    }
  }, [active, from, editor?.view]);

  // MUI Popper → useFloating（@floating-ui/dom 直叩き）。offset 4 / flip / shift(padding 8)。
  const { referenceRef, floatingRef, floatingStyle } = useFloating({
    open: active,
    placement: "bottom-start",
    offsetPx: 4,
  });
  // useFloating の open エフェクトより前に reference を確定させるため render 中に代入する。
  // virtualAnchor は getBoundingClientRect を持つ virtual element（ReferenceElement）。
  referenceRef.current = virtualAnchor;

  if (!active || !virtualAnchor) return null;

  return createPortal(
    <div
      ref={(node) => { floatingRef.current = node; }}
      role="menu"
      aria-label={t("slashCommandPlaceholder")}
      style={{ ...floatingStyle, zIndex: Z_FULLSCREEN }}
    >
      <Paper
        style={{ maxHeight: 300, overflow: "auto", minWidth: 200, maxWidth: 280, boxShadow: "var(--am-elevation-3)" }}
      >
        {/* Always render status for screen readers */}
        <Text
          role="status"
          aria-live="polite"
          aria-atomic="true"
          variant="body2"
          style={filteredItems.length > 0
            ? { position: "absolute", width: "100%", height: "100%", overflow: "hidden", clip: "rect(0,0,0,0)" }
            : { padding: "12px 16px", color: getTextSecondary(isDark), fontSize: SLASH_COMMAND_FONT_SIZE, textAlign: "center" }
          }
        >
          {filteredItems.length > 0
            ? `${filteredItems.length} items`
            : t("slashCommandNoResults")}
        </Text>
        {filteredItems.length > 0 && (
        <MenuList ref={menuListRef} dense>
          {filteredItems.map((item, i) => (
            <MenuItem
              key={item.id}
              role="menuitem"
              selected={i === selectedIndex}
              aria-current={i === selectedIndex || undefined}
              onClick={() => executeCommand(i)}
              style={{ fontSize: SLASH_COMMAND_FONT_SIZE, minHeight: 36 }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText>{t(item.labelKey)}</ListItemText>
            </MenuItem>
          ))}
        </MenuList>
        )}
      </Paper>
    </div>,
    document.body,
  );
});
