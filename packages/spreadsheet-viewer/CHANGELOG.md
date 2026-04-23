# Changelog

All notable changes to the "spreadsheet-viewer" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
