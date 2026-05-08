# Changelog

All notable changes to the "database-viewer" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-05-07

### Added

- Initial release. React UI components for SQLite database browsing
- `DatabaseEditor` — main editor with tab orchestration (table / query / ERD), folding SQL editor panel, `ResultGrid`, schema view
- `TableTree` — left-pane tree for tables and views with right-click context menu (show schema / show ERD)
- `ResultGrid` — `spreadsheet-viewer` adapter integration with column-name headers and double-click to insert column name into SQL editor
- `SqlEditorPanel` — collapsible SQL editor with run / clear, status bar for last query result, `forwardRef` API for cursor-position text insertion, read-only support
- `ErdView` — ER diagram tab with FK inference (manual + introspected), hierarchical layout via `graph-core`, pan / zoom / minimap, obstacle-aware orthogonal edge routing, anchor diamond markers on referenced column rows, related-table highlight on selection
- i18n keys (ja / en) for `Database` namespace
- Per-platform compatibility (Node + WASM SQLite via `database-core`)

### Performance

- `anchorSidesByTable` memoized via `useMemo` to avoid recompute on every pan / zoom render
- `ResizeObserver` callback uses functional `setState` with same-value short-circuit to skip no-op re-renders
- `TableTabState` fully readonly; mutations replaced with immutable `setTabs(prev =&gt; prev.map(...))` updates, removing the `forceRender` / `tick()` hack
