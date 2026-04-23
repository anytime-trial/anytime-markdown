"use client";

import AddIcon from "@mui/icons-material/Add";
import { Box, IconButton, Menu, MenuItem, Typography } from "@mui/material";
import { useTranslations } from "next-intl";
import React, { useCallback, useRef, useState } from "react";

interface SheetTabsProps {
  readonly sheets: readonly string[];
  readonly activeSheet: number;
  readonly onSelect: (index: number) => void;
  readonly onAdd: () => void;
  readonly onRemove: (index: number) => void;
  readonly onRename: (index: number, name: string) => void;
  readonly onReorder: (fromIndex: number, toIndex: number) => void;
}

export function SheetTabs({
  sheets,
  activeSheet,
  onSelect,
  onAdd,
  onRemove,
  onRename,
  onReorder,
}: Readonly<SheetTabsProps>) {
  const t = useTranslations("Spreadsheet");

  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; index: number } | null>(null);

  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const dragFromRef = useRef<number | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLElement>, index: number) => {
    e.preventDefault();
    setMenuAnchor({ el: e.currentTarget, index });
  }, []);

  const handleMenuClose = useCallback(() => setMenuAnchor(null), []);

  const handleDeleteClick = useCallback(() => {
    if (menuAnchor) {
      onRemove(menuAnchor.index);
      setMenuAnchor(null);
    }
  }, [menuAnchor, onRemove]);

  const startRename = useCallback((index: number) => {
    setRenamingIndex(index);
    setRenameValue(sheets[index]);
  }, [sheets]);

  const commitRename = useCallback(() => {
    if (renamingIndex !== null && renameValue.trim().length > 0) {
      onRename(renamingIndex, renameValue.trim());
    }
    setRenamingIndex(null);
  }, [renamingIndex, renameValue, onRename]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") setRenamingIndex(null);
  }, [commitRename]);

  const handleDragStart = useCallback((index: number) => {
    dragFromRef.current = index;
  }, []);

  const handleDrop = useCallback((toIndex: number) => {
    const from = dragFromRef.current;
    if (from !== null && from !== toIndex) {
      onReorder(from, toIndex);
    }
    dragFromRef.current = null;
  }, [onReorder]);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        borderTop: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        overflowX: "auto",
        flexShrink: 0,
        minHeight: 32,
      }}
    >
      {sheets.map((name, index) => (
        <Box
          key={index}
          draggable
          onClick={() => onSelect(index)}
          onDoubleClick={() => startRename(index)}
          onContextMenu={(e) => handleContextMenu(e, index)}
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(index)}
          sx={{
            px: 1.5,
            py: 0.5,
            cursor: "pointer",
            borderBottom: activeSheet === index ? 2 : 0,
            borderColor: activeSheet === index ? "primary.main" : "transparent",
            userSelect: "none",
            whiteSpace: "nowrap",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          {renamingIndex === index ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleRenameKeyDown}
              style={{ width: Math.max(60, renameValue.length * 8), fontSize: "inherit" }}
            />
          ) : (
            <Typography variant="caption">{name}</Typography>
          )}
        </Box>
      ))}

      <IconButton
        size="small"
        aria-label={t("sheetAdd")}
        onClick={onAdd}
        sx={{ mx: 0.5 }}
      >
        <AddIcon fontSize="small" />
      </IconButton>

      <Menu
        open={Boolean(menuAnchor)}
        anchorEl={menuAnchor?.el}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <MenuItem
          onClick={handleDeleteClick}
          disabled={sheets.length <= 1}
          aria-disabled={sheets.length <= 1}
        >
          {t("sheetDelete")}
        </MenuItem>
      </Menu>
    </Box>
  );
}
