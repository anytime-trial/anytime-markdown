"use client";

import {
  Box,
  List,
  ListItemButton,
  ListItemText,
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
}

export const TableTree: React.FC<Readonly<TableTreeProps>> = ({
  schema,
  selected,
  onSelect,
}) => {
  const t = useTranslations("Database");
  const [filter, setFilter] = useState("");

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
    <Stack sx={{ p: 1, height: "100%", overflow: "hidden" }}>
      <TextField
        size="small"
        placeholder={t("treeSearchPlaceholder")}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        sx={{ mb: 1 }}
      />
      <Box sx={{ overflow: "auto", flexGrow: 1 }}>
        {empty ? <Typography>{t("treeEmpty")}</Typography> : null}
        {filtered && filtered.tables.length > 0 ? (
          <>
            <Typography variant="caption" sx={{ pl: 1, color: "text.secondary" }}>
              {t("treeTablesGroup")}
            </Typography>
            <List dense>
              {filtered.tables.map((tab) => (
                <ListItemButton
                  key={tab.name}
                  selected={selected === tab.name}
                  onClick={() => onSelect(tab.name)}
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
            <List dense>
              {filtered.views.map((v) => (
                <ListItemButton
                  key={v.name}
                  selected={selected === v.name}
                  onClick={() => onSelect(v.name)}
                >
                  <ListItemText primary={v.name} />
                </ListItemButton>
              ))}
            </List>
          </>
        ) : null}
      </Box>
    </Stack>
  );
};
