# Changelog

All notable changes to the "spreadsheet-viewer" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-04-22

### Added

- Initial release, extracted from `markdown-core/src/components/spreadsheet/`
- Migrated `SpreadsheetGrid`, `SpreadsheetContextMenu`, `useSpreadsheetState` to the SheetAdapter-based API (removed `editor: Editor` dependency)
- Viewer-specific i18n files `i18n/ja.json` / `i18n/en.json`
- `getDivider` utility in `styles.ts` mirrored from markdown-core
- MockSheetAdapter test helper at `__tests__/support/createMockAdapter.ts`
