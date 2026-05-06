"use client";

import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Chip,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { useTranslations } from "next-intl";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DatabaseAdapter,
  SchemaInfo,
} from "@anytime-markdown/database-core";
import {
  PaginatedSqlSheetAdapter,
  hasTopLevelLimit,
} from "@anytime-markdown/database-core";
import { ResultGrid } from "./ResultGrid";
import { SqlEditorPanel, type SqlRunResult } from "./SqlEditorPanel";
import { TableTree } from "./TableTree";

export interface DatabaseEditorProps {
  readonly adapter: DatabaseAdapter;
  readonly initialSchema?: SchemaInfo;
  readonly queryMaxRows: number;
  readonly themeMode?: "light" | "dark";
  readonly onMutationExecuted?: () => void;
}

const PAGE_SIZES: ReadonlyArray<number> = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 100;

interface TableTabState {
  readonly id: string; // tableName と同義（同名タブは 1 つに集約）
  readonly tableName: string;
  page: number;
  pageSize: number;
  totalRows: number;
  mode: "table" | "query";
  // 各タブ専用の SheetAdapter (selectRows 結果 / executeSql 結果を保持)
  sheetAdapter: PaginatedSqlSheetAdapter;
}

export const DatabaseEditor: React.FC<Readonly<DatabaseEditorProps>> = ({
  adapter,
  initialSchema,
  queryMaxRows,
  themeMode,
  onMutationExecuted,
}) => {
  const t = useTranslations("Database");
  const [schema, setSchema] = useState<SchemaInfo | null>(initialSchema ?? null);
  const [tabs, setTabs] = useState<ReadonlyArray<TableTabState>>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  // ページング状態を React 再レンダで反映するため version カウンタを更新する
  const [, forceRender] = useState(0);
  const tick = useCallback(() => forceRender((v) => v + 1), []);

  // sheetAdapter インスタンスはタブが生成された時に 1 度作る。useMemo は依存配列に
  // tabs を入れると毎回再生成されてしまうので useRef で保持する。
  const adaptersRef = useRef(new Map<string, PaginatedSqlSheetAdapter>());

  useEffect(() => {
    if (!schema) {
      void adapter.listSchema().then(setSchema);
    }
  }, [schema, adapter]);

  const activeTab = tabs.find((x) => x.id === activeTabId) ?? null;

  // テーブル選択: 既存タブにフォーカス、なければ新規追加。
  // selectRows は内部で `SELECT * FROM "<table>" LIMIT ? OFFSET ?` を発行する。
  const handleSelect = useCallback(
    (tableName: string) => {
      setTabs((prev) => {
        const existing = prev.find((x) => x.tableName === tableName);
        if (existing) {
          setActiveTabId(existing.id);
          return prev;
        }
        let sheetAdapter = adaptersRef.current.get(tableName);
        if (!sheetAdapter) {
          sheetAdapter = new PaginatedSqlSheetAdapter({
            databaseAdapter: adapter,
            tableName,
          });
          adaptersRef.current.set(tableName, sheetAdapter);
        }
        const next: TableTabState = {
          id: tableName,
          tableName,
          page: 1,
          pageSize: DEFAULT_PAGE_SIZE,
          totalRows: 0,
          mode: "table",
          sheetAdapter,
        };
        setActiveTabId(tableName);
        return [...prev, next];
      });
    },
    [adapter],
  );

  // タブが追加された/ページが変わった時に SELECT を発行
  useEffect(() => {
    if (!activeTab || activeTab.mode !== "table") return;
    void adapter
      .countRows(activeTab.tableName)
      .then((n) => {
        activeTab.totalRows = n;
        tick();
      })
      .catch(() => {
        activeTab.totalRows = 0;
        tick();
      });
    void activeTab.sheetAdapter.loadPage(activeTab.page, activeTab.pageSize);
  }, [activeTab, activeTab?.page, activeTab?.pageSize, activeTab?.mode, adapter, tick]);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((x) => x.id === id);
        if (idx < 0) return prev;
        const next = prev.filter((x) => x.id !== id);
        adaptersRef.current.delete(id);
        if (activeTabId === id) {
          const newActive = next[idx] ?? next[idx - 1] ?? null;
          setActiveTabId(newActive?.id ?? null);
        }
        return next;
      });
    },
    [activeTabId],
  );

  const handleRun = useCallback(
    async (sql: string): Promise<SqlRunResult> => {
      if (!activeTab) {
        return {
          columns: [],
          rows: [],
          executionTimeMs: 0,
          truncated: false,
          error: t("selectTablePrompt"),
        };
      }
      const limited = hasTopLevelLimit(sql)
        ? sql
        : `${sql.trim().replace(/;\s*$/, "")} LIMIT ${queryMaxRows + 1}`;
      try {
        const result = await adapter.executeSql(limited);
        const truncated = result.rows.length > queryMaxRows;
        const displayRows = truncated ? result.rows.slice(0, queryMaxRows) : result.rows;
        activeTab.sheetAdapter.applyQueryResult({ ...result, rows: displayRows });
        activeTab.mode = "query";
        tick();
        if (result.isMutation) onMutationExecuted?.();
        return {
          columns: result.columns,
          rows: displayRows,
          executionTimeMs: result.executionTimeMs,
          truncated,
        };
      } catch (e) {
        return {
          columns: [],
          rows: [],
          executionTimeMs: 0,
          truncated: false,
          error: (e as Error).message,
        };
      }
    },
    [activeTab, adapter, queryMaxRows, onMutationExecuted, t, tick],
  );

  const pagination = useMemo(() => {
    if (!activeTab || activeTab.mode !== "table") return undefined;
    return {
      page: activeTab.page,
      pageSize: activeTab.pageSize,
      totalRows: activeTab.totalRows,
      availablePageSizes: PAGE_SIZES,
      onChange: ({ page: p, pageSize: ps }: { page: number; pageSize: number }) => {
        activeTab.page = p;
        activeTab.pageSize = ps;
        tick();
      },
    };
  }, [activeTab, activeTab?.page, activeTab?.pageSize, activeTab?.totalRows, activeTab?.mode, tick]);

  return (
    <Stack direction="row" sx={{ height: "100%", overflow: "hidden" }}>
      <Box sx={{ width: 280, borderRight: 1, borderColor: "divider", overflow: "auto" }}>
        <TableTree schema={schema} selected={activeTabId} onSelect={handleSelect} />
      </Box>
      <Stack sx={{ flexGrow: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1, flexShrink: 0 }}>
          {adapter.capabilities.readOnly ? (
            <Chip size="small" color="default" label="read-only" />
          ) : null}
        </Stack>
        <SqlEditorPanel
          onRun={handleRun}
          readOnly={adapter.capabilities.readOnly}
          disabled={!activeTab}
        />
        {tabs.length > 0 ? (
          <Box sx={{ borderBottom: 1, borderColor: "divider", flexShrink: 0 }}>
            <Tabs
              value={activeTabId ?? false}
              onChange={(_, v) => setActiveTabId(v as string)}
              variant="scrollable"
              scrollButtons="auto"
            >
              {tabs.map((tab) => (
                <Tab
                  key={tab.id}
                  value={tab.id}
                  label={
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <span>{tab.tableName}</span>
                      <IconButton
                        size="small"
                        aria-label={t("tabClose")}
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTab(tab.id);
                        }}
                        sx={{ p: 0.25 }}
                      >
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Stack>
                  }
                  sx={{ textTransform: "none", minHeight: 36, py: 0.5 }}
                />
              ))}
            </Tabs>
          </Box>
        ) : null}
        {activeTab ? (
          <ResultGrid
            adapter={activeTab.sheetAdapter}
            pagination={pagination}
            themeMode={themeMode}
          />
        ) : (
          <Stack
            alignItems="center"
            justifyContent="center"
            sx={{ flexGrow: 1, p: 4 }}
          >
            <Typography color="text.secondary">{t("selectTablePrompt")}</Typography>
          </Stack>
        )}
      </Stack>
    </Stack>
  );
};
