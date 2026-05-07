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
import { ErdView } from "./ErdView";
import { ResultGrid } from "./ResultGrid";
import { SqlEditorPanel, type SqlEditorPanelHandle, type SqlRunResult } from "./SqlEditorPanel";
import { TableTree } from "./TableTree";

export interface DatabaseEditorProps {
  readonly adapter: DatabaseAdapter;
  readonly initialSchema?: SchemaInfo;
  readonly queryMaxRows: number;
  readonly themeMode?: "light" | "dark";
  readonly onMutationExecuted?: () => void;
  /** ツリー最上位に表示するスキーマ / DB 名 (例: "trail_test.db") */
  readonly databaseName?: string;
}

const PAGE_SIZES: ReadonlyArray<number> = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 50;
const ERD_TAB_ID = "erd:main";

interface TableTabState {
  readonly id: string;
  /** テーブル選択タブの場合に対応するテーブル名。クエリ / ER 図タブは undefined */
  readonly tableName?: string;
  readonly label: string;
  /** タブの種別 */
  readonly kind: "table" | "query" | "erd";
  /** "table" タブの内側ビュー: "data"=テーブルデータ一覧、"schema"=スキーマ表示 */
  readonly view: "data" | "schema";
  readonly page: number;
  readonly pageSize: number;
  readonly totalRows: number;
  readonly mode: "table" | "query";
  /** タブごとの SQL 入力欄バッファ */
  readonly sql: string;
  // 各タブ専用の SheetAdapter (selectRows 結果 / executeSql 結果を保持。内部状態を mutate する)
  readonly sheetAdapter: PaginatedSqlSheetAdapter;
}

