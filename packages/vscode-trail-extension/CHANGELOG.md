# Change Log

All notable changes to the "Anytime Trail" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed

- `.trail/analyze-exclude` is now interpreted as `.gitignore`-compatible. The `**/<pattern>/**` auto-wrap in `AnalyzePipeline` is removed so users can write `!` negation and `/dist`-style root-anchored patterns directly. `GraphDetector` now also accepts an `ignore` instance
- `computeAndPersistImportance` now also receives the `analyze-exclude` `Ignore` and applies it to every SourceFile picked up by the TypeScript compiler. Patterns like `__tests__/` or `*.test.ts` in `analyze-exclude` finally also propagate to importance analysis (and thus `current_file_analysis` / `current_function_analysis`) consistently

## [0.17.0] - 2026-05-06

### Added

- Configurable backup interval via `backupIntervalDays`
- Commit import from repos listed in `anytime-history.json`
- Dead code persistence integrated into the analyze pipeline
- `/api/c4/file-analysis` and `/api/c4/function-analysis` REST endpoints
- `mcp-trail` MCP server: `TRAIL_WORKSPACE_PATH` propagation, `better-sqlite3` externalized in bundle
- `perf-report` measurement path (Phase B-1)

### Fixed

- Manual elements merged into the C4 model even when `C4Provider` is unavailable
- `analyzeExclude`: silent catch / TOCTOU / first-time exclusion miss / broken export reference
- Repo-aware commit activity indexing
- `tsc --noEmit` errors reduced from 37 to 9

### Changed

- Skill install destination moved from `~/.claude/` to `<workspace>/.claude/`
- Bundled `anytime-reverse-engineer` skill now documents how to register `mcp-trail`
- `mcp-trail` bundle externals switched to `sql.js`
- File analysis importance is persisted to the DB instead of pushed via WebSocket

### Performance

- `webpack-bundle-analyzer` introduced for the extension bundle
- SQL/perf instrumentation foundation for trail-db

### Trail Core (trail-core)

- Dead code detection (`DeadCodeSignals`, `computeDeadCodeScore`, `parseDeadCodeIgnore`)
- Cyclomatic complexity in TypeScriptAdapter; `file_analysis` / `function_analysis` tables
- `.trail/analyze-exclude` for analysis filter externalization
- `dead-code-score` MetricOverlay with color mapping
- Size metrics overlay (LOC / Files / Functions) for the C4 viewer
- WSL UTC timezone fix; renamed complexity metric overlays
- `SERVICE_CATALOG` isolated; mcp-trail bundle reduced 86%; `zod` deduped at 4.3.6
- Removed unused `release_features` / `imported_files` / `c4_models` tables

## [0.16.0] - 2026-05-04

### Added

- Agent Mapping TreeView showing Claude sessions grouped by git worktree
- Context token usage, Today summary, and filter icon in Agent Mapping panel
- AI session title display in Session TreeView
- Automatically open Trail Viewer after `analyzeCurrentCode`
- Bundle anytime-reverse-engineer skill and auto-install on activate
- `/api/c4/sequence` endpoint for C4 sequence display
- Release filter support for `/api/c4/coverage` and `/api/code-graph`
- Docs repository auto-generation from `docsPath` setting

### Fixed

- Stale session filtering at both worktree and session level
- C4 importance score display and transmission to Trail Viewer
- Code graph repo label derived from path basename

### Changed

- Commands unified to `analyze` verb: `analyzeCurrentCode`, `analyzeAll`
- AI Note command IDs unified to `AiNote` prefix; labels unified to "AI Note"
- Configuration keys reorganized into subsections
- `workspacePath` promoted to top-level setting shared by C4 and CodeGraph
- Removed: C4 model panel, Memory panel, `loadCoverage`, `regenerateCurrentCodeGraph`, `codeGraph.autoRefresh`, `codeGraph.outputDir`, `coverage.historyLimit`, `test.coverageCommand`, `test.e2eCommand`, Supabase/sync commands

### Trail Core (trail-core)

- `agentMapping` pure functions for Claude session to worktree mapping
- `SequenceAnalyzer` for C4 cross-element call extraction
- Bash `cwd` recorded as workspace path for improved worktree detection
- Fixed: worktree mappings maintained after docs changes
- Fixed: sessions from separate repos no longer mapped to main worktree
- Removed: CLI entry point and CLI-only transforms

## [0.15.0] - 2026-05-03

### Added

