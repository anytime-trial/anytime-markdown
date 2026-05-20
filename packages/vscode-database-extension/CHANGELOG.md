# Change Log

All notable changes to the "Anytime Database" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.2.2] - 2026-05-20

### Security

- Validate `postMessage` data shape in `makeTransport` before dispatching to listeners: added `typeof === 'object'` and `typeof type === 'string'` guards to fix `InsufficientPostmessageValidation` (SnykCode)

### Database Core (database-core / database-viewer)

- Version bump only (no source changes)

## [0.2.1] - 2026-05-17

### Added

- Bundled MIT `LICENSE` file in the VSIX. `package.json` already declared `"license": "MIT"`, but the file itself was missing from the published extension

### Database Core (database-core / database-viewer)

- Version bump only (no source changes)

## [0.2.0] - 2026-05-16

### Added

- `anytime-database.uploadBackupToS3` command to upload the latest `.bak.1.gz` from the TreeView to AWS S3
- Settings `anytimeDatabase.s3.bucket` / `s3.region` / `s3.prefix` / `s3.accessKeyId` / `s3.secretAccessKey`
- All workspace DB files are now listed under the SQLite tree node

### Changed

- Backup UI moved from `vscode-trail-extension` to `vscode-database-extension`
- Split `BackupTreeItem` `contextValue` to enable command targeting per backup type

### Security

- Hardened regex literals against polynomial backtracking (ReDoS)
- 4 webview message listeners now verify message origin before handling events

### Database Core (database-core)

- `FileBackupManager` extracted from `trail-db` into `database-core` for shared rolling backup handling

## [0.1.0] - 2026-05-15

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

### Changed

- Removed `sql.js` from the extension bundle and rely on native `better-sqlite3` only (Phase 4)
- `database-viewer` migrated to self-contained i18n; webview shim updated accordingly

### Fixed

- Avoided `navigator` access and broken dynamic import resolution in the webview bundle

### Database Core (database-core / database-viewer)

- Initial release of the SQLite adapter layer (`BetterSqlite3Adapter`, `SqlJsAdapter`, `PaginatedSqlSheetAdapter`) and database UI (`DatabaseEditor`, `ErdView`, `TableTree`, `ResultGrid`, `SqlEditorPanel`). See `packages/database-core/CHANGELOG.md` and `packages/database-viewer/CHANGELOG.md` for details
- `database-viewer` migrated to self-contained i18n with public package API
