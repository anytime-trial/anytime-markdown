# Changelog

All notable changes to the "database-viewer" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-06-08

### Changed

- Removed all `@mui` usage; introduced an in-house `ui/` kit (tokens, `injectStyles`, primitives, icons) and replaced 5 components (MUI reduction Phase 3d).
- Dropped `@mui` from peer dependencies and removed the MUI `ThemeProvider` test wrapper.

## [0.2.5] - 2026-05-27

### Changed

- SonarCloud code quality improvements: reduced cognitive complexity (S3776), plus S3358 / S6582 / S4325 / S6353 / S7778 fixes. No functional changes.

## [0.2.4] - 2026-05-24

### Changed

- Synchronized with `database-core` 0.2.4 (ReDoS fix in `limitDetection`)

## [0.2.3] - 2026-05-21

### Changed

- Version bump synchronized with `database-core` 0.2.3 (no source changes)

## [0.2.2] - 2026-05-20

### Changed

- Version bump synchronized with `anytime-database` 0.2.2 (no source changes in `database-viewer`)

## [0.2.1] - 2026-05-17

### Changed

- Version bump synchronized with `anytime-database` 0.2.1 (no source changes in `database-viewer`)

## [0.1.0] - 2026-05-15

### Added

- Initial release. React UI components for SQLite database browsing
- `DatabaseEditor` — main editor with tab orchestration (table / query / ERD), folding SQL editor panel, `ResultGrid`, schema view
- `TableTree` — left-pane tree for tables and views with right-click context menu (show schema / show ERD)
- `ResultGrid` — `spreadsheet-viewer` adapter integration with column-name headers and double-click to insert column name into SQL editor
- `SqlEditorPanel` — collapsible SQL editor with run / clear, status bar for last query result, `forwardRef` API for cursor-position text insertion, read-only support
- `ErdView` — ER diagram tab with FK inference (manual + introspected), hierarchical layout via `graph-core`, pan / zoom / minimap, obstacle-aware orthogonal edge routing, anchor diamond markers on referenced column rows, related-table highlight on selection
- i18n keys (ja / en) for `Database` namespace — migrated to self-contained i18n with public package API
- Per-platform compatibility (Node + WASM SQLite via `database-core`)

### Performance

- `anchorSidesByTable` memoized via `useMemo` to avoid recompute on every pan / zoom render
- `ResizeObserver` callback uses functional `setState` with same-value short-circuit to skip no-op re-renders
- `TableTabState` fully readonly; mutations replaced with immutable `setTabs(prev =&gt; prev.map(...))` updates, removing the `forceRender` / `tick()` hack
