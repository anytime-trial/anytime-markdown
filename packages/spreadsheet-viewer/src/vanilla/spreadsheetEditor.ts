import type {
  SheetAdapter,
  SheetSnapshot,
  WorkbookAdapter,
} from "@anytime-markdown/spreadsheet-core";
import {
  createInMemorySheetAdapter,
  parseCsv,
  serializeCsv,
} from "@anytime-markdown/spreadsheet-core";

import { createSpreadsheetT, type SpreadsheetT } from "../i18n/createSpreadsheetT";
import { themeCssVars } from "../ui/tokens";
import { injectSpreadsheetUiStyles } from "../ui/injectStyles";
import { createSvButton } from "../ui-vanilla/controls";
import { svIcon } from "../ui-vanilla/icons";
import { createPaginationBar, type PaginationBarHandle, type PaginationProps } from "./paginationBar";
import { createSheetTabs, type SheetTabsHandle } from "./sheetTabs";
import { mountSpreadsheetGrid, type SpreadsheetGridHandle } from "./spreadsheetGrid";

/**
 * SpreadsheetEditor.tsx の vanilla 版（workbook 対応エディタ）。
 *
 * - workbookAdapter 指定時は activeSheet を SheetAdapter として包んで Grid に渡し、
 *   タブ切替・列ヘッダー変更・grid サイズ変更時は Grid を作り直す
 *   （React 版は再レンダーで同期していた箇所の置換。Grid は canvas のため再 mount は軽量）。
 * - themeMode / pagination / gridRows / gridCols の変更は handle.update で受ける。
 */

type Format = "csv" | "tsv";

function delimiterOf(format: Format): "," | "\t" {
  return format === "csv" ? "," : "\t";
}

