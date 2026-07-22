# Change Log

All notable changes to the "Anytime Database" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.3.4] - 2026-07-22

### Fixed

- Bundles an `@anytime-markdown/trail-db` fix for Codex session `messages` disappearing: the Codex import path derived `messages.uuid` as `codex-${seq}` with `seq` reset per session, and because `messages.uuid` is a cross-session PRIMARY KEY written via `INSERT OR REPLACE`, a later-imported session silently overwrote an earlier session's rows (only 23 of 243 Codex sessions had retained their `messages`, so Codex bars were missing from the trail-viewer agent tab). uuid derivation now includes the session ID, and a migration removes the stale rows.
- A follow-up fix from pre-merge review corrected two related gaps in the same change: the row-removal migration was not also deleting dependent `message_tool_calls` rows (foreign keys are disabled, so orphans accumulated silently and re-import could double-count tool calls), and the two code paths that derive Codex uuids (import vs. commit backfill) disagreed on `seq` progression for rollouts containing `event_msg` records.

### Database Core (database-core / database-viewer)

- No functional changes (dependency update only).

## [0.3.3] - 2026-07-17

### Database Core (database-core / database-viewer)

- `FileBackupManager` handles files of 2 GiB or larger without loading them wholly into memory, and treats uncompressed generations as part of the generation series. New options for the backup suffix and for disabling the failure latch.

## [0.3.2] - 2026-07-14

### Fixed

- Timestamps shown by the extension are rendered in the local timezone. The Extension Host runs with `TZ=UTC` on WSL, so `Date`'s local getters were returning UTC values.

## [0.3.1] - 2026-06-13

### Changed

- Upgraded to TypeScript 6.0.3 (monorepo-wide build toolchain update).

## [0.3.0] - 2026-06-08

### Changed

- Removed the redundant MUI wrapper now that `database-viewer` is self-themed.

### Fixed

- Bundle `better-sqlite3` built for the VS Code Node 24 target (Node 24 ABI) and limit `prepare-native` reuse to matching targets.

### Database Core (database-core / database-viewer)

- `database-viewer` fully dropped `@mui` in favor of an in-house `ui/` kit (MUI reduction Phase 3d).

## [0.2.5] - 2026-05-27

### Database Core (database-core / database-viewer)

- SonarCloud code quality improvements (reduced cognitive complexity, mechanical safe fixes).

## [0.2.4] - 2026-05-24

### Changed

- Migrated `storagePath` / `docsPath` settings from the trail VS Code extension to this extension

### Database Core (database-core / database-viewer)

- `database-core`: removed polynomial ReDoS from `limitDetection` regex (double `\s*`)

## [0.2.3] - 2026-05-21

### Changed

- Version bump synchronized with `database-core` / `database-viewer` 0.2.3 (no extension-specific source changes)

### Database Core (database-core / database-viewer)

- `database-core`: improved unit-test coverage to 99% (each adapter to 90%+)

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
