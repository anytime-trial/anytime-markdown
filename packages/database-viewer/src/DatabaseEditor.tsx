"use client";

import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Chip,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Tooltip,
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
import { SqlEditorPanel, type SqlEditorPanelHandle, type SqlRunResult } from "./SqlEditorPanel";
import { TableTree } from "./TableTree";

export interface DatabaseEditorProps {
  readonly adapter: DatabaseAdapter;
  readonly initialSchema?: SchemaInfo;
  readonly queryMaxRows: number;
  readonly themeMode?: "light" | "dark";
  readonly onMutationExecuted?: () => void;
}

const PAGE_SIZES: ReadonlyArray<number> = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 50;

interface TableTabState {
  readonly id: string;
  /** テーブル選択タブの場合に対応するテーブル名。クエリ専用タブは undefined */
  readonly tableName?: string;
  readonly label: string;
  /** タブの種別: "table"=テーブルデータ表示 (内側で data/schema 切替可)、"query"=空クエリ */
  readonly kind: "table" | "query";
  /** "table" タブの内側ビュー: "data"=テーブルデータ一覧、"schema"=スキーマ表示 */
  view: "data" | "schema";
  page: number;
  pageSize: number;
  totalRows: number;
  mode: "table" | "query";
  /** タブごとの SQL 入力欄バッファ */
  sql: string;
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
  const queryTabCounterRef = useRef(0);
  // ページング状態を React 再レンダで反映するため version カウンタを更新する
  const [, forceRender] = useState(0);
  const tick = useCallback(() => forceRender((v) => v + 1), []);

