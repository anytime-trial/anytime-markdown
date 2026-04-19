# Change Log

All notable changes to the "Anytime Trail" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.8.0] - 2026-04-19

### Added

- Token budget monitoring with real-time indicator in the tab bar
- Auto-setup all Claude Code hooks (PostToolUse, Stop, etc.) on extension activate
- Session ID copy button in session list and analytics panel
- Error count column in analytics session table and session list
- Sub-agent count display in session list
- `TrailDataServer` for serving trail data over HTTP to the viewer
- `JsonlSessionReader`, `GitStateService`, `MetricsThresholdsLoader`, `SqliteSessionRepository` implementations
- Quality metrics SQL queries, REST endpoint, and reader implementations for DORA metrics

### Trail Core (trail-core)

- DORA 4 metrics: deployment frequency, lead time for changes, prompt-to-commit success rate, change failure rate
- `computeQualityMetrics` orchestrator and `getQualityMetrics` port
- `BackfillMessageCommits` use case for retroactive message-commit linking

## [0.7.0] - 2026-04-18

### Added

- Add Note treeview (moved from vscode-markdown-extension)

### Changed

- Split `storagePath` into `database.storagePath` and `claudeStatus.directory`
- Migrate `ClaudeStatusWatcher` to `vscode-common`

### Fixed

- Clear `sessionEdits` and `plannedEdits` from status file on reset

### Trail Core (trail-core)

- Introduce `trail_daily_counts` replacing `trail_daily_costs`
- Filter sync to `anytime-markdown` repository only
- Fix parameterized query in `getAllMessageToolCalls`

## [0.6.0] - 2026-04-13

### Added

- Dashboard panel with Trail Viewer button for quick access
- i18n keys for dashboard panel labels
- Log C4 analysis and trail import steps with repository name

### Changed

- Rename "Import JSONL Logs" to "Refresh Trail Data" with refresh icon
- Rename "Analyze Workspace" to "Analyze Code" with `symbol-class` icon (broader VS Code compatibility)
- Remove `c4Export` and `c4Import` commands
- Remove Trail Viewer icon from database panel

### Fixed

- Surface all repositories in C4 panel repository selector
- Persist `trail_graphs` migration result to disk

### Trail Core (trail-core)

- Introduce `IC4ModelStore` port and `fetchC4Model` service
- Replace remote sync with full wipe-and-reload strategy
- Split `trail_graphs` into `current_graphs` / `release_graphs`
- Fix `daily_costs` JST boundary aggregation and silent sync errors

## [0.5.3] - 2026-04-12

### Trail Core (trail-core)

- Fix `.gitignore` pattern that inadvertently excluded `src/c4/coverage/` source files from version control, causing CI build failure

## [0.5.2] - 2026-04-12

### Added

- `analyzeReleases`: git worktree-based release file and feature analysis
- `release_files` and `release_features` sync replacing task sync
- `/api/trail/releases` endpoint
- `resolveReleases` for release tag resolution
- `saveTrailGraph` / `getTrailGraph` DB methods
- `getTrailGraphIds` for trail graph ID listing
- `releasesAnalyzed` count in import result message

### Changed

- Removed C4 model sync from `SyncService`; C4 data now served from DB via `trail-viewer`
- Replaced `saveC4Model` call in `C4Panel` with `getTrailGraphIds`

### Fixed

- Cleanup stale worktree before `git worktree add` in `analyzeReleases`
- `releasesAnalyzed` added to early return path in `importAll`

### Trail Core (trail-core)

- Domain layer (model, schema, engine, port, reader, usecase) added
- `releases`, `release_files`, `release_features`, `trail_graphs`, `release_coverage` tables added
- `session_costs`/`daily_costs` tables added; import performance improved with batch processing

## [0.5.1] - 2026-04-11

### Added

- Memory treeview with `AiMemoryProvider` for Claude memory file management
- Memory commands and NLS labels

### Changed

- Trail icon updated (camel_trail.png)
- Dashboard changed to 2-tier hierarchy
- DB date/time unified to UTC ISO 8601 format
- Cost classification columns added; classify on import
- Last import/sync display in local timezone format

### Removed

- Git features (Changes, Graph, Timeline, SpecDocs panels) extracted to Anytime Git extension

### Fixed

- Migration failure error logging added
- syncToSupabase command implementation and sync error logging
- Multiple bugs in Trail Viewer import and display

### Trail Core (trail-core)

- `formatDate` utility for locale-aware date formatting
- Date/time display unified to local timezone

## [0.5.0] - 2026-04-09

### Added

- Remote sync command and VS Code settings for Supabase connection
- Supabase CSP configuration

### Trail Core (trail-core)

- Remote DB sync layer (SQLite → Supabase/PostgreSQL)
- Session commit stats and commit resolution queries
- Analytics fields: `totalFilesChanged`, `totalAiAssistedCommits`, `totalSessionDurationMs`

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
