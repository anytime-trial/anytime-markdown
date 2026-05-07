# Changelog

All notable changes to the "database-core" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
