import type {
  CellAlign,
  CellEditState,
  ColumnFilterState,
  ColumnHeaderGroups,
  DataRange,
  RowHeaderGroups,
  SheetAdapter,
  SpreadsheetSelection,
} from "@anytime-markdown/spreadsheet-core";
import type { TableRange } from "@anytime-markdown/chart-core";
import {
  columnLabel,
  DEFAULT_GRID_COLS,
  DEFAULT_GRID_ROWS,
} from "@anytime-markdown/spreadsheet-core";

import { createSpreadsheetT, type SpreadsheetT } from "../i18n/createSpreadsheetT";
import {
  getInternalClipboard,
  parseClipboardTsv,
  readTsvFromClipboard,
  writeTsvToClipboard,
} from "./clipboard";
import { computeFillValues } from "./fillSeries";
import { getDivider, getPalette, applySpreadsheetThemeVars, themeCssVars } from "../ui/tokens";
import { injectSpreadsheetUiStyles } from "../ui/injectStyles";
import {
  attachSvTooltip,
  createSvButton,
  createSvIconButton,
  createSvRadioGroup,
  createSvTextField,
  createSvToggleGroup,
  type SvToggleGroupHandle,
} from "../ui-vanilla/controls";
import { svIcon } from "../ui-vanilla/icons";
import { openSvDialog, type SvDialogHandle } from "../ui-vanilla/overlay";
import { openSpreadsheetContextMenu, type SpreadsheetContextMenuHandle } from "./contextMenu";
import { createSpreadsheetState } from "./spreadsheetState";

/**
 * SpreadsheetGrid.tsx（React + canvas 描画）の vanilla 版。
 *
 * 描画は元実装と同じく canvas 直描き（可視領域のみ）のため、React 除去による
 * 描画方式の変更はない。React state は closure 変数 + requestAnimationFrame の
 * 再描画スケジューラへ置き換えた。
 *
 * options は React 版 props と同名・同セマンティクス。t / locale のみ追加
 * （未指定時は navigator.language から自動解決）。
 */

const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 28;
const DEFAULT_ROW_NUM_WIDTH = 40;
const DEFAULT_HEADER_HEIGHT = 28;
const FILTER_ROW_HEIGHT = 28;
const RESIZE_HANDLE_THRESHOLD = 4;
const MIN_RESIZE_ROWS = 2;
const MIN_RESIZE_COLS = 1;
// フィルハンドル（選択右下角）の描画サイズと当たり判定の許容半径（px）。
const FILL_HANDLE_SIZE = 7;
const FILL_HANDLE_HIT = 5;
const AUTO_WIDTH_MIN = 60;
const AUTO_WIDTH_MAX = 300;
const AUTO_WIDTH_CHAR_PX = 8;
const AUTO_WIDTH_PADDING = 12;
const DRAG_THRESHOLD = 5;
const CELL_DRAG_THRESHOLD = 3;
const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, sans-serif";
const FONT_CELL = `13px ${FONT_FAMILY}`;
const FONT_CELL_BOLD = `600 13px ${FONT_FAMILY}`;
const FONT_HEADER = `600 12px ${FONT_FAMILY}`;
const FONT_GROUP = `600 11px ${FONT_FAMILY}`;

interface CellSizeSettings {
  heightMode: "fixed" | "auto";
  fixedHeight: number;
  widthMode: "fixed" | "auto";
  fixedWidth: number;
}

export interface SpreadsheetGridOptions {
  adapter: SheetAdapter;
  isDark: boolean;
  /** グリッドの行数（デフォルト: 51） */
  gridRows?: number;
  /** グリッドの列数（デフォルト: 15） */
  gridCols?: number;
  /** 未適用の変更有無が変化したときのコールバック */
  onDirtyChange?: (dirty: boolean) => void;
  /** 適用後に全画面を閉じるコールバック */
  onClose?: () => void;
  /** Undo コールバック（未指定時は無効） */
  onUndo?: () => void;
  /** Redo コールバック（未指定時は無効） */
  onRedo?: () => void;
  /** 適用ボタンを表示するか（デフォルト: false） */
  showApply?: boolean;
  /**
   * 内容変更のたびに adapter へ即時同期するか（デフォルト: false）。
   * true の場合、Apply を待たずセル編集等が adapter.subscribe へ伝播する（ライブプレビュー用）。
   */
  liveSync?: boolean;
  /** データ範囲の青枠とリサイズハンドルを表示するか（デフォルト: false） */
  showRange?: boolean;
  /** 1行目をヘッダー行（H）として表示するか（デフォルト: false） */
  showHeaderRow?: boolean;
  /** 列ヘッダーに表示するラベル（未指定時は A, B, C...） */
  columnHeaders?: readonly string[];
  /** 行ヘッダーに表示するラベル（未指定時は 1, 2, 3...） */
  rowHeaders?: readonly string[];
  /** 行ヘッダー列の幅 px（デフォルト: 40） */
  rowHeaderWidth?: number;
  /** 列ヘッダーのテキストを90°回転して縦表示するか（デフォルト: false） */
  rotateColumnHeaders?: boolean;
  /** セルを正方形にする px（指定時は行高さ・列幅を同値の fixed モードで初期化） */
  cellSize?: number;
  /** セルの背景色を返すコールバック。undefined 返却時はデフォルト背景 */
  getCellBackground?: (row: number, col: number, value: string) => string | undefined;
  /** セルの表示テキストを上書きするコールバック。未指定時はセル値をそのまま表示 */
  getCellDisplayText?: (row: number, col: number, value: string) => string;
  /** 行ヘッダーセルの背景色を返すコールバック（行インデックス渡し） */
  getRowHeaderBackground?: (rowIndex: number) => string | undefined;
  /** 列ヘッダーセルの背景色を返すコールバック（列インデックス渡し） */
  getColumnHeaderBackground?: (colIndex: number) => string | undefined;
  /** 配置・フィルター等のツールバーを表示するか（デフォルト: true） */
  showToolbar?: boolean;
  /** 列グループヘッダー（複数行対応）。列ヘッダーの上に描画される */
  columnHeaderGroups?: ColumnHeaderGroups;
  /** 行グループヘッダー（複数列対応）。行ヘッダーの左に描画される */
  rowHeaderGroups?: RowHeaderGroups;
  /** 列グループヘッダー1行あたりの高さ px（デフォルト: 20） */
  groupRowHeight?: number;
  /** 行グループヘッダー1列あたりの幅 px（デフォルト: 80） */
  groupColWidth?: number;
  /** 列ヘッダ部分をダブルクリックした時に呼ばれる（コールバック未指定時はノーオペ） */
  onColumnHeaderDoubleClick?: (col: number) => void;
  /** 翻訳関数（未指定時は locale から生成） */
  t?: SpreadsheetT;
  /** t 未指定時のロケール（未指定時は navigator.language） */
  locale?: string;
  /** 選択範囲からチャート作成コールバック（未指定時はコンテキストメニュー非表示）。 */
  onCreateChart?: (range: TableRange) => void;
}

export interface SpreadsheetGridHandle {
  /** グリッドのルート要素（呼び元レイアウトに収める flex column）。 */
  el: HTMLDivElement;
  /** 同期再描画（テスト・外部からの強制更新用）。 */
  redraw(): void;
  /** テーマ切替。 */
  update(patch: { isDark?: boolean }): void;
  destroy(): void;
}

/** Shift+クリック時のアンカーセルを解決する */
function resolveSelectionAnchor(
  sel: SpreadsheetSelection,
): { row: number; col: number } | null {
  if (sel.type === "cell") return { row: sel.row, col: sel.col };
  if (sel.type === "range") return { row: sel.startRow, col: sel.startCol };
  return null;
}

/** ヘッダー列クリック時の選択状態を返す */
function nextSelectionForHeaderColClick(
  col: number,
  shiftKey: boolean,
  selection: SpreadsheetSelection | null,
): SpreadsheetSelection {
  if (shiftKey && selection?.type === "col") {
    return { type: "col", start: selection.start, end: col };
  }
  return { type: "col", start: col, end: col };
}

/** 行番号クリック時の選択状態を返す */
function nextSelectionForRowNumClick(
  row: number,
  shiftKey: boolean,
  selection: SpreadsheetSelection | null,
): SpreadsheetSelection {
  if (shiftKey && selection?.type === "row") {
    return { type: "row", start: selection.start, end: row };
  }
  return { type: "row", start: row, end: row };
}

/** セルクリック時の選択状態を返す */
function nextSelectionForCellClick(
  cell: { row: number; col: number },
  shiftKey: boolean,
  selection: SpreadsheetSelection | null,
): SpreadsheetSelection {
  if (shiftKey && selection) {
    const anchor = resolveSelectionAnchor(selection);
    if (anchor) {
      return {
        type: "range",
        startRow: anchor.row,
        startCol: anchor.col,
        endRow: cell.row,
        endCol: cell.col,
      };
    }
  }
  return { type: "cell", row: cell.row, col: cell.col };
}

/** セル文字列の整列から canvas textAlign と描画 X を解決する（通常セル / sticky 行で共用）。 */
function resolveCellTextLayout(
  colAlign: CellAlign | null,
  cellLeft: number,
  cellWidth: number,
): { textAlign: CanvasTextAlign; textX: number } {
  if (colAlign === "center") return { textAlign: "center", textX: cellLeft + cellWidth / 2 };
  if (colAlign === "right") return { textAlign: "right", textX: cellLeft + cellWidth - 6 };
  return { textAlign: "left", textX: cellLeft + 6 };
}

