# Changelog

All notable changes to the "spreadsheet-core" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.4.2] - 2026-05-08

### Added

- `SheetAdapter.getPageCount` method for pagination support

## [0.4.1] - 2026-05-04

### Added

- `getCellDisplayText` prop for custom cell text formatting

## [0.4.0] - 2026-05-03

### Added

- `columnHeaders` prop for custom column header labels
- `rowHeaders` / `rowHeaderWidth` props for row label display
- `rotateColumnHeaders` prop for 90° vertical column header display
- `cellSize` prop for square cell initialization
- DSM cell background coloring support
- Top-left corner click to select all cells
- Copy includes `columnHeaders` / `rowHeaders` as labels

## [0.3.0] - 2026-04-23

### Added

- `WorkbookAdapter` interface: multi-sheet abstraction (`getSheets` / `getActiveSheetIndex` / `setActiveSheet` / `subscribe`)
- `InMemoryWorkbookAdapter`: in-memory implementation of `WorkbookAdapter`
- `SheetData` and `WorkbookSnapshot` types for multi-sheet document representation
- `parseMarkdownTable` / `serializeMarkdownTable`: round-trip conversion between Markdown GFM tables and `SheetSnapshot`
- Exported markdown utils (`parseMarkdownTable`, `serializeMarkdownTable`) from package index

### Fixed

- `parseMarkdownTable`: use GFM-compliant separator row detection (colon-only cells treated as alignment markers)

### Changed

- `showApply` and `showRange` props default to `false`; must be explicitly enabled

## [0.2.0] - 2026-04-22

### Added

- `InMemorySheetAdapter`: in-memory implementation of `SheetAdapter` for testing and standalone use
- `parseCsv` / `serializeCsv`: RFC 4180 compliant CSV/TSV parser and serializer

## [0.1.0] - 2026-04-22

### Added

- Initial release, extracted from `markdown-core/src/components/spreadsheet/`
- Type definitions: `CellAlign`, `DataRange`, `SheetSnapshot`, `SpreadsheetSelection`, `ColumnFilterState`, `CellEditState`, `ContextMenuState`
- `SheetAdapter` interface (`getSnapshot` / `subscribe` / `setCell` / `replaceAll` / `readOnly`)
- Grid utilities `gridUtils` (`columnLabel` / `createEmptyGrid` / `isInDataRange` / `DEFAULT_GRID_ROWS` / `DEFAULT_GRID_COLS`)
