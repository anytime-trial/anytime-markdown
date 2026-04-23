# Changelog

All notable changes to the "anytime-sheet" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.3.0] - 2026-04-23

### Added

- Initial release: custom editor for `.sheet`, `.csv`, and `.tsv` files
- `VSCodeWorkbookAdapter`: VS Code–backed `WorkbookAdapter` with persistent multi-sheet workbook support for `.sheet` files
- `SheetEditorProvider`: custom editor provider using workbook format for `.sheet` files; plain adapter for `.csv` / `.tsv` files
- Multi-sheet navigation via `SheetTabs` (add / rename / delete sheets in `.sheet` files)