export function mountSpreadsheetGrid(
  container: HTMLElement,
  options: SpreadsheetGridOptions,
): SpreadsheetGridHandle {
  injectSpreadsheetUiStyles();
  const {
    adapter,
    gridRows: GRID_ROWS = DEFAULT_GRID_ROWS,
    gridCols: GRID_COLS = DEFAULT_GRID_COLS,
    showApply = false,
    liveSync = false,
    showRange = false,
    showHeaderRow = false,
    columnHeaders,
    rowHeaders,
    rotateColumnHeaders = false,
    showToolbar = true,
    columnHeaderGroups,
    rowHeaderGroups,
    groupRowHeight = 20,
    groupColWidth = 80,
  } = options;
  const t = options.t ?? createSpreadsheetT("Spreadsheet", options.locale);
  const readOnly = adapter.readOnly ?? false;

  const innerROW_NUM_WIDTH = options.rowHeaderWidth ?? DEFAULT_ROW_NUM_WIDTH;
  const rowGroupWidth = (rowHeaderGroups?.length ?? 0) * groupColWidth;
  const ROW_NUM_WIDTH = innerROW_NUM_WIDTH + rowGroupWidth;
  const innerHEADER_HEIGHT = rotateColumnHeaders ? 120 : DEFAULT_HEADER_HEIGHT;
  const colGroupHeight = (columnHeaderGroups?.length ?? 0) * groupRowHeight;
  const HEADER_HEIGHT = innerHEADER_HEIGHT + colGroupHeight;

  /* ---------------------------------------------------------------- */
  /*  Mutable state (React useState の置換)                             */
  /* ---------------------------------------------------------------- */

  let isDark = options.isDark;
  let palette = getPalette(isDark);

  let settings: CellSizeSettings = {
    heightMode: "fixed",
    fixedHeight: options.cellSize ?? DEFAULT_ROW_HEIGHT,
    widthMode: "fixed",
    fixedWidth: options.cellSize ?? DEFAULT_COL_WIDTH,
  };
  let rowHeightOverrides = new Map<number, number>();
  let colWidthOverrides = new Map<number, number>();
  let editing: CellEditState | null = null;
  let filters = new Map<number, ColumnFilterState>();
  let filterRowVisible = false;
  let previewRange: DataRange | null = null;
  // フィルハンドルのドラッグ中の補完先プレビュー（選択 + 拡張ぶんの矩形）。
  let fillPreview: { minR: number; minC: number; maxR: number; maxC: number } | null = null;
  let reorderDrag: { type: "row" | "col"; sourceIndex: number; targetIndex: number | null } | null =
    null;
  let suppressClick = false;
  let dirty = false;
  let initialized = false;
  let skipSyncCount = 0;
  let destroyed = false;
  let rafId = 0;
  let contextMenuHandle: SpreadsheetContextMenuHandle | null = null;
  /** 直近 drawGrid のレイアウト。mousemove（カーソル形状のみ）での再計算を避けるキャッシュ。 */
  let lastLayout: GridLayout | null = null;
  let settingsDialog: SvDialogHandle | null = null;
  const disposers: Array<() => void> = [];

  const markDirty = (): void => {
    if (!initialized) return;
    if (!dirty) {
      dirty = true;
      options.onDirtyChange?.(true);
      updateToolbarState();
    }
  };

  const state = createSpreadsheetState({
    initialRows: 1,
    initialCols: 1,
    gridRows: GRID_ROWS,
    gridCols: GRID_COLS,
    onChange: () => {
      scheduleDraw();
    },
    onContentChange: () => {
      markDirty();
      if (filterRowVisible) renderFilterRow();
      // liveSync 時は Apply を待たず adapter へ即時反映（初期同期前は抑止）。
      if (liveSync && initialized) syncToAdapter();
    },
  });

  /* ---------------------------------------------------------------- */
  /*  Derived layout helpers                                           */
  /* ---------------------------------------------------------------- */

  const rowHeight = (): number =>
    settings.heightMode === "fixed" ? settings.fixedHeight : DEFAULT_ROW_HEIGHT;

  const getColWidth = (col: number): number => {
    const override = colWidthOverrides.get(col);
    if (override !== undefined) return override;
    if (settings.widthMode === "fixed") return settings.fixedWidth;
    let maxWidth = AUTO_WIDTH_MIN;
    const limit = Math.min(state.dataRange.rows, GRID_ROWS, state.grid.length);
    for (let r = 0; r < limit; r++) {
      const text = state.grid[r]?.[col];
      if (text) {
        const w = text.length * AUTO_WIDTH_CHAR_PX + AUTO_WIDTH_PADDING;
        if (w > maxWidth) maxWidth = w;
      }
    }
    return Math.min(maxWidth, AUTO_WIDTH_MAX);
  };

  const getColX = (col: number): number => {
    let x = ROW_NUM_WIDTH;
    for (let c = 0; c < col; c++) x += getColWidth(c);
    return x;
  };

  const getColAtX = (x: number): number => {
    let accX = ROW_NUM_WIDTH;
    for (let c = 0; c < GRID_COLS; c++) {
      const w = getColWidth(c);
      if (x < accX + w) return c;
      accX += w;
    }
    return GRID_COLS - 1;
  };

  const computeHiddenRows = (): Set<number> => {
    if (filters.size === 0) return new Set();
    const hidden = new Set<number>();
    for (let r = 1; r < GRID_ROWS; r++) {
      for (const [colIdx, filter] of filters) {
        if (!filter.selectedValues.has(state.grid[r]?.[colIdx] ?? "")) {
          hidden.add(r);
          break;
        }
      }
    }
    return hidden;
  };

  interface GridLayout {
    hiddenRows: ReadonlySet<number>;
    visibleRows: readonly number[];
    /** vi → topOffset からの累積 Y。長さ visibleRows.length+1。 */
    rowYs: readonly number[];
    filterOffset: number;
    topOffset: number;
    totalWidth: number;
    totalHeight: number;
    visibleDataRowCount: number;
  }

  const computeLayout = (): GridLayout => {
    const hiddenRows = computeHiddenRows();
    const visibleRows: number[] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      if (!hiddenRows.has(r)) visibleRows.push(r);
    }
    const rh = rowHeight();
    const rowYs = new Array<number>(visibleRows.length + 1);
    rowYs[0] = 0;
    for (let i = 0; i < visibleRows.length; i++) {
      rowYs[i + 1] = rowYs[i] + (rowHeightOverrides.get(visibleRows[i]) ?? rh);
    }
    const filterOffset = filterRowVisible ? FILTER_ROW_HEIGHT : 0;
    const topOffset = HEADER_HEIGHT + filterOffset;
    let totalWidth = ROW_NUM_WIDTH;
    for (let c = 0; c < GRID_COLS; c++) totalWidth += getColWidth(c);
    let visibleDataRowCount = 0;
    for (let r = 0; r < state.dataRange.rows; r++) {
      if (!hiddenRows.has(r)) visibleDataRowCount++;
    }
    return {
      hiddenRows,
      visibleRows,
      rowYs,
      filterOffset,
      topOffset,
      totalWidth,
      totalHeight: topOffset + rowYs[visibleRows.length],
      visibleDataRowCount,
    };
  };

  const gridRowToVisualIndex = (lay: GridLayout, gridRow: number): number => {
    if (lay.hiddenRows.size === 0) return gridRow;
    let lo = 0;
    let hi = lay.visibleRows.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (lay.visibleRows[mid] === gridRow) return mid;
      if (lay.visibleRows[mid] < gridRow) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  };

  const getRowHeightByVi = (lay: GridLayout, vi: number): number => {
    const row = lay.visibleRows[vi];
    if (row === undefined) return rowHeight();
    return rowHeightOverrides.get(row) ?? rowHeight();
  };

  const getViAtY = (lay: GridLayout, yFromTop: number): number => {
    const { rowYs } = lay;
    if (yFromTop <= 0) return 0;
    if (yFromTop >= rowYs[rowYs.length - 1]) return Math.max(0, rowYs.length - 2);
    let lo = 0;
    let hi = rowYs.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >>> 1;
      if (rowYs[mid] <= yFromTop) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  /** 各列のユニーク値（フィルタ行のプルダウン用） */
  const columnUniqueValues = (col: number): string[] => {
    const vals = new Set<string>();
    for (let r = 1; r < state.dataRange.rows; r++) {
      vals.add(state.grid[r]?.[col] ?? "");
    }
    return Array.from(vals).sort();
  };

  /* ---------------------------------------------------------------- */
  /*  DOM 構築                                                          */
  /* ---------------------------------------------------------------- */

  const root = document.createElement("div");
  root.className = "sv-root";
  const applyRootThemeVars = (): void => {
    for (const [k, v] of Object.entries(themeCssVars(isDark))) {
      root.style.setProperty(k, v);
    }
  };
  applyRootThemeVars();
  Object.assign(root.style, {
    display: "flex",
    flexDirection: "column",
    flex: "1",
    minHeight: "0",
    overflow: "hidden",
  });

  // Menu / Dialog / Tooltip は body へポータルされるため documentElement にも変数を適用する。
  applySpreadsheetThemeVars(isDark);

  /* ---- toolbar ---- */
  let alignGroup: SvToggleGroupHandle | null = null;
  let filterBtn: HTMLButtonElement | null = null;
  let clearFilterBtn: HTMLButtonElement | null = null;
  let applyBtn: HTMLButtonElement | null = null;
  let toolbarEl: HTMLDivElement | null = null;

  const updateToolbarState = (): void => {
    if (filterBtn) {
      filterBtn.style.color =
        filterRowVisible || filters.size > 0 ? "var(--sv-color-primary-main)" : "";
    }
    if (clearFilterBtn) {
      clearFilterBtn.style.display = filters.size > 0 ? "" : "none";
    }
    if (applyBtn) {
      applyBtn.className = dirty
        ? "sv-btn sv-btn--contained sv-btn--small"
        : "sv-btn sv-btn--outlined sv-btn--inherit sv-btn--small";
    }
  };

  /** グリッド全体（state）を adapter へ一括反映する。skipSyncCount で自身の再同期を抑止。 */
  const syncToAdapter = (): void => {
    if (readOnly) return;
    const cells: string[][] = [];
    const aligns: CellAlign[][] = [];
    for (let r = 0; r < state.dataRange.rows; r++) {
      const row: string[] = [];
      const alignRow: CellAlign[] = [];
      for (let c = 0; c < state.dataRange.cols; c++) {
        row.push(state.grid[r]?.[c] ?? "");
        alignRow.push(state.alignments[r]?.[c] ?? null);
      }
      cells.push(row);
      aligns.push(alignRow);
    }
    skipSyncCount++;
    adapter.replaceAll({ cells, alignments: aligns, range: state.dataRange });
  };

  /** 適用ボタン: グリッド全体を adapter に一括反映（React handleApply と同一） */
  const handleApply = (): void => {
    if (readOnly) return;
    syncToAdapter();
    if (dirty) {
      dirty = false;
      options.onDirtyChange?.(false);
      updateToolbarState();
    }
    options.onClose?.();
  };

  const handleAlignChange = (val: string): void => {
    const selection = state.selection;
    if (!val || !selection || readOnly) return;
    const align = val as CellAlign;
    if (selection.type === "cell") {
      state.setCellAlign(selection.row, selection.col, align);
    } else if (selection.type === "col") {
      const newAligns = state.alignments.map((r) => [...r]);
      const minC = Math.min(selection.start, selection.end);
      const maxC = Math.max(selection.start, selection.end);
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = minC; c <= maxC; c++) newAligns[r][c] = align;
      }
      state.setAlignments(newAligns);
    } else if (selection.type === "row") {
      const newAligns = state.alignments.map((r) => [...r]);
      const minR = Math.min(selection.start, selection.end);
      const maxR = Math.max(selection.start, selection.end);
      for (let r = minR; r <= maxR; r++) {
        for (let c = 0; c < GRID_COLS; c++) newAligns[r][c] = align;
      }
      state.setAlignments(newAligns);
    } else if (selection.type === "range") {
      // React 版は range 選択時に何もしない（cell/col/row のみ）— パリティ維持
    }
  };

  const openSettingsDialog = (): void => {
    settingsDialog?.close();
    const draft: CellSizeSettings = { ...settings };

    const content = document.createElement("div");
    Object.assign(content.style, {
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      paddingTop: "8px",
    });

    const buildSizeControl = (
      label: string,
      mode: "heightMode" | "widthMode",
      fixedKey: "fixedHeight" | "fixedWidth",
      min: number,
      max: number,
    ): HTMLDivElement => {
      const wrap = document.createElement("div");
      wrap.className = "sv-form-control";
      const lbl = document.createElement("div");
      lbl.className = "sv-form-label";
      lbl.textContent = label;
      const row = document.createElement("div");
      Object.assign(row.style, { display: "flex", alignItems: "center", gap: "8px" });
      const field = createSvTextField({
        value: String(draft[fixedKey]),
        type: "number",
        min,
        max,
        style: { width: "80px" },
        onInput: (v) => {
          draft[fixedKey] = Math.max(min, Number.parseInt(v, 10) || min);
        },
      });
      field.disabled = draft[mode] === "auto";
      const radios = createSvRadioGroup({
        name: `sv-${mode}`,
        row: true,
        value: draft[mode],
        options: [
          { value: "fixed", label: t("spreadsheetFixed") },
          { value: "auto", label: t("spreadsheetAuto") },
        ],
        onChange: (v) => {
          draft[mode] = v as "fixed" | "auto";
          field.disabled = v === "auto";
        },
      });
      const px = document.createElement("span");
      px.textContent = "px";
      row.append(radios.el, field, px);
      wrap.append(lbl, row);
      return wrap;
    };

    content.append(
      buildSizeControl(t("spreadsheetHeightMode"), "heightMode", "fixedHeight", 20, 200),
      buildSizeControl(t("spreadsheetWidthMode"), "widthMode", "fixedWidth", 40, 500),
    );

    const closeDialog = (): void => {
      settingsDialog?.close();
      settingsDialog = null;
    };
    settingsDialog = openSvDialog({
      title: t("spreadsheetCellSettings"),
      content,
      actions: [
        createSvButton({ label: t("spreadsheetCancel"), onClick: closeDialog }),
        createSvButton({
          label: t("spreadsheetApply"),
          variant: "contained",
          onClick: () => {
            settings = { ...draft };
            closeDialog();
            scheduleDraw();
            if (filterRowVisible) renderFilterRow();
          },
        }),
      ],
      onClose: closeDialog,
    });
  };

  if (showToolbar) {
    toolbarEl = document.createElement("div");
    Object.assign(toolbarEl.style, {
      display: "flex",
      alignItems: "center",
      borderBottom: `1px solid ${getDivider(isDark)}`,
      padding: "2px 8px",
      gap: "4px",
      flexShrink: "0",
    });

    alignGroup = createSvToggleGroup({
      value: null,
      buttons: [
        { value: "left", content: svIcon("FormatAlignLeft", { fontSize: 16 }), ariaLabel: t("alignLeft") },
        { value: "center", content: svIcon("FormatAlignCenter", { fontSize: 16 }), ariaLabel: t("alignCenter") },
        { value: "right", content: svIcon("FormatAlignRight", { fontSize: 16 }), ariaLabel: t("alignRight") },
      ],
      disabled: readOnly,
      onChange: handleAlignChange,
    });
    const [leftBtn, centerBtn, rightBtn] = [...alignGroup.el.querySelectorAll("button")];
    disposers.push(
      attachSvTooltip(leftBtn, t("alignLeft")),
      attachSvTooltip(centerBtn, t("alignCenter")),
      attachSvTooltip(rightBtn, t("alignRight")),
    );

    filterBtn = createSvIconButton({
      icon: svIcon("FilterList", { fontSize: 16 }),
      size: "small",
      ariaLabel: t("spreadsheetFilter"),
      onClick: () => {
        filterRowVisible = !filterRowVisible;
        renderFilterRow();
        updateToolbarState();
        scheduleDraw();
      },
    });
    filterBtn.style.marginLeft = "4px";
    disposers.push(attachSvTooltip(filterBtn, t("spreadsheetFilter")));

    clearFilterBtn = createSvIconButton({
      icon: svIcon("FilterListOff", { fontSize: 16 }),
      size: "small",
      ariaLabel: t("spreadsheetFilterClear"),
      onClick: () => {
        filters = new Map();
        filterRowVisible = false;
        renderFilterRow();
        updateToolbarState();
        scheduleDraw();
      },
    });
    clearFilterBtn.style.marginLeft = "2px";
    disposers.push(attachSvTooltip(clearFilterBtn, t("spreadsheetFilterClear")));

    const settingsBtn = createSvIconButton({
      icon: svIcon("Settings", { fontSize: 16 }),
      size: "small",
      ariaLabel: t("spreadsheetCellSettings"),
      onClick: openSettingsDialog,
    });
    settingsBtn.style.marginLeft = "4px";
    disposers.push(attachSvTooltip(settingsBtn, t("spreadsheetCellSettings")));

    const spacer = document.createElement("div");
    spacer.style.flex = "1";

    toolbarEl.append(alignGroup.el, filterBtn, clearFilterBtn, settingsBtn, spacer);

    if (showApply) {
      applyBtn = createSvButton({
        label: t("spreadsheetApply"),
        size: "small",
        variant: "outlined",
        color: "inherit",
        startIcon: svIcon("Check", { fontSize: 14 }),
        disabled: readOnly,
        onClick: handleApply,
      });
      Object.assign(applyBtn.style, {
        fontSize: "12px",
        minHeight: "24px",
        paddingLeft: "12px",
        paddingRight: "12px",
      });
      disposers.push(attachSvTooltip(applyBtn, t("spreadsheetApply")));
      toolbarEl.appendChild(applyBtn);
    }
    root.appendChild(toolbarEl);
    updateToolbarState();
  }

  /* ---- scroll container + canvas + filter row + edit input ---- */
  const scrollEl = document.createElement("div");
  scrollEl.className = "sv-grid-scroll";
  Object.assign(scrollEl.style, {
    overflow: "auto",
    flex: "1",
    minHeight: "0",
    position: "relative",
    fontSize: "13px",
    lineHeight: "24px",
  });
  const applyScrollbarVars = (): void => {
    scrollEl.style.setProperty(
      "--sv-sb-color",
      isDark ? "rgba(255,255,255,0.55) rgba(255,255,255,0.05)" : "rgba(0,0,0,0.5) rgba(0,0,0,0.05)",
    );
    scrollEl.style.setProperty("--sv-sb-thumb", isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)");
    scrollEl.style.setProperty(
      "--sv-sb-thumb-hover",
      isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)",
    );
  };
  applyScrollbarVars();
  scrollEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  const canvas = document.createElement("canvas");
  canvas.tabIndex = 0;
  Object.assign(canvas.style, { display: "block", outline: "none" });

  const filterRowEl = document.createElement("div");
  filterRowEl.style.display = "none";

  const input = document.createElement("input");
  input.type = "text";
  input.readOnly = readOnly;
  input.style.display = "none";

  // 外部アプリ（Excel 等）からの貼り付け捕捉用の隠し編集要素（paste-bin）。
  // VS Code webview では navigator.clipboard.readText が遮断され、かつ非編集の canvas には
  // ネイティブ paste イベントが届かない。Ctrl+V 時にこの textarea へ一瞬フォーカスを移し、
  // ここに発火する paste イベントの clipboardData を読むことで外部貼り付けを成立させる。
  // tabIndex=-1 で Tab 順から外し、画面外・不可視にしてユーザーには見えないようにする。
  const pasteBin = document.createElement("textarea");
  pasteBin.tabIndex = -1;
  // aria-hidden は付けない（focus を受ける要素に aria-hidden は ARIA 仕様違反のため）。
  // 代わりにラベルを与え、SR には貼り付け領域として伝える。視覚的非表示は CSS で担保する。
  pasteBin.setAttribute("aria-label", t("spreadsheetPasteArea"));
  Object.assign(pasteBin.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    border: "0",
    padding: "0",
    resize: "none",
  });

  scrollEl.append(canvas, filterRowEl, input, pasteBin);
  root.appendChild(scrollEl);
  container.appendChild(root);

  /* ---------------------------------------------------------------- */
  /*  drawGrid（React 版の canvas 描画を移植）                           */
  /* ---------------------------------------------------------------- */

  let canvasUnavailableLogged = false;
  const getContext2d = (): CanvasRenderingContext2D | null => {
    try {
      return canvas.getContext("2d");
    } catch (error) {
      // jsdom 等 2D context 非対応環境。初回のみ通知し、以降の描画は no-op にする。
      if (!canvasUnavailableLogged) {
        canvasUnavailableLogged = true;
        console.warn("[SpreadsheetGrid] canvas 2D context unavailable; drawing disabled", error);
      }
      return null;
    }
  };

  const drawGrid = (): void => {
    if (destroyed) return;
    const ctx = getContext2d();
    if (!ctx) return;

    const lay = computeLayout();
    lastLayout = lay;
    const { topOffset, totalWidth, totalHeight, visibleRows, rowYs, hiddenRows } = lay;
    const selection = state.selection;
    const grid = state.grid;
    const alignments = state.alignments;
    const dataRange = state.dataRange;

    const primaryColor = palette.primaryMain;
    const headerBg = palette.headerBg;
    const selectedBg = palette.cellSelectedBg;
    const borderColor = palette.divider;
    const bgColor = palette.bgPaper;
    const textColor = palette.textPrimary;
    const headerTextColor = palette.textSecondary;

    const dpr = globalThis.devicePixelRatio || 1;
    if (canvas.width !== totalWidth * dpr || canvas.height !== totalHeight * dpr) {
      canvas.width = totalWidth * dpr;
      canvas.height = totalHeight * dpr;
      canvas.style.width = `${totalWidth}px`;
      canvas.style.height = `${totalHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const scrollLeft = scrollEl.scrollLeft;
    const scrollTop = scrollEl.scrollTop;
    const viewWidth = scrollEl.clientWidth;
    const viewHeight = scrollEl.clientHeight;

    let startCol = 0;
    let endCol = GRID_COLS;
    {
      let accX = ROW_NUM_WIDTH;
      let foundStart = false;
      for (let c = 0; c < GRID_COLS; c++) {
        const cw = getColWidth(c);
        if (!foundStart && accX + cw > scrollLeft) {
          startCol = c;
          foundStart = true;
        }
        accX += cw;
        if (accX >= scrollLeft + viewWidth) {
          endCol = Math.min(c + 1, GRID_COLS);
          break;
        }
      }
    }
    const isStickyFirstRow = showHeaderRow && scrollTop > 0 && dataRange.rows > 0;
    const rawStartVi = Math.max(0, getViAtY(lay, scrollTop - topOffset));
    const startVi = isStickyFirstRow ? Math.max(1, rawStartVi) : rawStartVi;
    const endVi = Math.min(visibleRows.length, getViAtY(lay, scrollTop + viewHeight - topOffset) + 1);

    ctx.save();
    ctx.clearRect(scrollLeft, scrollTop, viewWidth, viewHeight);
    ctx.fillStyle = bgColor;
    ctx.fillRect(scrollLeft, scrollTop, viewWidth, viewHeight);

    const activeRange = previewRange ?? dataRange;

    const cellAreaTop = isStickyFirstRow
      ? scrollTop + topOffset + getRowHeightByVi(lay, 0)
      : scrollTop + topOffset;
    ctx.save();
    ctx.beginPath();
    ctx.rect(scrollLeft, cellAreaTop, viewWidth, scrollTop + viewHeight - cellAreaTop);
    ctx.clip();

    if (selection) {
      ctx.fillStyle = selectedBg;
      if (selection.type === "row") {
        const minR = Math.min(selection.start, selection.end);
        const maxR = Math.max(selection.start, selection.end);
        for (let r = minR; r <= maxR; r++) {
          const vi = gridRowToVisualIndex(lay, r);
          if (vi < 0) continue;
          ctx.fillRect(ROW_NUM_WIDTH, topOffset + rowYs[vi], totalWidth - ROW_NUM_WIDTH, getRowHeightByVi(lay, vi));
        }
      } else if (selection.type === "col") {
        const minC = Math.min(selection.start, selection.end);
        const maxC = Math.max(selection.start, selection.end);
        const x = getColX(minC);
        let w = 0;
        for (let c = minC; c <= maxC; c++) w += getColWidth(c);
        ctx.fillRect(x, topOffset, w, totalHeight - topOffset);
      } else if (selection.type === "range") {
        const minR = Math.min(selection.startRow, selection.endRow);
        const maxR = Math.max(selection.startRow, selection.endRow);
        const minC = Math.min(selection.startCol, selection.endCol);
        const maxC = Math.max(selection.startCol, selection.endCol);
        for (let r = minR; r <= maxR; r++) {
          const vi = gridRowToVisualIndex(lay, r);
          if (vi < 0) continue;
          const ry = topOffset + rowYs[vi];
          const rh = getRowHeightByVi(lay, vi);
          for (let c = minC; c <= maxC; c++) {
            ctx.fillRect(getColX(c), ry, getColWidth(c), rh);
          }
        }
      }
    }

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let c = startCol; c <= endCol; c++) {
      const x = getColX(c);
      ctx.moveTo(x, scrollTop);
      ctx.lineTo(x, Math.min(scrollTop + viewHeight, totalHeight));
    }
    if (scrollLeft < ROW_NUM_WIDTH) {
      ctx.moveTo(ROW_NUM_WIDTH, scrollTop);
      ctx.lineTo(ROW_NUM_WIDTH, Math.min(scrollTop + viewHeight, totalHeight));
    }
    for (let vi = startVi; vi <= endVi; vi++) {
      const y = topOffset + rowYs[vi];
      ctx.moveTo(scrollLeft, y);
      ctx.lineTo(Math.min(scrollLeft + viewWidth, totalWidth), y);
    }
    if (scrollTop < HEADER_HEIGHT) {
      ctx.moveTo(scrollLeft, HEADER_HEIGHT);
      ctx.lineTo(Math.min(scrollLeft + viewWidth, totalWidth), HEADER_HEIGHT);
    }
    ctx.stroke();

    const activeVisibleRows = (() => {
      if (hiddenRows.size === 0) return activeRange.rows;
      let c = 0;
      for (let r = 0; r < activeRange.rows; r++) {
        if (!hiddenRows.has(r)) c++;
      }
      return c;
    })();
    const drRight = getColX(activeRange.cols);
    const drBottom = topOffset + rowYs[activeVisibleRows];
    const drLeft = ROW_NUM_WIDTH;
    const drTop = topOffset + (rowYs[1] ?? rowHeight());

    if (showRange) {
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.rect(drLeft, drTop, drRight - drLeft, drBottom - drTop);
      ctx.stroke();
    }

    {
      const headerRowVi = showHeaderRow ? gridRowToVisualIndex(lay, 0) : -1;
      if (headerRowVi >= 0) {
        ctx.fillStyle = headerBg;
        ctx.fillRect(ROW_NUM_WIDTH, topOffset + rowYs[headerRowVi], totalWidth - ROW_NUM_WIDTH, getRowHeightByVi(lay, headerRowVi));
      }
    }

    ctx.fillStyle = textColor;
    ctx.font = FONT_CELL;
    ctx.textBaseline = "middle";

    for (let vi = startVi; vi < endVi; vi++) {
      const r = visibleRows[vi];
      const rh = getRowHeightByVi(lay, vi);
      const gridRow = grid[r];
      if (!gridRow) continue;
      for (let c = startCol; c < endCol; c++) {
        const value = gridRow[c];
        if (editing?.row === r && editing?.col === c) continue;

        const cw = getColWidth(c);
        const cellLeft = getColX(c);
        const cellTop = topOffset + rowYs[vi];

        const cellBg = options.getCellBackground?.(r, c, value ?? "");
        if (cellBg) {
          ctx.save();
          ctx.fillStyle = cellBg;
          ctx.fillRect(cellLeft, cellTop, cw, rh);
          ctx.restore();
        }

        const displayValue = options.getCellDisplayText
          ? options.getCellDisplayText(r, c, value ?? "")
          : value;
        if (!displayValue) continue;

        const cellY = cellTop + rh / 2;
        const { textAlign, textX } = resolveCellTextLayout(alignments[r]?.[c] ?? null, cellLeft, cw);
        ctx.textAlign = textAlign;

        ctx.save();
        ctx.beginPath();
        ctx.rect(cellLeft, cellTop, cw, rh);
        ctx.clip();
        if (r === 0) {
          ctx.font = FONT_CELL_BOLD;
        }
        ctx.fillText(displayValue, textX, cellY);
        if (r === 0) {
          ctx.font = FONT_CELL;
        }
        ctx.restore();
      }
    }

    ctx.restore();
    ctx.save();

    const stickyRowY = scrollTop + topOffset;
    if (isStickyFirstRow) {
      const stickyRh = getRowHeightByVi(lay, 0);
      ctx.fillStyle = headerBg;
      ctx.fillRect(ROW_NUM_WIDTH, stickyRowY, totalWidth - ROW_NUM_WIDTH, stickyRh);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(scrollLeft, stickyRowY + stickyRh);
      ctx.lineTo(scrollLeft + viewWidth, stickyRowY + stickyRh);
      ctx.stroke();

      ctx.fillStyle = headerBg;
      ctx.fillRect(scrollLeft, stickyRowY, ROW_NUM_WIDTH, stickyRh);
      ctx.fillStyle = headerTextColor;
      ctx.font = FONT_HEADER;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("H", scrollLeft + ROW_NUM_WIDTH / 2, stickyRowY + stickyRh / 2);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(scrollLeft + ROW_NUM_WIDTH, stickyRowY);
      ctx.lineTo(scrollLeft + ROW_NUM_WIDTH, stickyRowY + stickyRh);
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.font = FONT_CELL_BOLD;
      ctx.textBaseline = "middle";
      for (let c = startCol; c < endCol; c++) {
        const value = grid[0]?.[c];
        if (!value) continue;
        const cw = getColWidth(c);
        const cellLeft = getColX(c);
        const cellY = stickyRowY + stickyRh / 2;
        const { textAlign, textX } = resolveCellTextLayout(alignments[0]?.[c] ?? null, cellLeft, cw);
        ctx.textAlign = textAlign;

        ctx.save();
        ctx.beginPath();
        ctx.rect(cellLeft, stickyRowY, cw, stickyRh);
        ctx.clip();
        ctx.fillText(value, textX, cellY);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(scrollLeft, cellAreaTop, ROW_NUM_WIDTH, scrollTop + viewHeight - cellAreaTop);
    ctx.clip();

    ctx.fillStyle = headerBg;
    ctx.fillRect(scrollLeft, cellAreaTop, ROW_NUM_WIDTH, scrollTop + viewHeight - cellAreaTop);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(scrollLeft + ROW_NUM_WIDTH, cellAreaTop);
    ctx.lineTo(scrollLeft + ROW_NUM_WIDTH, scrollTop + viewHeight);
    ctx.stroke();

    if (rowHeaderGroups && rowGroupWidth > 0) {
      for (let gi = 0; gi < rowHeaderGroups.length; gi++) {
        const groupX = scrollLeft + gi * groupColWidth;
        const groupCol = rowHeaderGroups[gi];
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(groupX + groupColWidth, cellAreaTop);
        ctx.lineTo(groupX + groupColWidth, scrollTop + viewHeight);
        ctx.stroke();
        let rowIdx = 0;
        for (const spanItem of groupCol) {
          const startVi2 = gridRowToVisualIndex(lay, rowIdx);
          const endRowIdx2 = Math.min(rowIdx + spanItem.span - 1, GRID_ROWS - 1);
          const endVi2 = gridRowToVisualIndex(lay, endRowIdx2);
          if (startVi2 >= 0 && endVi2 >= 0 && spanItem.label) {
            const y0 = topOffset + rowYs[startVi2];
            const spanH = rowYs[endVi2 + 1] - rowYs[startVi2];
            ctx.fillStyle = headerTextColor;
            ctx.font = FONT_GROUP;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.save();
            ctx.beginPath();
            ctx.rect(groupX, y0, groupColWidth, spanH);
            ctx.clip();
            ctx.fillText(spanItem.label, groupX + groupColWidth / 2, y0 + spanH / 2);
            ctx.restore();
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(groupX, y0 + spanH);
            ctx.lineTo(groupX + groupColWidth, y0 + spanH);
            ctx.stroke();
          }
          rowIdx += spanItem.span;
        }
      }
    }

    ctx.fillStyle = headerTextColor;
    ctx.font = FONT_HEADER;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let vi = startVi; vi < endVi; vi++) {
      const r = visibleRows[vi];
      const x = scrollLeft + rowGroupWidth + innerROW_NUM_WIDTH / 2;
      const rh = getRowHeightByVi(lay, vi);
      const y = topOffset + rowYs[vi] + rh / 2;

      const rowHeaderBg = options.getRowHeaderBackground?.(r);
      if (rowHeaderBg) {
        ctx.save();
        ctx.fillStyle = rowHeaderBg + "55";
        ctx.fillRect(scrollLeft + rowGroupWidth, topOffset + rowYs[vi], innerROW_NUM_WIDTH, rh);
        ctx.restore();
      }

      if (
        selection?.type === "row" &&
        r >= Math.min(selection.start, selection.end) &&
        r <= Math.max(selection.start, selection.end)
      ) {
        ctx.save();
        ctx.fillStyle = selectedBg;
        ctx.fillRect(scrollLeft + rowGroupWidth, topOffset + rowYs[vi], innerROW_NUM_WIDTH, rh);
        ctx.restore();
        ctx.fillStyle = headerTextColor;
      }

      ctx.fillText(
        rowHeaders?.[r] ?? (showHeaderRow && r === 0 ? "H" : String(showHeaderRow ? r : r + 1)),
        x,
        y,
      );
    }
    ctx.restore();

    ctx.fillStyle = headerBg;
    ctx.fillRect(scrollLeft, scrollTop, viewWidth, HEADER_HEIGHT);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(scrollLeft, scrollTop + HEADER_HEIGHT);
    ctx.lineTo(scrollLeft + viewWidth, scrollTop + HEADER_HEIGHT);
    ctx.stroke();

    if (columnHeaderGroups && colGroupHeight > 0) {
      for (let gi = 0; gi < columnHeaderGroups.length; gi++) {
        const groupY = scrollTop + gi * groupRowHeight;
        const groupRow = columnHeaderGroups[gi];
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(scrollLeft + ROW_NUM_WIDTH, groupY + groupRowHeight);
        ctx.lineTo(scrollLeft + viewWidth, groupY + groupRowHeight);
        ctx.stroke();
        let colIdx = 0;
        for (const spanItem of groupRow) {
          const x0 = getColX(colIdx);
          let spanWidth = 0;
          for (let c = colIdx; c < colIdx + spanItem.span && c < GRID_COLS; c++) {
            spanWidth += getColWidth(c);
          }
          if (spanWidth > 0 && spanItem.label) {
            ctx.fillStyle = headerTextColor;
            ctx.font = FONT_GROUP;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.save();
            ctx.beginPath();
            ctx.rect(x0, groupY, spanWidth, groupRowHeight);
            ctx.clip();
            ctx.fillText(spanItem.label, x0 + spanWidth / 2, groupY + groupRowHeight / 2);
            ctx.restore();
          }
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(x0 + spanWidth, groupY);
          ctx.lineTo(x0 + spanWidth, groupY + groupRowHeight);
          ctx.stroke();
          colIdx += spanItem.span;
        }
      }
    }

    const colHeaderY = scrollTop + colGroupHeight;
    ctx.fillStyle = headerTextColor;
    ctx.font = FONT_HEADER;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let c = startCol; c < endCol; c++) {
      const cw = getColWidth(c);
      const cx = getColX(c);
      const x = cx + cw / 2;
      const y = colHeaderY + innerHEADER_HEIGHT / 2;

      const colHeaderBg = options.getColumnHeaderBackground?.(c);
      if (colHeaderBg) {
        ctx.save();
        ctx.fillStyle = colHeaderBg + "55";
        ctx.fillRect(cx, colHeaderY, cw, innerHEADER_HEIGHT);
        ctx.restore();
      }

      if (
        selection?.type === "col" &&
        c >= Math.min(selection.start, selection.end) &&
        c <= Math.max(selection.start, selection.end)
      ) {
        ctx.save();
        ctx.fillStyle = selectedBg;
        ctx.fillRect(cx, colHeaderY, cw, innerHEADER_HEIGHT);
        ctx.restore();
        ctx.fillStyle = headerTextColor;
      }

      if (rotateColumnHeaders && columnHeaders?.[c] != null) {
        ctx.save();
        ctx.translate(x, colHeaderY + innerHEADER_HEIGHT - 4);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "left";
        ctx.fillText(columnHeaders[c], 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(columnHeaders?.[c] ?? columnLabel(c), x, y);
      }
    }

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let c = startCol; c <= endCol; c++) {
      const x = getColX(c);
      ctx.moveTo(x, colHeaderY);
      ctx.lineTo(x, colHeaderY + innerHEADER_HEIGHT);
    }
    ctx.stroke();

    ctx.fillStyle = headerBg;
    ctx.fillRect(scrollLeft, scrollTop, ROW_NUM_WIDTH, HEADER_HEIGHT);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(scrollLeft + ROW_NUM_WIDTH, scrollTop);
    ctx.lineTo(scrollLeft + ROW_NUM_WIDTH, scrollTop + HEADER_HEIGHT);
    ctx.moveTo(scrollLeft, scrollTop + HEADER_HEIGHT);
    ctx.lineTo(scrollLeft + ROW_NUM_WIDTH, scrollTop + HEADER_HEIGHT);
    if (columnHeaderGroups && colGroupHeight > 0) {
      for (let gi = 0; gi < columnHeaderGroups.length; gi++) {
        ctx.moveTo(scrollLeft, scrollTop + (gi + 1) * groupRowHeight);
        ctx.lineTo(scrollLeft + ROW_NUM_WIDTH, scrollTop + (gi + 1) * groupRowHeight);
      }
    }
    ctx.stroke();

    if (selection?.type === "cell") {
      const selVi = gridRowToVisualIndex(lay, selection.row);
      if (selVi >= 0) {
        const selCw = getColWidth(selection.col);
        const selRh = getRowHeightByVi(lay, selVi);
        const cellX = getColX(selection.col);
        const cellY = topOffset + rowYs[selVi];
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(cellX + 1, cellY + 1, selCw - 2, selRh - 2);
      }
    } else if (selection?.type === "range") {
      const minR = Math.min(selection.startRow, selection.endRow);
      const maxR = Math.max(selection.startRow, selection.endRow);
      const minC = Math.min(selection.startCol, selection.endCol);
      const maxC = Math.max(selection.startCol, selection.endCol);
      const topVi = gridRowToVisualIndex(lay, minR);
      const bottomVi = gridRowToVisualIndex(lay, maxR);
      if (topVi >= 0 && bottomVi >= 0) {
        const rx = getColX(minC);
        const ry = topOffset + rowYs[topVi];
        let rw = 0;
        for (let c = minC; c <= maxC; c++) rw += getColWidth(c);
        const rh = rowYs[bottomVi + 1] - rowYs[topVi];
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
      }
    }

    if (showRange) {
      ctx.fillStyle = primaryColor;
      ctx.fillRect(drRight - 5, drBottom - 5, 10, 10);
    }

    // フィルドラッグ中のプレビュー（補完先を破線で示す）。
    if (fillPreview) {
      const pTopVi = gridRowToVisualIndex(lay, fillPreview.minR);
      const pBotVi = gridRowToVisualIndex(lay, fillPreview.maxR);
      if (pTopVi >= 0 && pBotVi >= 0) {
        const px = getColX(fillPreview.minC);
        const py = topOffset + rowYs[pTopVi];
        let pw = 0;
        for (let c = fillPreview.minC; c <= fillPreview.maxC; c++) pw += getColWidth(c);
        const ph = rowYs[pBotVi + 1] - rowYs[pTopVi];
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
        ctx.setLineDash([]);
      }
    }

    // フィルハンドル（選択右下角の小さな四角）。readOnly 時や選択なしは描かれない。
    const fillPos = getFillHandlePos(lay);
    if (fillPos) {
      const s = FILL_HANDLE_SIZE;
      ctx.fillStyle = primaryColor;
      ctx.fillRect(fillPos.x - s / 2, fillPos.y - s / 2, s, s);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.strokeRect(fillPos.x - s / 2, fillPos.y - s / 2, s, s);
    }

    if (reorderDrag?.targetIndex != null) {
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (reorderDrag.type === "row") {
        const reorderVi = gridRowToVisualIndex(lay, reorderDrag.targetIndex);
        const baseVi = reorderVi >= 0 ? reorderVi : reorderDrag.targetIndex;
        const indicatorY = topOffset + (rowYs[baseVi] ?? baseVi * rowHeight());
        ctx.moveTo(ROW_NUM_WIDTH, indicatorY);
        ctx.lineTo(totalWidth, indicatorY);
      } else {
        const indicatorX = getColX(reorderDrag.targetIndex);
        ctx.moveTo(indicatorX, topOffset);
        ctx.lineTo(indicatorX, totalHeight);
      }
      ctx.stroke();
    }

    ctx.restore();

    syncEditInput(lay);
  };

  const scheduleDraw = (): void => {
    if (destroyed) return;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(drawGrid);
  };

  /* ---------------------------------------------------------------- */
  /*  Edit input                                                        */
  /* ---------------------------------------------------------------- */

  const syncEditInput = (lay?: GridLayout): void => {
    if (!editing) {
      input.style.display = "none";
      return;
    }
    const layout = lay ?? computeLayout();
    const vi = gridRowToVisualIndex(layout, editing.row);
    Object.assign(input.style, {
      display: "",
      position: "absolute",
      left: `${getColX(editing.col)}px`,
      top: `${layout.topOffset + (layout.rowYs[vi] ?? 0)}px`,
      width: `${getColWidth(editing.col)}px`,
      height: `${getRowHeightByVi(layout, vi)}px`,
      border: `2px solid ${palette.primaryMain}`,
      padding: "0 6px",
      fontSize: "13px",
      fontFamily: "inherit",
      background: palette.bgPaper,
      color: palette.textPrimary,
      outline: "none",
      boxSizing: "border-box",
      zIndex: "1",
    });
  };

  const startEditing = (row: number, col: number): void => {
    if (readOnly) return;
    const value = state.grid[row]?.[col] ?? "";
    editing = { row, col, value };
    input.value = value;
    syncEditInput();
    input.focus();
    input.select();
    scheduleDraw();
  };

  const startEditingWithChar = (row: number, col: number, char: string): void => {
    if (readOnly) return;
    state.setCellValue(row, col, char);
    editing = { row, col, value: char };
    input.value = char;
    syncEditInput();
    input.focus();
    scheduleDraw();
  };

  const commitEditing = (value: string): void => {
    if (!editing) return;
    state.setCellValue(editing.row, editing.col, value);
    editing = null;
    syncEditInput();
    scheduleDraw();
  };

  const cancelEditing = (): void => {
    editing = null;
    syncEditInput();
    scheduleDraw();
  };

  /* ---------------------------------------------------------------- */
  /*  Filter row                                                        */
  /* ---------------------------------------------------------------- */

  const renderFilterRow = (): void => {
    filterRowEl.replaceChildren();
    if (!filterRowVisible) {
      filterRowEl.style.display = "none";
      return;
    }
    const lay = computeLayout();
    Object.assign(filterRowEl.style, {
      display: "flex",
      position: "absolute",
      top: `${HEADER_HEIGHT}px`,
      left: "0",
      height: `${FILTER_ROW_HEIGHT}px`,
      zIndex: "2",
      pointerEvents: "auto",
      width: `${lay.totalWidth}px`,
    });
    const corner = document.createElement("div");
    Object.assign(corner.style, {
      minWidth: `${ROW_NUM_WIDTH}px`,
      flexShrink: "0",
      background: palette.bgPaper,
    });
    filterRowEl.appendChild(corner);
    for (let c = 0; c < state.dataRange.cols; c++) {
      const col = c;
      const cell = document.createElement("div");
      Object.assign(cell.style, {
        minWidth: `${getColWidth(col)}px`,
        maxWidth: `${getColWidth(col)}px`,
        flexShrink: "0",
        padding: "0 2px",
        background: palette.bgPaper,
      });
      const select = document.createElement("select");
      Object.assign(select.style, {
        width: "100%",
        height: "24px",
        fontSize: "11px",
        border: `1px solid ${palette.divider}`,
        borderRadius: "2px",
        background: palette.bgPaper,
        color: palette.textPrimary,
        outline: "none",
        padding: "0 2px",
      });
      const allOpt = document.createElement("option");
      allOpt.value = "__all__";
      allOpt.textContent = t("spreadsheetFilterSelectAll");
      select.appendChild(allOpt);
      for (const v of columnUniqueValues(col)) {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v || "(empty)";
        select.appendChild(opt);
      }
      const currentFilter = filters.get(col);
      select.value =
        currentFilter && currentFilter.selectedValues.size === 1
          ? [...currentFilter.selectedValues][0]
          : "__all__";
      select.addEventListener("change", () => {
        const val = select.value;
        if (val === "__all__") {
          filters.delete(col);
        } else {
          filters.set(col, { colIndex: col, selectedValues: new Set([val]) });
        }
        updateToolbarState();
        scheduleDraw();
      });
      cell.appendChild(select);
      filterRowEl.appendChild(cell);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Mouse / keyboard handlers（React 版を移植）                        */
  /* ---------------------------------------------------------------- */

  const getCanvasCoords = (e: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const getGridCoords = (lay: GridLayout, e: MouseEvent): { row: number; col: number } | null => {
    const { x, y } = getCanvasCoords(e);
    if (y < lay.topOffset || x < ROW_NUM_WIDTH) return null;
    const col = getColAtX(x);
    const vi = getViAtY(lay, y - lay.topOffset);
    if (vi < 0 || vi >= lay.visibleRows.length || col < 0 || col >= GRID_COLS) return null;
    return { row: lay.visibleRows[vi], col };
  };

  const getHeaderCol = (e: MouseEvent): number | null => {
    const { x, y } = getCanvasCoords(e);
    if (y >= HEADER_HEIGHT || x < ROW_NUM_WIDTH) return null;
    const col = getColAtX(x);
    return col >= 0 && col < GRID_COLS ? col : null;
  };

  const getRowNum = (lay: GridLayout, e: MouseEvent): number | null => {
    const { x, y } = getCanvasCoords(e);
    if (x >= ROW_NUM_WIDTH || y < lay.topOffset) return null;
    const vi = getViAtY(lay, y - lay.topOffset);
    if (vi < 0 || vi >= lay.visibleRows.length) return null;
    return lay.visibleRows[vi];
  };

  const isNearRightEdge = (x: number): boolean =>
    Math.abs(x - getColX(state.dataRange.cols)) < RESIZE_HANDLE_THRESHOLD;

  const findColEdgeAtX = (lay: GridLayout, x: number, y: number): number | null => {
    if (y >= lay.topOffset) return null;
    if (x < ROW_NUM_WIDTH) return null;
    let accX = ROW_NUM_WIDTH;
    for (let c = 0; c < GRID_COLS; c++) {
      accX += getColWidth(c);
      if (Math.abs(x - accX) < RESIZE_HANDLE_THRESHOLD) return c;
    }
    return null;
  };

  const isNearBottomEdge = (lay: GridLayout, y: number): boolean =>
    Math.abs(y - (lay.topOffset + lay.rowYs[lay.visibleDataRowCount])) < RESIZE_HANDLE_THRESHOLD;

  const findRowEdgeAtY = (lay: GridLayout, x: number, y: number): number | null => {
    if (x >= ROW_NUM_WIDTH) return null;
    if (y < lay.topOffset) return null;
    for (let vi = 0; vi < lay.visibleRows.length; vi++) {
      if (Math.abs(y - (lay.topOffset + lay.rowYs[vi + 1])) < RESIZE_HANDLE_THRESHOLD) return vi;
    }
    return null;
  };

  const closeContextMenu = (): void => {
    contextMenuHandle?.close();
    contextMenuHandle = null;
  };

  const onCanvasClick = (e: MouseEvent): void => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const lay = computeLayout();
    const coords = getCanvasCoords(e);

    if (coords.x < ROW_NUM_WIDTH && coords.y < HEADER_HEIGHT) {
      state.setSelection({
        type: "range",
        startRow: 0,
        startCol: 0,
        endRow: state.dataRange.rows - 1,
        endCol: state.dataRange.cols - 1,
      });
      cancelEditing();
      return;
    }

    const col = getHeaderCol(e);
    if (col !== null) {
      state.setSelection(nextSelectionForHeaderColClick(col, e.shiftKey, state.selection));
      cancelEditing();
      return;
    }

    const row = getRowNum(lay, e);
    if (row !== null) {
      state.setSelection(nextSelectionForRowNumClick(row, e.shiftKey, state.selection));
      cancelEditing();
      return;
    }

    const cell = getGridCoords(lay, e);
    if (cell) {
      state.setSelection(nextSelectionForCellClick(cell, e.shiftKey, state.selection));
      cancelEditing();
    }
  };

  const onCanvasDoubleClick = (e: MouseEvent): void => {
    const lay = computeLayout();
    if (options.onColumnHeaderDoubleClick) {
      const { x, y } = getCanvasCoords(e);
      if (y < lay.topOffset && y >= 0 && x >= ROW_NUM_WIDTH) {
        const col = getColAtX(x);
        if (col >= 0 && col < GRID_COLS) {
          options.onColumnHeaderDoubleClick(col);
          return;
        }
      }
    }
    const cell = getGridCoords(lay, e);
    if (cell) startEditing(cell.row, cell.col);
  };

  const onCanvasContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    const lay = computeLayout();

    const openMenu = (target: import("@anytime-markdown/spreadsheet-core").ContextMenuState["target"]): void => {
      closeContextMenu();
      contextMenuHandle = openSpreadsheetContextMenu(
        { anchorX: e.clientX, anchorY: e.clientY, target },
        {
          adapter,
          dataRange: state.dataRange,
          grid: state.grid,
          onClose: closeContextMenu,
          onInsertRow: state.insertRow,
          onDeleteRow: state.deleteRow,
          onInsertCol: state.insertCol,
          onDeleteCol: state.deleteCol,
          onSwapRows: state.swapRows,
          onSwapCols: state.swapCols,
          setDataRange: state.setDataRange,
          setCellValue: state.setCellValue,
          onOpenFilter: () => {
            filterRowVisible = true;
            renderFilterRow();
            updateToolbarState();
            scheduleDraw();
          },
          onCreateChart: options.onCreateChart,
          t,
        },
      );
    };

    const row = getRowNum(lay, e);
    if (row !== null) {
      openMenu({ type: "row", index: row });
      return;
    }
    const col = getHeaderCol(e);
    if (col !== null) {
      openMenu({ type: "col", index: col });
      return;
    }
    const cell = getGridCoords(lay, e);
    if (cell !== null) {
      state.setSelection({ type: "cell", row: cell.row, col: cell.col });
      openMenu({ type: "cell", row: cell.row, col: cell.col });
    }
  };

  /** document に張る一時 drag リスナー（destroy 時にも除去する） */
  const activeDragCleanups = new Set<() => void>();
  const trackDrag = (
    onMove: (ev: MouseEvent) => void,
    onUp: (ev: MouseEvent) => void,
  ): void => {
    const cleanup = (): void => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", handleUp);
      activeDragCleanups.delete(cleanup);
    };
    const handleUp = (ev: MouseEvent): void => {
      cleanup();
      onUp(ev);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", handleUp);
    activeDragCleanups.add(cleanup);
  };

  /** 行/列ヘッダの並べ替えドラッグ（軸差分のみパラメータ化した row/col 共通実装）。 */
  const startReorderDrag = (
    e: MouseEvent,
    lay: GridLayout,
    axis: "row" | "col",
    sourceIndex: number,
  ): void => {
    const startCoord = axis === "row" ? e.clientY : e.clientX;
    let dragStarted = false;
    trackDrag(
      (ev) => {
        const coord = axis === "row" ? ev.clientY : ev.clientX;
        if (!dragStarted && Math.abs(coord - startCoord) >= DRAG_THRESHOLD) {
          dragStarted = true;
          reorderDrag = { type: axis, sourceIndex, targetIndex: null };
        }
        if (dragStarted) {
          const rect = canvas.getBoundingClientRect();
          let targetIndex: number;
          if (axis === "row") {
            const my = ev.clientY - rect.top;
            const targetVi = Math.max(0, Math.min(lay.visibleRows.length, getViAtY(lay, my - lay.topOffset)));
            targetIndex = targetVi < lay.visibleRows.length ? lay.visibleRows[targetVi] : GRID_ROWS;
          } else {
            targetIndex = Math.max(0, Math.min(GRID_COLS, getColAtX(ev.clientX - rect.left)));
          }
          reorderDrag = reorderDrag ? { ...reorderDrag, targetIndex } : null;
          scheduleDraw();
        }
      },
      () => {
        if (!dragStarted) return;
        if (reorderDrag?.targetIndex != null && reorderDrag.targetIndex !== reorderDrag.sourceIndex) {
          const from = reorderDrag.sourceIndex;
          const to = reorderDrag.targetIndex > from ? reorderDrag.targetIndex - 1 : reorderDrag.targetIndex;
          if (from !== to) {
            if (axis === "row") {
              state.swapRows(from, to);
              state.setSelection({ type: "row", start: to, end: to });
            } else {
              state.swapCols(from, to);
              state.setSelection({ type: "col", start: to, end: to });
            }
          }
        }
        reorderDrag = null;
        suppressClick = true;
        scheduleDraw();
      },
    );
  };

  /** cell / range 選択の矩形境界（grid 座標）。row/col ヘッダ選択や未選択は null。 */
  const getCellRangeBounds = (
    sel: SpreadsheetSelection | null,
  ): { minR: number; minC: number; maxR: number; maxC: number } | null => {
    if (sel?.type === "cell") return { minR: sel.row, minC: sel.col, maxR: sel.row, maxC: sel.col };
    if (sel?.type === "range") {
      return {
        minR: Math.min(sel.startRow, sel.endRow),
        minC: Math.min(sel.startCol, sel.endCol),
        maxR: Math.max(sel.startRow, sel.endRow),
        maxC: Math.max(sel.startCol, sel.endCol),
      };
    }
    return null;
  };

  /** フィルハンドル（選択右下角）の中心ピクセル座標。非表示条件なら null。 */
  const getFillHandlePos = (lay: GridLayout): { x: number; y: number } | null => {
    if (readOnly) return null;
    const b = getCellRangeBounds(state.selection);
    if (!b) return null;
    const bottomVi = gridRowToVisualIndex(lay, b.maxR);
    if (bottomVi < 0) return null;
    return {
      x: getColX(b.maxC) + getColWidth(b.maxC),
      y: lay.topOffset + lay.rowYs[bottomVi + 1],
    };
  };

  /** (x,y) がフィルハンドルの当たり判定内か。 */
  const isOnFillHandle = (x: number, y: number, lay: GridLayout): boolean => {
    const pos = getFillHandlePos(lay);
    if (!pos) return false;
    return Math.abs(x - pos.x) <= FILL_HANDLE_HIT && Math.abs(y - pos.y) <= FILL_HANDLE_HIT;
  };

  /** フィル確定: src を起点に target まで下 or 右へ補完値を書き込む。 */
  const applyFill = (
    src: { minR: number; minC: number; maxR: number; maxC: number },
    target: { minR: number; minC: number; maxR: number; maxC: number },
  ): void => {
    if (readOnly) return;
    const down = target.maxR > src.maxR;
    const right = target.maxC > src.maxC;
    if (!down && !right) return;

    // 補完元ベクトルを拡張前に読み取る。
    const sources: string[][] = [];
    if (down) {
      for (let c = src.minC; c <= src.maxC; c++) {
        const col: string[] = [];
        for (let r = src.minR; r <= src.maxR; r++) col.push(state.grid[r]?.[c] ?? "");
        sources.push(col);
      }
    } else {
      for (let r = src.minR; r <= src.maxR; r++) {
        const row: string[] = [];
        for (let c = src.minC; c <= src.maxC; c++) row.push(state.grid[r]?.[c] ?? "");
        sources.push(row);
      }
    }

    // 補完先がデータ範囲を超える場合は範囲を拡張（永続・可視範囲に含める）。
    const neededRows = Math.max(state.dataRange.rows, target.maxR + 1);
    const neededCols = Math.max(state.dataRange.cols, target.maxC + 1);
    if (neededRows !== state.dataRange.rows || neededCols !== state.dataRange.cols) {
      state.setDataRange({ rows: neededRows, cols: neededCols });
    }

    if (down) {
      const count = target.maxR - src.maxR;
      for (let ci = 0; ci < sources.length; ci++) {
        const values = computeFillValues(sources[ci], count);
        for (let i = 0; i < count; i++) state.setCellValue(src.maxR + 1 + i, src.minC + ci, values[i]);
      }
    } else {
      const count = target.maxC - src.maxC;
      for (let ri = 0; ri < sources.length; ri++) {
        const values = computeFillValues(sources[ri], count);
        for (let i = 0; i < count; i++) state.setCellValue(src.minR + ri, src.maxC + 1 + i, values[i]);
      }
    }

    // 補完後の範囲を選択する（Excel 同様）。
    state.setSelection({
      type: "range",
      startRow: src.minR,
      startCol: src.minC,
      endRow: target.maxR,
      endCol: target.maxC,
    });
  };

  const onCanvasMouseDown = (e: MouseEvent): void => {
    const lay = computeLayout();
    const { x, y } = getCanvasCoords(e);

    // フィルハンドル（選択右下角）のドラッグ開始。showRange 端ドラッグより優先する。
    if (isOnFillHandle(x, y, lay)) {
      const src = getCellRangeBounds(state.selection);
      if (src) {
        e.preventDefault();
        fillPreview = { ...src };
        trackDrag(
          (ev) => {
            const rect = canvas.getBoundingClientRect();
            const mx = ev.clientX - rect.left;
            const my = ev.clientY - rect.top;
            const col = getColAtX(mx);
            const vi = getViAtY(lay, my - lay.topOffset);
            const row = vi >= 0 && vi < lay.visibleRows.length ? lay.visibleRows[vi] : vi;
            const downExt = Math.max(0, row - src.maxR);
            const rightExt = Math.max(0, col - src.maxC);
            if (downExt === 0 && rightExt === 0) {
              fillPreview = { ...src };
            } else if (downExt >= rightExt) {
              fillPreview = { ...src, maxR: Math.min(row, GRID_ROWS - 1) };
            } else {
              fillPreview = { ...src, maxC: Math.min(col, GRID_COLS - 1) };
            }
            scheduleDraw();
          },
          () => {
            if (fillPreview) applyFill(src, fillPreview);
            fillPreview = null;
            suppressClick = true;
            scheduleDraw();
          },
        );
      }
      return;
    }

    // 列ヘッダ右端ドラッグで個別列幅をリサイズ
    const colEdge = findColEdgeAtX(lay, x, y);
    if (colEdge !== null) {
      e.preventDefault();
      const startClientX = e.clientX;
      const startWidth = getColWidth(colEdge);
      trackDrag(
        (ev) => {
          const newWidth = Math.max(40, Math.min(800, startWidth + ev.clientX - startClientX));
          colWidthOverrides = new Map(colWidthOverrides).set(colEdge, newWidth);
          renderFilterRow();
          scheduleDraw();
        },
        () => {
          suppressClick = true;
        },
      );
      return;
    }

    // 行ヘッダ下端ドラッグで個別行高さをリサイズ
    const rowEdgeVi = findRowEdgeAtY(lay, x, y);
    if (rowEdgeVi !== null) {
      e.preventDefault();
      const startClientY = e.clientY;
      const startHeight = getRowHeightByVi(lay, rowEdgeVi);
      const targetRow = lay.visibleRows[rowEdgeVi];
      trackDrag(
        (ev) => {
          const newHeight = Math.max(16, Math.min(400, startHeight + ev.clientY - startClientY));
          rowHeightOverrides = new Map(rowHeightOverrides).set(targetRow, newHeight);
          scheduleDraw();
        },
        () => {
          suppressClick = true;
        },
      );
      return;
    }

    const nearRight = showRange && isNearRightEdge(x);
    const nearBottom = showRange && isNearBottomEdge(lay, y);

    let edge: "right" | "bottom" | "corner" | null = null;
    if (nearRight && nearBottom) edge = "corner";
    else if (nearRight && y >= lay.topOffset && y <= lay.topOffset + lay.rowYs[lay.visibleDataRowCount]) edge = "right";
    else if (nearBottom && x >= ROW_NUM_WIDTH && x <= getColX(state.dataRange.cols)) edge = "bottom";

    if (edge) {
      e.preventDefault();
      const dataRange = state.dataRange;
      previewRange = { ...dataRange };
      trackDrag(
        (ev) => {
          const rect = canvas.getBoundingClientRect();
          const mx = ev.clientX - rect.left;
          const my = ev.clientY - rect.top;
          const newCol = getColAtX(mx);
          const vi = getViAtY(lay, my - lay.topOffset);
          const newRow = vi >= 0 && vi < lay.visibleRows.length ? lay.visibleRows[vi] : vi;
          previewRange = {
            rows: edge === "right" ? dataRange.rows : Math.max(MIN_RESIZE_ROWS, Math.min(newRow + 1, GRID_ROWS)),
            cols: edge === "bottom" ? dataRange.cols : Math.max(MIN_RESIZE_COLS, Math.min(newCol + 1, GRID_COLS)),
          };
          scheduleDraw();
        },
        () => {
          if (previewRange) {
            state.setDataRange(previewRange);
          }
          previewRange = null;
          scheduleDraw();
        },
      );
      return;
    }

    // 行の並べ替えドラッグ（行ヘッダ）
    if (x < ROW_NUM_WIDTH && y >= lay.topOffset) {
      const srcVi = getViAtY(lay, y - lay.topOffset);
      const srcRow = srcVi >= 0 && srcVi < lay.visibleRows.length ? lay.visibleRows[srcVi] : -1;
      if (srcRow >= 0 && srcRow < GRID_ROWS) {
        startReorderDrag(e, lay, "row", srcRow);
        return;
      }
    }

    // 列の並べ替えドラッグ（列ヘッダ）
    if (y < lay.topOffset && x >= ROW_NUM_WIDTH) {
      const srcCol = getColAtX(x);
      if (srcCol >= 0 && srcCol < GRID_COLS) {
        startReorderDrag(e, lay, "col", srcCol);
        return;
      }
    }

    // セル範囲のドラッグ選択
    if (y >= lay.topOffset && x >= ROW_NUM_WIDTH) {
      const vi = getViAtY(lay, y - lay.topOffset);
      const startRow = vi >= 0 && vi < lay.visibleRows.length ? lay.visibleRows[vi] : -1;
      const startCol = getColAtX(x);
      if (startRow >= 0 && startCol >= 0) {
        let dragStarted = false;
        trackDrag(
          (ev) => {
            const rect = canvas.getBoundingClientRect();
            const mx = ev.clientX - rect.left;
            const my = ev.clientY - rect.top;
            if (!dragStarted && (Math.abs(mx - x) >= CELL_DRAG_THRESHOLD || Math.abs(my - y) >= CELL_DRAG_THRESHOLD)) {
              dragStarted = true;
            }
            if (dragStarted) {
              const endVi = Math.max(0, Math.min(lay.visibleRows.length - 1, getViAtY(lay, my - lay.topOffset)));
              const endRow = lay.visibleRows[endVi];
              const endCol = Math.max(0, Math.min(GRID_COLS - 1, getColAtX(mx)));
              state.setSelection({ type: "range", startRow, startCol, endRow, endCol });
            }
          },
          () => {
            if (dragStarted) suppressClick = true;
          },
        );
      }
    }
  };

  const onCanvasMouseMove = (e: MouseEvent): void => {
    // カーソル形状の判定のみ。レイアウト変化は必ず drawGrid を経由するため直近描画のキャッシュで足りる。
    const lay = lastLayout ?? computeLayout();
    const { x, y } = getCanvasCoords(e);

    const nearRight = showRange && isNearRightEdge(x);
    const nearBottom = showRange && isNearBottomEdge(lay, y);
    const colEdge = findColEdgeAtX(lay, x, y);
    const rowEdgeVi = findRowEdgeAtY(lay, x, y);

    if (isOnFillHandle(x, y, lay)) {
      canvas.style.cursor = "crosshair";
    } else if (colEdge !== null) {
      canvas.style.cursor = "col-resize";
    } else if (rowEdgeVi !== null) {
      canvas.style.cursor = "row-resize";
    } else if (nearRight && nearBottom) {
      canvas.style.cursor = "nwse-resize";
    } else if (
      nearRight &&
      y >= lay.topOffset &&
      y <= lay.topOffset + (lay.rowYs[Math.min(state.dataRange.rows, lay.rowYs.length - 1)] ?? 0)
    ) {
      canvas.style.cursor = "col-resize";
    } else if (nearBottom && x >= ROW_NUM_WIDTH && x <= getColX(state.dataRange.cols)) {
      canvas.style.cursor = "row-resize";
    } else if (y < lay.topOffset && x >= ROW_NUM_WIDTH) {
      canvas.style.cursor = "grab";
    } else if (x < ROW_NUM_WIDTH && y >= lay.topOffset) {
      canvas.style.cursor = "grab";
    } else {
      canvas.style.cursor = "cell";
    }
  };

  const handleKeyNavigation = (key: string, shiftKey: boolean): void => {
    const selection = state.selection;
    if (!selection) return;

    let row = 0;
    let col = 0;
    if (selection.type === "cell") {
      row = selection.row;
      col = selection.col;
    } else if (selection.type === "range") {
      row = selection.startRow;
      col = selection.startCol;
    } else if (selection.type === "row") {
      row = selection.start;
    } else {
      col = selection.start;
    }

    switch (key) {
      case "ArrowUp":
        row = Math.max(0, row - 1);
        break;
      case "ArrowDown":
      case "Enter":
        row = Math.min(GRID_ROWS - 1, row + 1);
        break;
      case "ArrowLeft":
        col = Math.max(0, col - 1);
        break;
      case "ArrowRight":
        col = Math.min(GRID_COLS - 1, col + 1);
        break;
      case "Tab":
        col = shiftKey ? Math.max(0, col - 1) : Math.min(GRID_COLS - 1, col + 1);
        break;
      default:
        return;
    }

    state.setSelection({ type: "cell", row, col });
    if (editing) cancelEditing();
  };

  // 貼り付け先の起点（選択範囲の左上）。paste-bin の paste イベント or バックストップで使う。
  let pendingPasteAnchor: { minR: number; minC: number } | null = null;
  let pasteHandledByBin = false;

  /** TSV を anchor を起点にセルへ書き込む。CRLF を正規化し末尾の空行は無視する。 */
  const applyPasteTsv = (anchor: { minR: number; minC: number }, text: string): void => {
    if (readOnly || !text) return;
    const lines = parseClipboardTsv(text);
    const g = state.grid;
    const cols = g[0]?.length ?? 0;
    for (let r = 0; r < lines.length; r++) {
      for (let c = 0; c < lines[r].length; c++) {
        const targetRow = anchor.minR + r;
        const targetCol = anchor.minC + c;
        if (targetRow < g.length && targetCol < cols) {
          state.setCellValue(targetRow, targetCol, lines[r][c]);
        }
      }
    }
  };

  // paste-bin に発火したネイティブ paste を捕捉する（外部アプリ・システムクリップボード由来）。
  const onPasteBinPaste = (e: ClipboardEvent): void => {
    if (!pendingPasteAnchor) return;
    e.preventDefault();
    pasteHandledByBin = true;
    const anchor = pendingPasteAnchor;
    pendingPasteAnchor = null;
    // clipboardData が空なら内部バッファ（直近のグリッド内コピー）にフォールバック。
    const text = e.clipboardData?.getData("text/plain") || getInternalClipboard();
    applyPasteTsv(anchor, text);
    pasteBin.value = "";
    canvas.focus();
  };

  const onCanvasKeyDown = (e: KeyboardEvent): void => {
    if (editing) return;
    const { key, shiftKey, ctrlKey, metaKey, altKey } = e;
    const selection = state.selection;
    const grid = state.grid;

    if ((ctrlKey || metaKey) && key === "z") {
      e.preventDefault();
      if (shiftKey) options.onRedo?.();
      else options.onUndo?.();
      return;
    }
    if ((ctrlKey || metaKey) && key === "y") {
      e.preventDefault();
      options.onRedo?.();
      return;
    }

    if ((ctrlKey || metaKey) && selection && (selection.type === "cell" || selection.type === "range")) {
      const anchor =
        selection.type === "cell"
          ? { minR: selection.row, minC: selection.col, maxR: selection.row, maxC: selection.col }
          : {
              minR: Math.min(selection.startRow, selection.endRow),
              minC: Math.min(selection.startCol, selection.endCol),
              maxR: Math.max(selection.startRow, selection.endRow),
              maxC: Math.max(selection.startCol, selection.endCol),
            };

      if (key === "c" || key === "x") {
        e.preventDefault();
        const lines: string[] = [];
        const includeColHeaders = columnHeaders !== undefined && anchor.minR === 0;
        const includeRowHeaders = rowHeaders !== undefined && anchor.minC === 0;
        if (includeColHeaders) {
          const headerRow: string[] = [];
          if (includeRowHeaders) headerRow.push("");
          for (let c = anchor.minC; c <= anchor.maxC; c++) headerRow.push(columnHeaders[c] ?? "");
          lines.push(headerRow.join("\t"));
        }
        for (let r = anchor.minR; r <= anchor.maxR; r++) {
          const cells: string[] = [];
          if (includeRowHeaders) cells.push(rowHeaders[r] ?? "");
          for (let c = anchor.minC; c <= anchor.maxC; c++) cells.push(grid[r]?.[c] ?? "");
          lines.push(cells.join("\t"));
        }
        // navigator.clipboard が使えない環境（VS Code webview 等）でも、内部バッファ +
        // execCommand フォールバックでコピーを成立させる（writeTsvToClipboard 内で吸収）。
        void writeTsvToClipboard(lines.join("\n"));
        if (key === "x" && !readOnly) {
          for (let r = anchor.minR; r <= anchor.maxR; r++) {
            for (let c = anchor.minC; c <= anchor.maxC; c++) {
              state.setCellValue(r, c, "");
            }
          }
        }
        return;
      }
      if (key === "v") {
        if (readOnly) return;
        // 外部アプリ（Excel 等）からの貼り付けを捕捉するため paste-bin へフォーカスを移し、
        // ネイティブ paste イベント（clipboardData）を待つ。preventDefault しない（paste を発火させる）。
        pendingPasteAnchor = { minR: anchor.minR, minC: anchor.minC };
        pasteHandledByBin = false;
        pasteBin.value = "";
        pasteBin.focus();
        // バックストップ: paste イベントが発火しない環境では、システムクリップボード読取 →
        // 内部バッファ（VS Code webview 等で readText 不可時）で代替する。
        setTimeout(() => {
          if (destroyed || pasteHandledByBin || !pendingPasteAnchor) return;
          const anchorTarget = pendingPasteAnchor;
          pendingPasteAnchor = null;
          void readTsvFromClipboard().then((text) => {
            applyPasteTsv(anchorTarget, text);
            canvas.focus();
          });
        }, 0);
        return;
      }
    }

    if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight" || key === "Tab") {
      e.preventDefault();
      handleKeyNavigation(key, shiftKey);
      return;
    }

    if (key === "Enter" || key === "F2") {
      e.preventDefault();
      if (selection?.type === "cell") startEditing(selection.row, selection.col);
      return;
    }

    if (key === "Delete" || key === "Backspace") {
      if (readOnly) return;
      e.preventDefault();
      if (selection?.type === "cell") {
        state.setCellValue(selection.row, selection.col, "");
      } else if (selection?.type === "range") {
        const minR = Math.min(selection.startRow, selection.endRow);
        const maxR = Math.max(selection.startRow, selection.endRow);
        const minC = Math.min(selection.startCol, selection.endCol);
        const maxC = Math.max(selection.startCol, selection.endCol);
        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            state.setCellValue(r, c, "");
          }
        }
      }
      return;
    }

    if (key.length === 1 && !ctrlKey && !metaKey && !altKey) {
      e.preventDefault();
      if (selection?.type === "cell") {
        startEditingWithChar(selection.row, selection.col, key);
      }
    }
  };

  const onInputKeyDown = (e: KeyboardEvent): void => {
    const { key, shiftKey } = e;
    if (key === "Enter") {
      e.preventDefault();
      commitEditing(input.value);
      handleKeyNavigation("Enter", false);
      canvas.focus();
      return;
    }
    if (key === "Tab") {
      e.preventDefault();
      commitEditing(input.value);
      handleKeyNavigation("Tab", shiftKey);
      canvas.focus();
      return;
    }
    if (key === "Escape") {
      e.preventDefault();
      cancelEditing();
      canvas.focus();
    }
  };

  const onInputBlur = (): void => {
    if (editing) commitEditing(input.value);
  };

  canvas.addEventListener("click", onCanvasClick);
  canvas.addEventListener("dblclick", onCanvasDoubleClick);
  canvas.addEventListener("contextmenu", onCanvasContextMenu);
  canvas.addEventListener("mousedown", onCanvasMouseDown);
  canvas.addEventListener("mousemove", onCanvasMouseMove);
  canvas.addEventListener("keydown", onCanvasKeyDown);
  pasteBin.addEventListener("paste", onPasteBinPaste);
  input.addEventListener("keydown", onInputKeyDown);
  input.addEventListener("blur", onInputBlur);

  const onScroll = (): void => scheduleDraw();
  scrollEl.addEventListener("scroll", onScroll, { passive: true });

  /* ---------------------------------------------------------------- */
  /*  adapter 同期（mount 時 + subscribe）                              */
  /* ---------------------------------------------------------------- */

  const syncFromAdapter = (): void => {
    const snap = adapter.getSnapshot();
    state.initGrid(snap.cells.map((r) => [...r]));
    state.setDataRange({ rows: Math.max(1, snap.range.rows), cols: Math.max(1, snap.range.cols) });
    const fullAligns: CellAlign[][] = Array.from({ length: GRID_ROWS }, (_, r) =>
      Array.from({ length: GRID_COLS }, (_, c) => snap.alignments[r]?.[c] ?? null),
    );
    state.setAlignments(fullAligns);
  };

  // 初期同期は dirty 追跡を有効化する前に行う（mount 直後に dirty=true にならないように）。
  syncFromAdapter();
  initialized = true;

  const unsubscribe = adapter.subscribe(() => {
    if (skipSyncCount > 0) {
      skipSyncCount--;
      return;
    }
    // 外部更新による再同期は「未適用の変更」ではないため dirty 追跡を一時停止する。
    initialized = false;
    syncFromAdapter();
    initialized = true;
    if (filterRowVisible) renderFilterRow();
  });

  drawGrid();

  return {
    el: root,
    redraw: drawGrid,
    update(patch) {
      if (patch.isDark !== undefined && patch.isDark !== isDark) {
        isDark = patch.isDark;
        palette = getPalette(isDark);
        applyRootThemeVars();
        applyScrollbarVars();
        applySpreadsheetThemeVars(isDark);
        if (toolbarEl) toolbarEl.style.borderBottom = `1px solid ${getDivider(isDark)}`;
        if (filterRowVisible) renderFilterRow();
        scheduleDraw();
      }
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(rafId);
      unsubscribe();
      closeContextMenu();
      settingsDialog?.close();
      settingsDialog = null;
      for (const cleanup of [...activeDragCleanups]) cleanup();
      for (const dispose of disposers) dispose();
      scrollEl.removeEventListener("scroll", onScroll);
      pasteBin.removeEventListener("paste", onPasteBinPaste);
      root.remove();
    },
  };
}