- F-cMap data generation and display via TrailDataServer
- L4 code element function list API endpoint
- open-file WebSocket message type and dispatch handling
- L4 file open command wiring via VS Code (`onOpenFile`)
- Trace CodeLens and `runWithTrace` command (M5)

### Fixed

- Trace tab not showing in trail viewer

### Changed

- Refactored M1-M6 trace implementation: removed duplication and improved quality

### Trail Core (trail-core)

- F-cMap color map computation for C4 graph node overlay
- DSM L4 aggregates from C4 code elements instead of raw files
- c4Mapper duplicate logic reduction

## [0.14.0] - 2026-05-02

### Added

- Sync `current_coverage` and `current_code_graphs` to Supabase via `SyncService`

### Changed

- Removed `anytimeTrail.coverage.path` configuration setting

### Fixed

- Load code graph after DB initialization instead of before
- Guard `regenerateReleaseCodeGraphs` command against missing workspace folder

### Trail Core (trail-core)

- Added `current_coverage` table and `LOC` metric for release-independent coverage snapshots
- Added CodeGraph DB persistence tables and persistence layer
- Fixed coverage sync NaN values, community summary preservation, and code graph initialization guard

## [0.13.0] - 2026-04-28

### Added

- Integrated code graph service and related HTTP/WS command handling in the extension flow

### Trail Core (trail-core)

- Added code graph pipeline (detect/extract/build/cluster/layout/query/orchestrate)
- Added code graph repository scope and exclude-pattern configuration support

## [0.12.0] - 2026-04-26

### Trail Core (trail-core)

- Added `source` column to `sessions` table to distinguish log origins

## [0.11.0] - 2026-04-26

### Fixed

- Added `/api/trail/days/:date/tool-metrics` endpoint to `TrailDataServer`

### Trail Viewer (trail-viewer)

- Timing Breakdown chart, Tool/Skill mode toggle, and TurnLaneChart in Session Timeline
- Error/CommitType bar charts replaced with side-by-side pie charts
- DORA metrics as individual overview cards
- Sub-agent lane with dominant-tool coloring; dynamic timeline height
- Removed Quality Metrics tab and several legacy chart/card components
- Performance: removed heavy queries from `getSessions`

## [0.10.0] - 2026-04-25

### Added

- `upsertCommitFiles` implementation in `PostgresTrailStore` and test fake
- Deployment frequency + quality API endpoint (`/api/deployment-frequency-quality`)
- Sync commit files to Supabase `trail_commit_files` table

### Changed

- Aggregate assistant cost per user turn with turn-based attribution
- Include tokens/LOC in metrics inputs sent to Supabase

### Fixed

- Replace `leadTimeForChanges` with `leadTimePerLoc` / `tokensPerLoc` in web-app reader
- Restrict LEAD-based token aggregation to assistant messages within range

### Performance

- Replace heavy CTE + LEAD aggregation with two simple range scans
- Push `match_confidence` filter into SQL

### Trail Core (trail-core)

- Rewrite Change Failure Rate to 168h time-window + file-overlap logic
- Add `leadTimePerLoc` (min/LOC) and `tokensPerLoc` (tokens/LOC) metrics
- Add `computeReleaseQualityTimeSeries` for stacked Release Quality chart
- Replace prompt-to-commit rate with AI first-try success rate
- Add DB indexes for productivity metrics queries

## [0.9.1] - 2026-04-24

### Changed

- Restructure README around vision and current capabilities
- Update extension icon and marketplace logo to `anytime-control-256`

### Fixed

- Path traversal vulnerabilities in `TrailDataServer` (hardened path handling)
- Add missing `touchedFiles` field to `PerAgentState` initialization

### Trail Core (trail-core)

- No changes (version aligned with extension)

## [0.9.0] - 2026-04-23

### Added

- `backupGenerations` VS Code setting: configures the number of backup generations to retain
- Manual groups persistence (Supabase, Web API, TrailDataServer, MCP)
- Group rendering, keyboard shortcuts, and `GroupLabelDialog` in Trail Viewer
- `MinimapCanvas` added to C4 tab in Trail Viewer
- MCP server for C4 model element and relationship management (`list_relationships`, `GET /api/c4/manual-relationships`)

### Trail Core (trail-core)

- Add `ManualGroup` type and service catalog icons (framework, runtime, language, GitHub, VS Code, AI)
- Extract dynamic/re-export/type import edges with metadata

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
