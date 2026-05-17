# Changelog

All notable changes to the "anytime-sheet" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.4.4] - 2026-05-17

### Changed

- Version bump only (no functional changes since 0.4.3)

### Spreadsheet Core (spreadsheet-core)

- バージョン同期のみ (機能変更なし)

### Spreadsheet Viewer (spreadsheet-viewer)

- バージョン同期のみ (機能変更なし)

## [0.4.3] - 2026-05-15

### Spreadsheet Core (spreadsheet-core)

- Test coverage added for CRLF / CR and separator-less markdown table cases

### Spreadsheet Viewer (spreadsheet-viewer)

- Migrated to self-contained i18n; external consumers reference messages via the public package API only

## [0.4.2] - 2026-05-08

### Spreadsheet Core (spreadsheet-core)

- `SheetAdapter.getPageCount` method added for pagination support

### Spreadsheet Viewer (spreadsheet-viewer)

- `PaginationBar` component for navigating paginated spreadsheet data
- `showImportExport` and `showToolbar` props to control toolbar visibility

## [0.4.1] - 2026-05-04

### Changed

- Minor maintenance and dependency updates

## [0.4.0] - 2026-05-03

### Spreadsheet Core (spreadsheet-core)

- `columnHeaders`, `rowHeaders`, `rotateColumnHeaders`, `cellSize` props added
- DSM cell coloring and top-left corner click to select all
- Copy includes column/row header labels

### Spreadsheet Viewer (spreadsheet-viewer)

- Multi-row/column group header support
- Fixed cell rendering after `getCellBackground`, border lines in headers

## [0.3.0] - 2026-04-23

### Added

- Initial release: custom editor for `.sheet`, `.csv`, and `.tsv` files
- `VSCodeWorkbookAdapter`: VS Code–backed `WorkbookAdapter` with persistent multi-sheet workbook support for `.sheet` files
- `SheetEditorProvider`: custom editor provider using workbook format for `.sheet` files; plain adapter for `.csv` / `.tsv` files
- Multi-sheet navigation via `SheetTabs` (add / rename / delete sheets in `.sheet` files)
