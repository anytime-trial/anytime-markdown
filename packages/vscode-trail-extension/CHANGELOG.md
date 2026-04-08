# Change Log

All notable changes to the "Anytime Trail" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.4.0] - 2026-04-08

### Added

- SQLite database for trail data storage (sql.js with sql-asm.js)
- Dashboard panel with manual JSONL import button
- Progress notification during JSONL import
- Prompts tab with skills and settings.json display
- Analytics tab with cost estimation and tool usage statistics
- Prompts API endpoint for prompt file loading

### Changed

- Viewer/import buttons moved to Dashboard title bar

### Fixed

- Recursive scan for JSONL files including subagent sessions
- Session row snake_case to camelCase conversion
- FTS5 removed in favor of LIKE search for compatibility
- sql.js loading via `__non_webpack_require__` from dist/
- TrailDatabase init runs in background to avoid blocking activation
- Filter dropdowns retain all branches/models
- `searchSessions` called on filter change

### Trail Core (trail-core)

- Version sync only (no code changes)

## [0.3.0] - 2026-04-07

### Added

- Coverage file watching with debounced monitoring (`CoverageWatcher`)
- Coverage snapshot history persistence (`CoverageHistory`)
- Coverage loading, history, and diff integration in C4 Panel
- C4 tree provider with C1-C4 level nodes
- C4 viewer in root node context menu
- Context menus and test command settings for C4 tree
- `runE2eTest` and `runCoverageTest` commands
- Auto-install Claude Code skills on activation
- L1 editing UI for standalone C4 viewer
- Manual element merge and editing handlers
- System boundary for monorepo analysis
- Analysis progress overlay
- Marquee selection and node click/double-click in C4 graph

### Changed

- C4 toolbar icons moved to context menu

### Fixed

- Set `projectRoot` on `restoreSavedModel` for coverage loading
- Watch directory instead of file for coverage detection
- tsconfig.json picker for workspace analysis
- Always open viewer on analyze command

### Trail Core (trail-core)

- Added `--format c4` option for CLI output

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
