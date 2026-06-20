export { mountSpreadsheetGrid } from "./vanilla/spreadsheetGrid";
export type { SpreadsheetGridHandle, SpreadsheetGridOptions } from "./vanilla/spreadsheetGrid";
export { mountSpreadsheetEditor } from "./vanilla/spreadsheetEditor";
export type {
  SpreadsheetEditorHandle,
  SpreadsheetEditorOptions,
  SpreadsheetEditorUpdatePatch,
  ChartDefinition,
} from "./vanilla/spreadsheetEditor";
export { createPaginationBar } from "./vanilla/paginationBar";
export type { PaginationBarHandle, PaginationProps } from "./vanilla/paginationBar";
export { createSheetTabs } from "./vanilla/sheetTabs";
export type { SheetTabsCallbacks, SheetTabsHandle } from "./vanilla/sheetTabs";
export { openSpreadsheetContextMenu } from "./vanilla/contextMenu";
export type {
  SpreadsheetContextMenuCallbacks,
  SpreadsheetContextMenuHandle,
} from "./vanilla/contextMenu";

export { createSpreadsheetT } from "./i18n/createSpreadsheetT";
export type { SpreadsheetNamespace, SpreadsheetT } from "./i18n/createSpreadsheetT";
export { enMessages as spreadsheetViewerEnMessages, jaMessages as spreadsheetViewerJaMessages } from "./i18n";
export type { SpreadsheetViewerMessages } from "./i18n";

export { getDivider } from "./ui/tokens";
export type { SpreadsheetPalette, SpreadsheetThemeMode } from "./ui/tokens";

export type { SheetAdapter, SheetSnapshot } from "@anytime-markdown/spreadsheet-core";
export { createInMemorySheetAdapter, parseCsv, serializeCsv, parseMarkdownTable, serializeMarkdownTable } from "@anytime-markdown/spreadsheet-core";
export type { CellAlign, SheetData, WorkbookAdapter, WorkbookSnapshot } from "@anytime-markdown/spreadsheet-core";
export { createInMemoryWorkbookAdapter } from "@anytime-markdown/spreadsheet-core";

// Web Component（クラスのみ。customElements.define の副作用は "./element" 側に置く）
export { AnytimeSpreadsheetElement } from "./AnytimeSpreadsheetElement";
export type { SpreadsheetChangeDetail } from "./AnytimeSpreadsheetElement";
