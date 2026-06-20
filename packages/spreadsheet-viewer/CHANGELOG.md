# Changelog

All notable changes to the "spreadsheet-viewer" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.8.0] - 2026-06-20

### Added

- Implemented undo/redo history for the grid (snapshot-based, up to 100 entries; `transact` groups multiple mutations into one unit) and wired Ctrl+Z / Ctrl+Y to the internal history.
- Added a fill handle at the bottom-right corner of the selection; dragging fills a range automatically (numeric +1, trailing-digit increment, arithmetic progression, cyclic). Added the `computeFillValues` pure function for fill-series generation.
- Added chart creation from a selected range (outputs an `anytime-chart` fence via the charts channel).

### Fixed

- Fixed copy/paste being silently swallowed in VS Code webview contexts by adding an `execCommand` fallback, an internal clipboard buffer, and a paste-bin approach for pasting from external apps.
- Fixed the context menu appearing behind the edit dialog due to a z-index stacking issue.
- Included row-height / column-width resize operations in the undo/redo history; added `liveSync` so cell edits propagate to the adapter immediately (live chart preview). Addressed pre-merge review findings: phantom undo entries (deferred snapshot + equality guard), resize-undo dirty-flag asymmetry, and z-index band alignment.

## [0.7.0] - 2026-06-13

### Added

- Added the `anytime-spreadsheet` Web Component for React-free embedding.

## [0.6.1] - 2026-06-13

### Changed

- Upgraded to TypeScript 6.0.3 (monorepo-wide build toolchain update).

## [0.6.0] - 2026-06-12

### Changed

- **Fully converted the spreadsheet viewer to a React-free vanilla implementation.** Added `createSpreadsheetT`, a vanilla UI factory kit, and vanilla `SpreadsheetGrid` / `ContextMenu` to replace the React implementation.

### Removed

- Removed the React spreadsheet implementation and dropped `react` / `react-dom` / `next-intl` from peer dependencies.

## [0.5.0] - 2026-06-08

### Changed

- Removed all `@mui` usage; introduced an in-house `ui/` kit with runtime style injection and replaced the entire UI (MUI reduction Phase 3c).

## [0.4.6] - 2026-05-21

### Changed

- Version bump synchronized with `spreadsheet-core` 0.4.6 (no source changes)

## [0.4.5] - 2026-05-20

### Changed

- Version bump synchronized with anytime-sheet 0.4.5

### Security

- Replaced polynomial-redos trailing-slash regex in `claudeHookSetup` with an O(n) `charCodeAt` scan (CodeQL #818, `vscode-common`)

## [0.4.4] - 2026-05-17

### Changed

- Version bump only (no functional changes since 0.4.3)

## [0.4.3] - 2026-05-15

### Changed

- Migrated to self-contained i18n; external consumers reference messages via the public package API only

## [0.4.2] - 2026-05-08

### Added

- `PaginationBar` component for navigating paginated spreadsheet data
- `showImportExport` and `showToolbar` props to control toolbar visibility

## [0.4.1] - 2026-05-04

### Added

- `getCellDisplayText` prop for custom cell text formatting

## [0.4.0] - 2026-05-03

### Added

- Multi-row and multi-column group header support

### Fixed

- Cell value now rendered after `getCellBackground` is applied
- Vertical border line added to column header row
- Horizontal line at group row boundary in corner cell

## [0.3.0] - 2026-04-23

### Added

- `SheetTabs` component: tab bar for multi-sheet navigation (add / rename / delete sheets)
- `workbookAdapter` prop on `SpreadsheetEditor` for multi-sheet document support
- i18n keys for sheet tab operations: `addSheet`, `deleteSheet`, `renameSheet`, `sheetName`
- `showHeaderRow` prop on `SpreadsheetGrid` (enabled by default only in `TableNodeView`)
- `showToolbar` prop on `SpreadsheetEditor` (enabled by default only for markdown table editor)
- `headerRight` slot prop on `SpreadsheetEditor` for custom toolbar elements
- Re-exports `parseMarkdownTable` / `serializeMarkdownTable` from `spreadsheet-core`

### Fixed

- Scroll position broken when `display:flex` was added to `SpreadsheetGrid` wrapper

### Changed

- Canvas scrollbar styled to match editor (thin, 6px, theme-aware)
- Sheet viewer colors and layout aligned with design system tokens
- `showRange` defaults to `false`; data range border is opt-in
- `showApply` defaults to `false`; Apply button is opt-in

## [0.2.0] - 2026-04-22

### Added

- `SpreadsheetEditor`: page-level component with CSV/TSV import/export toolbar
- i18n keys: `importCsv`, `exportCsv`, `importTsv`, `exportTsv`, `invalidJson`
- Re-exports `SheetAdapter`, `SheetSnapshot`, `createInMemorySheetAdapter`, `parseCsv`, `serializeCsv` from `spreadsheet-core`

## [0.1.0] - 2026-04-22

### Added

- Initial release, extracted from `markdown-core/src/components/spreadsheet/`
- Migrated `SpreadsheetGrid`, `SpreadsheetContextMenu`, `useSpreadsheetState` to the SheetAdapter-based API (removed `editor: Editor` dependency)
- Viewer-specific i18n files `i18n/ja.json` / `i18n/en.json`
- `getDivider` utility in `styles.ts` mirrored from markdown-core
- MockSheetAdapter test helper at `__tests__/support/createMockAdapter.ts`
