# Change Log

All notable changes to the "Anytime Database" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.1.0] - 2026-05-07

### Added

- Initial release. SQLite database browser for VS Code
- Custom Editor for `*.db` / `*.sqlite` / `*.sqlite3` / `*.db3` files
- Activity Bar `Anytime Database` panel with SQLite / Supabase / PostgreSQL backends, status, last imported timestamp, and Backups tree
- Configuration:
  - `anytimeDatabase.openMode` (readwrite / readonly)
  - `anytimeDatabase.query.maxRows` (default 1000)
  - `anytimeDatabase.query.warnThresholdMs` (default 5000)
- Commands:
  - `anytime-database.syncToSupabase`
  - `anytime-database.reconnectSupabase`
- Per-platform VSIX distribution (linux/darwin/win32 × x64/arm64) for `better-sqlite3` native binary
- Transaction-based save flow (`BEGIN IMMEDIATE` → `COMMIT` / `ROLLBACK`) for read-write mode
- Webview ↔ Extension Host IPC bridge with ready-handshake (init message sent only after webview signals ready)
- l10n bundle (`l10n/bundle.l10n.json` + `l10n/bundle.l10n.ja.json`) for runtime tree-item labels
- `DbLogger` (`Anytime Database` Output channel) with timestamps and `Error.stack` for error logs

### Database Core (database-core / database-viewer)

- Initial release of the SQLite adapter layer (`BetterSqlite3Adapter`, `SqlJsAdapter`, `PaginatedSqlSheetAdapter`) and database UI (`DatabaseEditor`, `ErdView`, `TableTree`, `ResultGrid`, `SqlEditorPanel`). See `packages/database-core/CHANGELOG.md` and `packages/database-viewer/CHANGELOG.md` for details