  // sheetAdapter インスタンスはタブが生成された時に 1 度作る。useMemo は依存配列に
  // tabs を入れると毎回再生成されてしまうので useRef で保持する。
  const adaptersRef = useRef(new Map<string, PaginatedSqlSheetAdapter>());
  const sqlPanelRef = useRef<SqlEditorPanelHandle | null>(null);

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
          label: tableName,
          kind: "table",
          view: "data",
          page: 1,
          pageSize: DEFAULT_PAGE_SIZE,
          totalRows: 0,
          mode: "table",
          sql: `SELECT * FROM "${tableName}" LIMIT ${DEFAULT_PAGE_SIZE};`,
          sheetAdapter,
        };
        setActiveTabId(tableName);
        return [...prev, next];
      });
    },
    [adapter],
  );

  // SQL クエリ専用の新規タブを追加する (テーブル名なし、空 SQL から開始)
  const handleAddQueryTab = useCallback(() => {
    queryTabCounterRef.current += 1;
    const id = `query-${queryTabCounterRef.current}`;
    const label = `Query ${queryTabCounterRef.current}`;
    const sheetAdapter = new PaginatedSqlSheetAdapter({
      databaseAdapter: adapter,
      tableName: "",
    });
    adaptersRef.current.set(id, sheetAdapter);
    const next: TableTabState = {
      id,
      label,
      kind: "query",
      view: "data",
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalRows: 0,
      mode: "query",
      sql: "",
      sheetAdapter,
    };
    setTabs((prev) => [...prev, next]);
    setActiveTabId(id);
  }, [adapter]);

  // テーブル一覧の右クリック → 該当テーブルのタブを開き、内側を schema view に
  const handleShowSchema = useCallback(
    (tableName: string) => {
      handleSelect(tableName);
      setTabs((prev) =>
        prev.map((x) => (x.id === tableName ? { ...x, view: "schema" } : x)),
      );
      setActiveTabId(tableName);
    },
    [handleSelect],
  );

  // タブが追加された/ページが変わった時に SELECT を発行 (data view のみ)
  useEffect(() => {
    if (!activeTab || activeTab.kind !== "table" || !activeTab.tableName) return;
    if (activeTab.mode !== "table") return;
    const tableName = activeTab.tableName;
    if (activeTab.view === "schema") {
      // schema view 切替時はカラム情報を applyQueryResult で注入
      const allTables = [...(schema?.tables ?? []), ...(schema?.views ?? [])];
      const target = allTables.find((x) => x.name === tableName);
      if (!target) return;
      activeTab.sheetAdapter.applyQueryResult({
        columns: [
          t("schemaColName"),
          t("schemaColType"),
          t("schemaColNotNull"),
          t("schemaColPk"),
        ],
        rows: target.columns.map((c) => [
          c.name,
          c.type,
          c.notNull ? "✓" : "",
          c.primaryKey ? "✓" : "",
        ]),
        executionTimeMs: 0,
        isMutation: false,
      });
      activeTab.totalRows = target.columns.length;
      tick();
      return;
    }
    // data view: SELECT 発行
    void adapter
      .countRows(tableName)
      .then((n) => {
        activeTab.totalRows = n;
        tick();
      })
      .catch(() => {
        activeTab.totalRows = 0;
        tick();
      });
    void activeTab.sheetAdapter.loadPage(activeTab.page, activeTab.pageSize);
  }, [activeTab, activeTab?.page, activeTab?.pageSize, activeTab?.mode, activeTab?.tableName, activeTab?.view, schema, adapter, tick, t]);

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

  // テーブルデータグリッドの列ヘッダをダブルクリック → SQL 入力欄のカーソル位置に列名を挿入
  const handleColumnHeaderDoubleClick = useCallback(
    (col: number) => {
      if (!activeTab) return;
      const headers = activeTab.sheetAdapter.getColumnHeaders();
      const name = headers[col];
      if (!name) return;
      // 列名にスペースや特殊記号が含まれる場合はダブルクォートで囲んで安全に
      const ident = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
      sqlPanelRef.current?.insertText(ident);
    },
    [activeTab],
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
      <Box
        sx={{
          width: 280,
          flexShrink: 0,
          borderRight: 1,
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <TableTree
          schema={schema}
          selected={activeTabId}
          onSelect={handleSelect}
          onShowSchema={handleShowSchema}
        />
      </Box>
      <Stack sx={{ flexGrow: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1, flexShrink: 0 }}>
          {adapter.capabilities.readOnly ? (
            <Chip size="small" color="default" label="read-only" />
          ) : null}
        </Stack>
        {tabs.length > 0 ? (
          <Box
            sx={{
              borderBottom: 1,
              borderColor: "divider",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
            }}
          >
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
                      <span>{tab.label}</span>
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
            <Tooltip title={t("tabAddQuery")}>
              <IconButton
                size="small"
                onClick={handleAddQueryTab}
                aria-label={t("tabAddQuery")}
                sx={{ mx: 0.5 }}
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ) : null}
        {activeTab ? (
          <>
            <SqlEditorPanel
              ref={sqlPanelRef}
              key={activeTab.id}
              value={activeTab.sql}
              onValueChange={(s) => {
                activeTab.sql = s;
                tick();
              }}
              onRun={handleRun}
              readOnly={adapter.capabilities.readOnly}
            />
            {activeTab.kind === "table" ? (
              <Box
                sx={{
                  borderBottom: 1,
                  borderColor: "divider",
                  flexShrink: 0,
                }}
              >
                <Tabs
                  value={activeTab.view}
                  onChange={(_, v) => {
                    activeTab.view = v as "data" | "schema";
                    tick();
                  }}
                  sx={{ minHeight: 32 }}
                >
                  <Tab
                    value="data"
                    label={t("viewData")}
                    sx={{ textTransform: "none", minHeight: 32, py: 0.25 }}
                  />
                  <Tab
                    value="schema"
                    label={t("viewSchema")}
                    sx={{ textTransform: "none", minHeight: 32, py: 0.25 }}
                  />
                </Tabs>
              </Box>
            ) : null}
            <ResultGrid
              adapter={activeTab.sheetAdapter}
              pagination={activeTab.view === "data" ? pagination : undefined}
              themeMode={themeMode}
              onColumnHeaderDoubleClick={handleColumnHeaderDoubleClick}
              visibleRowCount={activeTab.pageSize}
            />
          </>
        ) : (
          <Stack
            sx={{ flexGrow: 1, minHeight: 0, overflow: "auto", p: 2 }}
            spacing={2}
          >
            <SqlEditorPanel
              onRun={handleRun}
              readOnly={adapter.capabilities.readOnly}
              disabled
            />
            <Typography color="text.secondary" sx={{ textAlign: "center" }}>
              {t("selectTablePrompt")}
            </Typography>
          </Stack>
        )}
      </Stack>
    </Stack>
  );
};
