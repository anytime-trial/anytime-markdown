"use client";

import {
  Box,
  Collapse,
  ExpandLessIcon,
  ExpandMoreIcon,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  StorageIcon,
  Text,
  TextField,
} from "./ui";
import { useDatabaseT } from "./i18n/context";
import React, { useMemo, useState } from "react";
import type { SchemaInfo } from "@anytime-markdown/database-core";

export interface TableTreeProps {
  readonly schema: SchemaInfo | null;
  readonly selected: string | null;
  readonly onSelect: (name: string) => void;
  readonly onShowSchema?: (name: string) => void;
  /** データベーススキーマ (DB ノード) を右クリック → ER図表示の要求 */
  readonly onShowErd?: () => void;
  /** ツリー最上位に表示するスキーマ名 (例: "main" や DB ファイル名) */
  readonly databaseName?: string;
}

export const TableTree: React.FC<Readonly<TableTreeProps>> = ({
  schema,
  selected,
  onSelect,
  onShowSchema,
  onShowErd,
  databaseName,
}) => {
  const t = useDatabaseT("Database");
  const [filter, setFilter] = useState("");
  const [dbExpanded, setDbExpanded] = useState(true);
  const [menu, setMenu] = useState<{
    anchorX: number;
    anchorY: number;
    /** "table" or "view" の場合はテーブル名、"db" は DB スキーマ全体 */
    target: { type: "table"; name: string } | { type: "db" };
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

  if (!schema) return <Text>{t("treeLoading")}</Text>;

  const empty = filtered?.tables.length === 0 && filtered.views.length === 0;

  return (
    <Stack style={{ padding: 8, flex: 1, minHeight: 0, overflow: "hidden" }}>
      <TextField
        size="small"
        placeholder={t("treeSearchPlaceholder")}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ marginBottom: 8, flexShrink: 0 }}
      />
      <Box
        className="dbv-scroll"
        style={{ overflow: "auto", flexGrow: 1, minHeight: 0 }}
      >
        <List>
          <ListItemButton
            onClick={() => setDbExpanded((v) => !v)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ anchorX: e.clientX, anchorY: e.clientY, target: { type: "db" } });
            }}
          >
            <ListItemIcon>
              <StorageIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={databaseName ?? t("databaseLabel")}
              primaryStyle={{ fontWeight: 600 }}
            />
            {dbExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </ListItemButton>
          <Collapse in={dbExpanded} unmountOnExit>
            <Box style={{ paddingLeft: 16 }}>
              {empty ? (
                <Text style={{ display: "block", paddingLeft: 8, paddingTop: 4, paddingBottom: 4 }}>
                  {t("treeEmpty")}
                </Text>
              ) : null}
              {filtered && filtered.tables.length > 0 ? (
                <>
                  <Text
                    variant="caption"
                    color="text.secondary"
                    style={{ display: "block", paddingLeft: 8 }}
                  >
                    {t("treeTablesGroup")}
                  </Text>
                  <List>
                    {filtered.tables.map((tab) => (
                      <ListItemButton
                        key={tab.name}
                        selected={selected === tab.name}
                        onClick={() => onSelect(tab.name)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMenu({ anchorX: e.clientX, anchorY: e.clientY, target: { type: "table", name: tab.name } });
                        }}
                        style={{ paddingLeft: 16 }}
                      >
                        <ListItemText primary={tab.name} />
                      </ListItemButton>
                    ))}
                  </List>
                </>
              ) : null}
              {filtered && filtered.views.length > 0 ? (
                <>
                  <Text
                    variant="caption"
                    color="text.secondary"
                    style={{ display: "block", paddingLeft: 8 }}
                  >
                    {t("treeViewsGroup")}
                  </Text>
                  <List>
                    {filtered.views.map((v) => (
                      <ListItemButton
                        key={v.name}
                        selected={selected === v.name}
                        onClick={() => onSelect(v.name)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMenu({ anchorX: e.clientX, anchorY: e.clientY, target: { type: "table", name: v.name } });
                        }}
                        style={{ paddingLeft: 16 }}
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
        {menu?.target.type === "table" ? (
          <MenuItem
            onClick={() => {
              if (menu.target.type === "table" && onShowSchema) onShowSchema(menu.target.name);
              closeMenu();
            }}
          >
            {t("showSchema")}
          </MenuItem>
        ) : null}
        {menu?.target.type === "db" ? (
          <MenuItem
            onClick={() => {
              if (onShowErd) onShowErd();
              closeMenu();
            }}
          >
            {t("showErd")}
          </MenuItem>
        ) : null}
      </Menu>
    </Stack>
  );
};
