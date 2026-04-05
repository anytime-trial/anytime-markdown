# Change Log

All notable changes to the "Anytime Trail" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.2.0] - 2026-04-05

### Added

- Auto-start server on C4 analyze with user confirmation
- Shared TrailLogger utility
- C4DataServer with HTTP and WebSocket
- Standalone viewer (React entry point + webpack config)
- Open standalone viewer in browser after import/analyze
- C4 model persistence and auto-load
- Tab bar for C4 Model and DSM views
- DSM canvas renderer with hit testing
- DSM commands and menu items

### Fixed

- Register empty tree view for c4Elements panel
- Send current data to new WebSocket clients on connection
- Open browser only on first import/analyze, not repeatedly
- Treat boundaries as optional in model endpoint and message

### Changed

- Remove VS Code webview, use standalone viewer only
- Extract command registrations into separate modules
- Split ChangesProvider and SpecDocsProvider into focused modules
- Replace empty catch blocks with TrailLogger output
- Replace non-null assertions with guard clauses

### Security

- Add CORS headers, WS origin check, and message type guard

### Tests

- Set up Jest infrastructure and add GitStatusParser tests
- Add C4DataServer type guard tests

### Trail Core (trail-core)

- CLI --help and parseArgs export
- EdgeExtractor O(1) lookup improvement
- ReDoS prevention

## [0.1.0] - 2026-04-04

### Added

- C4 architecture diagram viewer panel with Mermaid C4 parsing and graph-core rendering
- C4 model JSON export and Mermaid dependency export
- Highlight changed files on git graph commit select
- Open file on node click in C4 viewer
- Auto-open git repos and C4 level toggle

### Fixed

- Use .mmd extension for Mermaid export
- Exclude .vscode-test and .worktrees from C4 tsconfig list
- Increase tsconfig.json search limit to 50 for C4 analyze
- Pass deltaY directly to zoom function in C4 viewers
- Prevent webview scroll capture for C4 wheel zoom
- Bundle typescript in extension to resolve module not found

## [0.0.3] - 2026-04-01

### Fixed

- Prefix unused isDoubleClick variable in changes panel

## [0.0.2] - 2026-03-29

### Changed
- Updated extension icon image

## [0.0.1] - 2026-03-27

Initial release. Git treeview features extracted from Anytime Markdown extension.

### Added

**Repository**
- Open folders and clone repositories
- Multi-root repository support with simultaneous display
- Branch switch from context menu
- File CRUD, drag-and-drop, cut/copy/paste
- Markdown-only file filter toggle

**Changes**
- Staged / unstaged changes view per repository
- Stage, unstage, discard individual files
- Stage all, unstage all, discard all batch operations
- Commit with message dialog
- Push and sync (pull + push)
- Change count badge on sidebar
- Auto-refresh on file changes (debounced)

**Graph**
- ASCII commit graph with `git log --graph`
- Local / remote commit color indicators (blue / red)
- Branch and tag decorations
- Custom SVG icons for HEAD, branches, and commits

**Timeline**
- Per-file commit history (VS Code Git API + git command fallback)
- Compare any commit with the working copy

**Integration**
- Markdown compare mode via Anytime Markdown (optional, command-based interop)
- Fallback to VS Code standard diff editor when Anytime Markdown is not installed
- `execFileSync` for all git commands (command injection prevention)
- `--` separator for git file path arguments
