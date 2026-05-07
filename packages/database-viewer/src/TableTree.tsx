"use client";

import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import StorageIcon from "@mui/icons-material/Storage";
import {
  Box,
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";
import type { SchemaInfo } from "@anytime-markdown/database-core";

export interface TableTreeProps {
  readonly schema: SchemaInfo | null;
  readonly selected: string | null;
  readonly onSelect: (name: string) => void;
  readonly onShowSchema?: (name: string) => void;
  /** ツリー最上位に表示するスキーマ名 (例: "main" や DB ファイル名) */
  readonly databaseName?: string;
}

export const TableTree: React.FC<Readonly<TableTreeProps>> = ({
  schema,
  selected,
  onSelect,
  onShowSchema,
  databaseName,
}) => {
  const t = useTranslations("Database");
  const [filter, setFilter] = useState("");
  const [dbExpanded, setDbExpanded] = useState(true);
  const [menu, setMenu] = useState<{
    anchorX: number;
    anchorY: number;
    tableName: string;
  } | null>(null);
  const closeMenu = (): void => setMenu(null);

  const filtered = useMemo(() => {
    if (!schema) return null;
    const f = filter.toLowerCase();
    const match = (n: string) => n.toLowerCase().includes(f);
    return {
      tables: schema.tables.filter((x) => match(x.name)),
      views: schema.views.filter((x) => match(x.name)),
    };
  }, [schema, filter]);

  if (!schema) return <Typography>{t("treeLoading")}</Typography>;

  const empty = filtered && filtered.tables.length === 0 && filtered.views.length === 0;

  return (
    <Stack sx={{ p: 1, flex: 1, minHeight: 0, overflow: "hidden" }}>
      <TextField
        size="small"
        placeholder={t("treeSearchPlaceholder")}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        sx={{ mb: 1, flexShrink: 0 }}
      />
      <Box
        sx={{
          overflow: "auto",
          flexGrow: 1,
          minHeight: 0,
          // VS Code WebView でも視認できる太さ・コントラストの scrollbar を明示
          scrollbarWidth: "auto",
          scrollbarColor:
            "rgba(255,255,255,0.55) rgba(255,255,255,0.05)",
          "&::-webkit-scrollbar": { width: 12, height: 12 },
          "&::-webkit-scrollbar-track": {
            background: "rgba(255,255,255,0.05)",
          },
          "&::-webkit-scrollbar-thumb": {
            background: "rgba(255,255,255,0.45)",
            borderRadius: 3,
          },
          "&::-webkit-scrollbar-thumb:hover": {
            background: "rgba(255,255,255,0.6)",
          },
        }}
      >
        <List dense disablePadding>
          <ListItemButton
            onClick={() => setDbExpanded((v) => !v)}
            sx={{ py: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              <StorageIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={databaseName ?? t("databaseLabel")}
              primaryTypographyProps={{ fontWeight: 600 }}
            />
            {dbExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </ListItemButton>
          <Collapse in={dbExpanded} timeout="auto" unmountOnExit>
            <Box sx={{ pl: 2 }}>
              {empty ? <Typography sx={{ pl: 1, py: 0.5 }}>{t("treeEmpty")}</Typography> : null}
              {filtered && filtered.tables.length > 0 ? (
                <>
                  <Typography variant="caption" sx={{ pl: 1, color: "text.secondary" }}>
                    {t("treeTablesGroup")}
                  </Typography>
                  <List dense disablePadding>
                    {filtered.tables.map((tab) => (
                      <ListItemButton
                        key={tab.name}
                        selected={selected === tab.name}
                        onClick={() => onSelect(tab.name)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMenu({ anchorX: e.clientX, anchorY: e.clientY, tableName: tab.name });
                        }}
                        sx={{ pl: 2 }}
                      >
                        <ListItemText primary={tab.name} />
                      </ListItemButton>
                    ))}
                  </List>
                </>
              ) : null}
              {filtered && filtered.views.length > 0 ? (
                <>
                  <Typography variant="caption" sx={{ pl: 1, color: "text.secondary" }}>
                    {t("treeViewsGroup")}
                  </Typography>
                  <List dense disablePadding>
                    {filtered.views.map((v) => (
                      <ListItemButton
                        key={v.name}
                        selected={selected === v.name}
                        onClick={() => onSelect(v.name)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMenu({ anchorX: e.clientX, anchorY: e.clientY, tableName: v.name });
                        }}
                        sx={{ pl: 2 }}
                      >
                        <ListItemText primary={v.name} />
                      </ListItemButton>
                    ))}
                  </List>
                </>
              ) : null}
            </Box>
          </Collapse>
        </List>
      </Box>
      <Menu
        open={menu !== null}
        onClose={closeMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          menu ? { top: menu.anchorY, left: menu.anchorX } : undefined
        }
      >
        <MenuItem
          onClick={() => {
            if (menu && onShowSchema) onShowSchema(menu.tableName);
            closeMenu();
          }}
        >
          {t("showSchema")}
        </MenuItem>
      </Menu>
    </Stack>
  );
};
