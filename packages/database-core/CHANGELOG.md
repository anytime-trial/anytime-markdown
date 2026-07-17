# Changelog

All notable changes to the "database-core" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.3] - 2026-07-17

### Added

- `FileBackupManager`: options for a custom backup suffix and for disabling the failure latch.

### Fixed

- Backups of files 2 GiB or larger no longer fail: copies avoid loading the whole file into memory (Node buffer limit), removing the startup cliff for huge databases.
- Uncompressed backup generations are treated as part of the generation series (retention / pruning correctness).

## [0.3.1] - 2026-06-13

### Changed

- Upgraded to TypeScript 6.0.3 (monorepo-wide build toolchain update).

## [0.3.0] - 2026-06-08

### Changed

- Version bump to keep the database lineage in sync; no functional changes to the adapter layer.

## [0.2.5] - 2026-05-27

### Changed

- SonarCloud mechanical safe fixes. No functional changes.

## [0.2.4] - 2026-05-24

### Security

- Removed double `\s*` in `limitDetection` regex to eliminate polynomial ReDoS

## [0.2.3] - 2026-05-21

### Changed

- Improved unit-test coverage to 99% (each adapter raised to 90%+)

## [0.2.2] - 2026-05-20

### Changed

- Version bump synchronized with `anytime-database` 0.2.2 (no source changes in `database-core`)

## [0.2.1] - 2026-05-17

### Changed

- Version bump synchronized with `anytime-database` 0.2.1 (no source changes in `database-core`)

## [0.2.0] - 2026-05-16

### Added

- `FileBackupManager` extracted from `trail-db` into `database-core` for shared rolling backup handling

### Security

- Hardened regex literals against polynomial backtracking (ReDoS)

## [0.1.0] - 2026-05-07

### Added

- Initial release. SQLite database adapter layer for VS Code extension and web app
- `DatabaseAdapter` interface with `listSchema`, `selectRows`, `countRows`, `executeSql`, `save`, `revert`, `dispose`
- `BetterSqlite3Adapter` for VS Code Extension Host (Node, with `nativeBinding` direct-path resolution)
- `SqlJsAdapter` for web app (WASM, sql.js)
- `RemoteDatabaseAdapter` for VS Code WebView ↔ Extension Host bridging
- `PaginatedSqlSheetAdapter` (paginated query layer with `applyQueryResult`, `loadPage`)
- Schema introspection (tables, views, columns, foreign keys including composite FKs)
- Identifier validation via `assertSafeIdentifier`
- SQL mutation detection via `isMutationSql`
- Top-level `LIMIT` detection via `hasTopLevelLimit`
- ER diagram FK inference

### Fixed

- Composite primary key columns beyond the first now correctly reported as PK (`pk > 0`)