function triggerDownload(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

import type { ChartKind, TableRange } from "@anytime-markdown/chart-core";
import { createChartPanel, type ChartPanelHandle } from "../ui-vanilla/chartPanel";
import { createChartLayer } from "./chartLayer";
import type { ChartDefinition } from "./chartLayer.types";

export type { ChartDefinition };

export interface SpreadsheetEditorOptions {
  locale?: string;
  t?: SpreadsheetT;
  themeMode?: "light" | "dark";
  adapter?: SheetAdapter;
  workbookAdapter?: WorkbookAdapter;
  gridRows?: number;
  gridCols?: number;
  /** ヘッダー右側に置く要素（React 版 headerRight の vanilla 対応）。 */
  headerRight?: Node;
  showApply?: boolean;
  showRange?: boolean;
  /** 1 行目をヘッダー行（H）として表示するか（既定 false）。 */
  showHeaderRow?: boolean;
  showImportExport?: boolean;
  showToolbar?: boolean;
  /** 内容変更のたびに adapter へ即時同期するか（ライブプレビュー用・既定 false）。 */
  liveSync?: boolean;
  onColumnHeaderDoubleClick?: (col: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onClose?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  pagination?: PaginationProps;
  /** 選択範囲からチャート作成コールバック（未指定時はコンテキストメニュー非表示）。 */
  onCreateChart?: (range: TableRange) => void;
  /**
   * 初期チャート定義（ホスト側の永続化ストアから復元する場合に指定）。
   * mount 後に内部 chartLayer へ適用するが、この適用では onChartsChange を呼ばない。
   */
  initialCharts?: ChartDefinition[];
  /**
   * チャート定義がユーザー操作で変化したときのコールバック。
   * initialCharts の適用時は呼ばれない。
   */
  onChartsChange?: (charts: ChartDefinition[]) => void;
}

export interface SpreadsheetEditorUpdatePatch {
  themeMode?: "light" | "dark";
  pagination?: PaginationProps | null;
  gridRows?: number;
  gridCols?: number;
}

export interface SpreadsheetEditorHandle {
  el: HTMLDivElement;
  update(patch: SpreadsheetEditorUpdatePatch): void;
  destroy(): void;
  /** 現在のチャート定義一覧を返す。 */
  getCharts(): ChartDefinition[];
  /**
   * チャート定義を一括設定する。
   * この呼び出しは onChartsChange を発火しない（プログラム的な復元用）。
   */
  setCharts(defs: ChartDefinition[]): void;
  /** 指定 id のチャートの現在の ChartSpec を ```anytime-chart フェンス文字列で返す。id 不正は空文字。 */
  exportChartFence(id: string): string;
}

export function mountSpreadsheetEditor(
  container: HTMLElement,
  options: SpreadsheetEditorOptions,
): SpreadsheetEditorHandle {
  injectSpreadsheetUiStyles();
  const t = options.t ?? createSpreadsheetT("Spreadsheet", options.locale);
  const { workbookAdapter, showImportExport = true } = options;
  const fallbackAdapter = options.adapter ?? createInMemorySheetAdapter();

  let themeMode = options.themeMode ?? "light";
  let gridRows = options.gridRows;
  let gridCols = options.gridCols;
  let destroyed = false;

  const root = document.createElement("div");
  root.className = "sv-root";
  const applyTheme = (): void => {
    for (const [k, v] of Object.entries(themeCssVars(themeMode === "dark"))) {
      root.style.setProperty(k, v);
    }
  };
  applyTheme();
  Object.assign(root.style, {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    background: "var(--sv-color-bg-paper)",
  });

  /* ---- active sheet adapter（workbook 時はアクティブシートを包む） ---- */
  const buildSheetAdapter = (): SheetAdapter => {
    if (!workbookAdapter) return fallbackAdapter;
    const idx = workbookAdapter.getSnapshot().activeSheet;
    return {
      getSnapshot: () => {
        const s = workbookAdapter.getSnapshot().sheets[idx];
        return { cells: s.cells, alignments: s.alignments, range: s.range };
      },
      subscribe: workbookAdapter.subscribe.bind(workbookAdapter),
      setCell: (row, col, value) => workbookAdapter.setCell(idx, row, col, value),
      replaceAll: (next: SheetSnapshot) => workbookAdapter.replaceSheet(idx, next),
    };
  };

  let effectiveAdapter: SheetAdapter = buildSheetAdapter();

  /* ---- header（import / export + headerRight） ---- */
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".csv,.tsv,text/csv,text/tab-separated-values";
  fileInput.hidden = true;
  let pendingFormat: Format = "csv";
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    file
      .text()
      .then((text) => {
        const snap: SheetSnapshot = parseCsv(text, { delimiter: delimiterOf(pendingFormat) });
        effectiveAdapter.replaceAll(snap);
      })
      .catch((err) => {
        console.error("[SpreadsheetEditor] file import failed", file.name, err);
      });
  });

  const handleExport = (format: Format): void => {
    const text = serializeCsv(effectiveAdapter.getSnapshot(), { delimiter: delimiterOf(format) });
    const ext = format === "csv" ? "csv" : "tsv";
    const mime = format === "csv" ? "text/csv" : "text/tab-separated-values";
    triggerDownload(`sheet.${ext}`, text, mime);
  };

  const showHeader = showImportExport || options.headerRight !== undefined;
  if (showHeader) {
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      flexDirection: "row",
      gap: "8px",
      padding: "8px",
      flexShrink: "0",
    });
    if (showImportExport) {
      header.append(
        createSvButton({
          label: t("importCsv"),
          size: "small",
          startIcon: svIcon("Upload"),
          onClick: () => {
            pendingFormat = "csv";
            fileInput.click();
          },
        }),
        createSvButton({
          label: t("exportCsv"),
          size: "small",
          startIcon: svIcon("Download"),
          onClick: () => handleExport("csv"),
        }),
        createSvButton({
          label: t("importTsv"),
          size: "small",
          startIcon: svIcon("Upload"),
          onClick: () => {
            pendingFormat = "tsv";
            fileInput.click();
          },
        }),
        createSvButton({
          label: t("exportTsv"),
          size: "small",
          startIcon: svIcon("Download"),
          onClick: () => handleExport("tsv"),
        }),
      );
    }
    if (options.headerRight) header.appendChild(options.headerRight);
    header.appendChild(fileInput);
    root.appendChild(header);
  }

  /* ---- grid（adapter / columnHeaders / サイズ変更時に作り直す） ---- */
  const gridWrap = document.createElement("div");
  Object.assign(gridWrap.style, {
    flex: "1",
    minHeight: "0",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  });
  root.appendChild(gridWrap);

  let grid: SpreadsheetGridHandle | null = null;
  let currentColumnHeaders: readonly string[] | undefined;
  // chartLayer はこの後で初期化するが、mountGrid の closure で参照するため前方宣言する。
  let chartLayer: ReturnType<typeof createChartLayer> | null = null;
  // charts 機能が有効か（いずれかの charts オプション指定時）。コンテキストメニュー表示の可否に使う。
  const chartsEnabled =
    !!options.onCreateChart || !!options.onChartsChange || !!options.initialCharts;

  const mountGrid = (): void => {
    grid?.destroy();
    currentColumnHeaders = effectiveAdapter.getColumnHeaders?.();
    // charts 有効時はチャート作成をメニューに出す。状態は単一の chartLayer に集約し、
    // パネル表示は reconcileChartPanels が担う。options.onCreateChart は任意のホストフック。
    const onCreateChartForGrid = chartsEnabled
      ? (range: import("@anytime-markdown/chart-core").TableRange) => {
          chartLayer?.addChart({ kind: "line", range });
          options.onCreateChart?.(range);
        }
      : undefined;
    grid = mountSpreadsheetGrid(gridWrap, {
      adapter: effectiveAdapter,
      isDark: themeMode === "dark",
      gridRows,
      gridCols,
      showApply: options.showApply ?? false,
      liveSync: options.liveSync ?? false,
      showRange: options.showRange ?? false,
      showHeaderRow: options.showHeaderRow ?? false,
      showToolbar: options.showToolbar ?? true,
      columnHeaders: currentColumnHeaders,
      onColumnHeaderDoubleClick: options.onColumnHeaderDoubleClick,
      onDirtyChange: options.onDirtyChange,
      onClose: options.onClose,
      onUndo: options.onUndo,
      onRedo: options.onRedo,
      onCreateChart: onCreateChartForGrid,
      t,
    });
  };
  mountGrid();

  /* ---- 列ヘッダー変更の監視（ResultGrid のクエリ切替等） ----
   * workbook モードでは buildSheetAdapter の wrapper が getColumnHeaders を持たず、
   * remount は workbook subscribe 側（activeSheet 切替）に一元化するため購読しない。 */
  const headersChanged = (): boolean => {
    const next = effectiveAdapter.getColumnHeaders?.();
    if (next === currentColumnHeaders) return false;
    if (!next || !currentColumnHeaders) return true;
    if (next.length !== currentColumnHeaders.length) return true;
    return next.some((v, i) => v !== currentColumnHeaders?.[i]);
  };
  const unsubscribeHeaders = workbookAdapter
    ? null
    : effectiveAdapter.subscribe(() => {
        if (destroyed) return;
        if (headersChanged()) mountGrid();
      });

  /* ---- workbook: SheetTabs + activeSheet 切替で grid 再 mount ---- */
  let sheetTabs: SheetTabsHandle | null = null;
  let unsubscribeWorkbook: (() => void) | null = null;
  if (workbookAdapter) {
    let activeSheet = workbookAdapter.getSnapshot().activeSheet;
    const snap = workbookAdapter.getSnapshot();
    sheetTabs = createSheetTabs(
      { sheets: snap.sheets.map((s) => s.name), activeSheet },
      {
        onSelect: (i) => workbookAdapter.setActiveSheet(i),
        onAdd: () => workbookAdapter.addSheet(),
        onRemove: (i) => workbookAdapter.removeSheet(i),
        onRename: (i, name) => workbookAdapter.renameSheet(i, name),
        onReorder: (from, to) => workbookAdapter.reorderSheet(from, to),
      },
      { t },
    );
    root.appendChild(sheetTabs.el);

    unsubscribeWorkbook = workbookAdapter.subscribe(() => {
      if (destroyed) return;
      const next = workbookAdapter.getSnapshot();
      sheetTabs?.update({ sheets: next.sheets.map((s) => s.name), activeSheet: next.activeSheet });
      if (next.activeSheet !== activeSheet) {
        activeSheet = next.activeSheet;
        effectiveAdapter = buildSheetAdapter();
        mountGrid();
      }
    });
  }

  /* ---- pagination ---- */
  let paginationBar: PaginationBarHandle | null = null;
  const setPagination = (props: PaginationProps | null | undefined): void => {
    if (props) {
      if (paginationBar) {
        paginationBar.update(props);
      } else {
        paginationBar = createPaginationBar(props, { locale: options.locale });
        root.appendChild(paginationBar.el);
      }
    } else if (paginationBar) {
      paginationBar.el.remove();
      paginationBar = null;
    }
  };
  setPagination(options.pagination);

  /* ---- chartLayer（charts 関連オプションがある場合に初期化） ---- */
  chartLayer = chartsEnabled ? createChartLayer(effectiveAdapter) : null;
  let applyingCharts = false;
  let unsubscribeChartLayer: (() => void) | null = null;

  if (chartLayer) {
    // initialCharts を適用（onChartsChange は呼ばない）
    if (options.initialCharts && options.initialCharts.length > 0) {
      applyingCharts = true;
      try {
        chartLayer.setCharts(options.initialCharts);
      } finally {
        applyingCharts = false;
      }
    }
    // ユーザー操作による変更を onChartsChange へ通知
    if (options.onChartsChange) {
      const onChartsChange = options.onChartsChange;
      unsubscribeChartLayer = chartLayer.subscribe(() => {
        if (applyingCharts) return;
        onChartsChange(chartLayer.getCharts());
      });
    }
  }

  /* ---- チャートパネル管理（ホスト埋め込み時の可視化） ---- */
  // chartLayer の定義に追従してフローティングパネルを生成/破棄/更新する。
  // overflow:hidden の root にクリップされないよう document.body に append する（WC と同方式）。
  const chartPanels = new Map<string, ChartPanelHandle>();

  /** 指定チャートの kind を更新する（ユーザー操作なので onChartsChange も発火させる）。 */
  const updateChartKind = (id: string, kind: ChartKind): void => {
    if (!chartLayer) return;
    const next = chartLayer.getCharts().map((c) => (c.id === id ? { ...c, kind } : c));
    chartLayer.setCharts(next);
  };

  const reconcileChartPanels = (): void => {
    if (!chartLayer) return;
    const charts = chartLayer.getCharts();
    const liveIds = new Set(charts.map((c) => c.id));
    // 消えたチャートのパネルを破棄
    for (const [id, panel] of chartPanels) {
      if (!liveIds.has(id)) {
        panel.destroy();
        panel.el.remove();
        chartPanels.delete(id);
      }
    }
    // 新規チャートのパネルを生成、既存は再描画
    for (const def of charts) {
      const existing = chartPanels.get(def.id);
      if (existing) {
        existing.update();
        continue;
      }
      try {
        const panel = createChartPanel({
          t,
          isDark: () => themeMode === "dark",
          getSpec: () => chartLayer!.getSpec(def.id),
          kind: def.kind,
          onKindChange: (kind) => updateChartKind(def.id, kind),
          onClose: () => chartLayer!.removeChart(def.id),
        });
        document.body.appendChild(panel.el);
        chartPanels.set(def.id, panel);
      } catch (err) {
        // チャート描画の失敗（2D context 不可など）でエディタ全体を壊さない。
        console.error("[SpreadsheetEditor] chart panel mount failed", { id: def.id, err });
      }
    }
  };

  let unsubscribeChartPanels: (() => void) | null = null;
  if (chartLayer) {
    unsubscribeChartPanels = chartLayer.subscribe(() => reconcileChartPanels());
    reconcileChartPanels();
  }

  container.appendChild(root);

  return {
    el: root,
    update(patch) {
      if (patch.themeMode !== undefined && patch.themeMode !== themeMode) {
        themeMode = patch.themeMode;
        applyTheme();
        grid?.update({ isDark: themeMode === "dark" });
      }
      if (
        (patch.gridRows !== undefined && patch.gridRows !== gridRows) ||
        (patch.gridCols !== undefined && patch.gridCols !== gridCols)
      ) {
        gridRows = patch.gridRows ?? gridRows;
        gridCols = patch.gridCols ?? gridCols;
        mountGrid();
      }
      if (patch.pagination !== undefined) {
        setPagination(patch.pagination);
      }
    },
    getCharts() {
      return chartLayer?.getCharts() ?? [];
    },
    setCharts(defs) {
      if (!chartLayer) return;
      applyingCharts = true;
      try {
        chartLayer.setCharts(defs);
      } finally {
        applyingCharts = false;
      }
    },
    exportChartFence(id) {
      const spec = chartLayer?.getSpec(id);
      if (!spec) return "";
      return `\`\`\`anytime-chart\n${JSON.stringify(spec, null, 2)}\n\`\`\``;
    },
    destroy() {
      destroyed = true;
      unsubscribeChartPanels?.();
      for (const panel of chartPanels.values()) {
        panel.destroy();
        panel.el.remove();
      }
      chartPanels.clear();
      unsubscribeChartLayer?.();
      chartLayer?.destroy();
      unsubscribeHeaders?.();
      unsubscribeWorkbook?.();
      sheetTabs?.destroy();
      grid?.destroy();
      root.remove();
    },
  };
}