export const DatabaseEditor: React.FC<Readonly<DatabaseEditorProps>> = ({
  adapter,
  initialSchema,
  queryMaxRows,
  themeMode,
  onMutationExecuted,
  databaseName,
}) => {
  const t = useTranslations("Database");
  const [schema, setSchema] = useState<SchemaInfo | null>(initialSchema ?? null);
  const [tabs, setTabs] = useState<ReadonlyArray<TableTabState>>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const queryTabCounterRef = useRef(0);

  // sheetAdapter インスタンスはタブが生成された時に 1 度作る。useMemo は依存配列に
  // tabs を入れると毎回再生成されてしまうので useRef で保持する。
  const adaptersRef = useRef(new Map<string, PaginatedSqlSheetAdapter>());
  const sqlPanelRef = useRef<SqlEditorPanelHandle | null>(null);

  const updateTab = useCallback(
    (id: string, updater: (tab: TableTabState) => TableTabState) => {
      setTabs((prev) => prev.map((x) => (x.id === id ? updater(x) : x)));
    },
    [],
  );

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
      setTabs((prev) => {
        const existing = prev.find((x) => x.tableName === tableName);
        if (existing) {
          return prev.map((x) =>
            x.id === existing.id ? { ...x, view: "schema" as const } : x,
          );
        }
        let sa = adaptersRef.current.get(tableName);
        if (!sa) {
          sa = new PaginatedSqlSheetAdapter({
            databaseAdapter: adapter,
            tableName,
          });
          adaptersRef.current.set(tableName, sa);
        }
        const next: TableTabState = {
          id: tableName,
          tableName,
          label: tableName,
          kind: "table",
          view: "schema",
          page: 1,
          pageSize: DEFAULT_PAGE_SIZE,
          totalRows: 0,
          mode: "table",
          sql: `SELECT * FROM "${tableName}" LIMIT ${DEFAULT_PAGE_SIZE};`,
          sheetAdapter: sa,
        };
        return [...prev, next];
      });
      setActiveTabId(tableName);
    },
    [adapter],
  );

  // データベーススキーマ右クリック → ER 図タブを生成 (or 既存タブにフォーカス)
  const handleShowErd = useCallback(() => {
    setTabs((prev) => {
      const existing = prev.find((x) => x.id === ERD_TAB_ID);
      if (existing) {
        setActiveTabId(ERD_TAB_ID);
        return prev;
      }
      // ER タブ用 sheetAdapter (使わないがインタフェース上必要)
      const sa = new PaginatedSqlSheetAdapter({
        databaseAdapter: adapter,
        tableName: "",
      });
      adaptersRef.current.set(ERD_TAB_ID, sa);
      const next: TableTabState = {
        id: ERD_TAB_ID,
        label: "ER図",
        kind: "erd",
        view: "data",
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        totalRows: 0,
        mode: "query",
        sql: "",
        sheetAdapter: sa,
      };
      return [...prev, next];
    });
    setActiveTabId(ERD_TAB_ID);
  }, [adapter]);

  // タブ内の view (data/schema) 切替を immutable に
  const setActiveTabView = useCallback(
    (view: "data" | "schema") => {
      if (!activeTabId) return;
      setTabs((prev) =>
        prev.map((x) => (x.id === activeTabId ? { ...x, view } : x)),
      );
    },
    [activeTabId],
  );

  // タブが追加された/ページが変わった時に SELECT を発行 (data view のみ)
  useEffect(() => {
    if (!activeTab || activeTab.kind !== "table" || !activeTab.tableName) return;
    if (activeTab.mode !== "table") return;
    const tableName = activeTab.tableName;
    const tabId = activeTab.id;
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
      updateTab(tabId, (x) => ({ ...x, totalRows: target.columns.length }));
      return;
    }
    // data view: SELECT 発行
    void adapter
      .countRows(tableName)
      .then((n) => {
        updateTab(tabId, (x) => ({ ...x, totalRows: n }));
      })
      .catch(() => {
        updateTab(tabId, (x) => ({ ...x, totalRows: 0 }));
      });
    void activeTab.sheetAdapter.loadPage(activeTab.page, activeTab.pageSize);
  }, [activeTab, schema, adapter, t, updateTab]);

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
        updateTab(activeTab.id, (x) => ({ ...x, mode: "query" }));
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
    [activeTab, adapter, queryMaxRows, onMutationExecuted, t, updateTab],
  );

  // テーブルデータグリッドの列ヘッダをダブルクリック → SQL 入力欄のカーソル位置に列名を挿入
  const handleColumnHeaderDoubleClick = useCallback(
    (col: number) => {
      if (!activeTab) return;
      const headers = activeTab.sheetAdapter.getColumnHeaders();
      const name = headers[col];
      if (!name) return;
      // 列名にスペースや特殊記号が含まれる場合はダブルクォートで囲んで安全に
      const ident = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name.replaceAll('"', '""')}"`;
      sqlPanelRef.current?.insertText(ident);
    },
    [activeTab],
  );

  const pagination = useMemo(() => {
    if (!activeTab || activeTab.mode !== "table") return undefined;
    const tabId = activeTab.id;
    return {
      page: activeTab.page,
      pageSize: activeTab.pageSize,
      totalRows: activeTab.totalRows,
      availablePageSizes: PAGE_SIZES,
      onChange: ({ page: p, pageSize: ps }: { page: number; pageSize: number }) => {
        updateTab(tabId, (x) => ({ ...x, page: p, pageSize: ps }));
      },
    };
  }, [activeTab, updateTab]);

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
          onShowErd={handleShowErd}
          databaseName={databaseName}
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
          activeTab.kind === "erd" ? (
            <ErdView schema={schema} themeMode={themeMode} />
          ) : (
            <>
              <SqlEditorPanel
                ref={sqlPanelRef}
                key={activeTab.id}
                value={activeTab.sql}
                onValueChange={(s) => {
                  updateTab(activeTab.id, (x) => ({ ...x, sql: s }));
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
                    onChange={(_, v) => setActiveTabView(v as "data" | "schema")}
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
          )
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
