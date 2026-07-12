# Changelog

All notable changes to the "trail-core" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.33.1] - 2026-07-12

### Changed

- Version sync with the Anytime Trail extension release (no functional changes).

## [0.32.2] - 2026-07-11

### Changed

- Version sync with the Anytime Trail extension release (no functional changes).

## [0.32.1] - 2026-07-11

### Changed

- Version sync with the Anytime Trail extension release (no functional changes).

## [0.32.0] - 2026-07-09

### Changed

- Version bump only, to stay in sync with the `anytime-trail` extension release.

## [0.31.1] - 2026-06-30

### Changed

- Version aligned with the Anytime Trail extension 0.31.1 release (security dependency updates and bundled skill changes). No functional changes to `trail-core` itself.

## [0.31.0] - 2026-06-27

### Changed

- Version aligned with the Anytime Trail extension 0.31.0 release (ships bundled `trail-viewer` C4 changes). No functional changes to `trail-core` itself.

## [0.30.1] - 2026-06-24

### Changed

- Version aligned with the Anytime Trail extension 0.30.1 release (ships bundled `trail-viewer` / `memory-core` fixes). No functional changes to `trail-core` itself.

## [0.29.0] - 2026-06-22

### Changed

- Version bump to align with the `anytime-trail` extension v0.29.0 release (no functional change in `trail-core` itself; see the anytime-trail extension CHANGELOG for the bundled trail-viewer / mcp-trail / trail-server / chart-core changes).

## [0.28.0] - 2026-06-20

### Changed

- Version aligned with the `anytime-trail` extension release v0.28.0 (no functional changes in `trail-core` itself; see the `anytime-trail` extension CHANGELOG for doc-core / trail-server / mcp-trail / memory-core changes bundled in this release).

## [0.27.2] - 2026-06-13

### Changed

- Version aligned with the trail release set (no functional changes).

## [0.27.1] - 2026-06-13

### Changed

- Upgrade TypeScript to 6.0.3.
- Reduce cognitive complexity and resolve SonarCloud findings (memory-core: `streamTurn` / `runOnce` complexity reduction, S3776 / S1874 / S1854 / S7735).

### Fixed

- Compare `globalThis.window` against `undefined` explicitly (SonarCloud S7741).
- Rename `then` property of CFG if-nodes to `thenBlock` to avoid reserved-word clash (S7739).
- Remove no-op expression statement in `aggregateGhostEdgesToC4` (S905).

## [0.27.0] - 2026-06-08

### Changed

- Version bump to keep the trail lineage in sync; no functional changes to the core.

## [0.26.0] - 2026-06-03

### Fixed

- Fixed call-graph cycles, null entries, division-by-zero, and O(n^2) aggregation.

## [0.25.0] - 2026-05-31

### Changed

- Version aligned with the `anytime-trail` extension release (no functional changes in `trail-core`; the release bundles `trail-server` / `trail-db` lep.json configuration and daemon decoupling work).

## [0.24.0] - 2026-05-29

### Added

- L5 function-level graph: `filterTrailGraphByElement` and `FunctionGraphResponse` types power the new function-call graph viewer, exported via the `functionGraph` barrel from the c4 root.
- Service catalog with generated `simple-icons` SVG path data (`serviceIcons.generated.ts`), allowing the icon dependency to be dropped from runtime bundles.

### Changed

- `filterTrailGraphByElement` now supports component-level (C5) scope in addition to container/system, with `resolveTargetFilePaths` extracted as a helper.

## [0.23.2] - 2026-05-27

### Changed

- SonarCloud code quality improvements: reduced cognitive complexity (S3776) in `computeColorMap` / `c4ToGraphDocument`, plus S3358 (nested ternary) and S6582 (optional chaining) fixes. No functional changes.

## [0.23.1] - 2026-05-26

### Added

- Language-agnostic CFG-IR shared by the flow and sequence analyzers (`flowGraphFromCfg`, `sequenceStepsFromCfg`, `TsCfgExtractor`).
- Python file classifier (ui / logic / excluded) integrated into the analyze pipeline.

### Changed

- Extracted pure analysis compute (`computeAnalysis`, `computeImportance`) so it can run in an isolated child process; persistence stays in the host for a single DB writer.
- Analyze pipeline is `tsconfig`-optional with a Python-only branch.

### Fixed

- Recover in-repo built `.d.ts` resolution imports to source nodes (code graph edges).

## [0.23.0] - 2026-05-24

### Added

- Python multi-language code graph analysis: `PythonLanguageAnalyzer` via tree-sitter-python with import / inheritance / call edge extraction, `PythonExportExtractor`, function list / tree, and importance scoring
- Introduced language-agnostic `LanguageAnalyzer` SPI and `LanguageRegistry` for dynamic dispatch across TypeScript and Python
- Ollama thermal throttle (`OllamaThrottleGovernor`): detects COOLING state via EWMA of embedding latency, errors, and consecutive-run cap; serializes and suppresses background analysis passes. Added `throttle` section to `lep.json`
- Repository normalization (`repo_id` / `release_id`): each reader resolves `repo_name` / tag via `repo_id` / `release_id`; Supabase mirror syncs `repo_id` / `release_id`

### Changed

- Extracted TypeScript analyzer pipeline into `code-analysis-typescript` / `code-analysis-core` packages
- Bundled tree-sitter wasm assets into the extension bundle

## [0.22.1] - 2026-05-21

### Changed

- Resolved SonarCloud findings across `trail-core` (S3358 nested ternary, S2871, S4325, S7748, S6397, S3735, and others)

## [0.22.0] - 2026-05-20

### Changed

- Reduced cognitive complexity to ≤15 in 30+ functions across `trail-core`: `aggregateDsmByC4Ancestors`, `buildCommunityTree`, `leadTimePerLoc`, `parseMermaidC4`, `toC4`, `customTrail`, `aggregatePairs`, `BackfillMessageCommits`, `tokensPerLoc`, `thresholds`, `releaseQuality`, `classifyFile`, `buildLevelView`, `buildElementTree`, `buildArchitectureMatrix`, `cluster`, `computeCommunityOverlay`, `codeGraphToC4`, `aggregateGhostEdgesToC4`, `SymbolExtractor`, `SequenceAnalyzer`, `ProjectAnalyzer`, `FlowAnalyzer`, `ExportExtractor`, `EdgeExtractor`, `buildSizeMatrix`, `aggregateEdges`, `aggregateHeatmapColumnsToC4` (SonarCloud S3776)

### Security

- Tightened boundary-regex bounds in `trail-core` to prevent polynomial ReDoS

## [0.21.0] - 2026-05-17

### Changed

- Version bump synchronized with `anytime-trail` 0.21.0 (no source changes in `trail-core`)

## [0.20.0] - 2026-05-16

### Added

- Expanded `DEFAULT_ANALYZE_EXCLUDE_CONTENT` used by `seedAnalyzeExclude` (added `.claude/`, `.changeset/`, `.github/`, `.config/`, `.playwright-mcp/`, `.serena/`, `.vscode/`, `__mocks__/`, `demos/`, `dist/`, `**/CHANGELOG.{ja,}.md`, `**/README.{ja,}.md`)

### Changed

- **Breaking:** Moved agent mapping out of `trail-core` into the new `agent-core` package. Consumers must import agent mapping from `@anytime-markdown/agent-core`

### Security

- Hardened regex literals against polynomial backtracking (ReDoS)

## [0.19.0] - 2026-05-15

### Changed

- **Breaking:** Workspace config folder renamed from `.trail/` to `.anytime/`. Affected files: `analyze-exclude` / `dead-code-ignore` / `commit-categories.json` / `tool-categories.json` / `skill-categories.json`. Existing workspaces must manually rename `.trail/` to `.anytime/`
- **Breaking:** `TRAIL_HOME` consolidation — all trail-related storage is resolved through the shared `getTrailHome` helper. Default location now `<workspaceRoot>/.anytime/trail/` (DB at `<workspaceRoot>/.anytime/db/trail.db`)
- Removed `*_DB_PATH` env vars and dead `opts.dbPath` override (use `TRAIL_HOME` instead)
- `trail-db` `DEFAULT_DB_DIR` now defaults to `<cwd>/.anytime/trail`; `.anytime` added to `SNAPSHOT_SKIP_DIRS`
- Trace output relocated to `<TRAIL_HOME>/trace` and trail-server / vscode-trail-extension share `getTrailHome`

### Fixed

- `trail-db` `SqlJsCompatStatement` no-bind path and 3 stale tests repaired
- `mcp-trail` aligns `dbPath` search with `.anytime/db/trail.db` default
- VS Code extensions align `trailConfigPath` with `TRAIL_HOME` default
- `trail-server` defers memory-core path resolution in `MemoryApiHandler`
- `memory-core` refuses to fall back to the vscode-server bin path
- `vscode-trail-extension`: `pipeline-status.json` reader / writer kept in sync
- sql.js was switched from asm.js to WASM to avoid OOM during `saveCurrentGraph`

## [0.18.0] - 2026-05-08

### Added

- Timestamp format enforcement: ISO 8601 + Z CHECK constraints and `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` defaults added to SQLite schema; index naming unified to `idx_<table>_<column>` convention

### Changed

- `.trail/analyze-exclude` now uses `.gitignore`-compatible syntax (via `ignore` package). Supports `!` negation, `/`-prefix root anchoring, `*.spec.ts` file globs, `dir/` directory-only, and `**` recursive matching. **Breaking:** `AnalyzeOptions.exclude` type changed from `readonly string[]` to `Ignore`
- `loadAnalyzeExclude` return type changed from `string[]` to `Ignore`
- `FilterConfig.exclude` is now `Ignore`; removed `matchGlob` and `parseAnalyzeExclude`
- `analyze()` now shares the TypeScript `ts.Program` with `ImportanceAnalyzer`

### Fixed

- `mapFileToC4Elements` failed to match absolute paths, resulting in empty entries
- `ProjectAnalyzer.getSourceFiles` now excludes `.d.ts` declaration files

## [0.17.0] - 2026-05-06

### Added

- Dead code detection: `DeadCodeSignals`, `computeDeadCodeScore`, `parseDeadCodeIgnore` with negation support
- Per-function importance aggregation to per-file, and file-level dead-code score aggregated to C4 elements
- `dead-code-score` MetricOverlay with color mapping
- Cyclomatic complexity calculation in `TypeScriptAdapter`
- `file_analysis` and `function_analysis` SQLite tables; `line_count` / `cyclomatic_complexity` columns
- `FileAnalysisRow` / `FunctionAnalysisRow` with `cyclomatic` / `lineCount`
- `.trail/analyze-exclude` to externalize code graph analysis filters
- `codeGraphToC4` derivation for `StoredCodeGraph`
- `TrailSession.workspace` field; `TrailFilter.repository` replaced with `workspace`
- Size metrics overlay (LOC / Files / Functions) on the C4 viewer

### Fixed

- Local timezone formatting on WSL (UTC display) corrected
- `dead-code-score` color propagation to parent frames suppressed
- `dead-code-score` colored only at display-level element types

### Changed

- `MetricOverlay` renamed: `complexity-most` / `complexity-highest` → `edit-complexity-most` / `edit-complexity-highest`
- `buildSizeMatrix` input switched from `CoverageMatrix` to `SizeFileEntry[]`

### Performance

- `SERVICE_CATALOG` isolated to a dedicated subpath (mcp-trail bundle reduced 86%)
- `zod` aligned to 4.3.6 to dedupe duplicates

### Removed

- Unused `release_features` / `imported_files` / `c4_models` tables and related code

## [0.16.0] - 2026-05-04

### Added

- `agentMapping` pure functions for mapping Claude sessions to git worktrees (TDD)
- `SequenceAnalyzer` for extracting C4 cross-element call sequences
- Record Bash working directory (`cwd`) as workspace path for improved worktree detection

### Fixed

- Worktree mappings now maintained after docs-only changes
- Sessions from separate repositories no longer incorrectly mapped to main worktree

### Removed

- CLI entry point and CLI-only transform functions

## [0.15.0] - 2026-05-03

### Added

- F-cMap color map computation for C4 graph node overlay

### Fixed

- DSM L4 now aggregates from C4 code elements instead of raw files

### Changed

- Optimized c4Mapper to reduce duplicate logic and unnecessary fetches

## [0.14.0] - 2026-05-02

### Added

- `current_coverage` table for release-independent coverage snapshots
- `LOC` metric showing total lines of code from coverage data
- CodeGraph DB persistence tables and persistence layer
- Unit tests for coverage aggregation and parsing

### Changed

- Moved `importCurrentCoverage` from `importAll` to `c4Analyze`
- Removed `graph.json` fallback; completed migration to DB-backed code graph

### Fixed

- Guard `CodeGraphService.loadFromDb` against uninitialized DB
- Parse JSON object strings in `codeGraph.repositories` setting
- Guard against NaN percentage values (Istanbul "Unknown") in coverage sync
- Preserve AI community summaries across code graph regeneration
- Add L4 file-level coverage entries in `aggregateCoverageFromDb`
- Export `C4Model` type from package root
- Add `project` field to `TrailFilter`

## [0.13.0] - 2026-04-28

### Added

- Code graph pipeline: detector, extractor, builder, clusterer, layout, query engine, and orchestrator
- Code graph HTTP/WS message types and endpoint integration for Trail extension clients
- Configuration support for repository scoping and exclude patterns in code graph analysis

### Changed

- Default code graph repository resolution to workspace scope
- Narrow code graph configuration reads to section-scoped accessors

## [0.12.0] - 2026-04-26

### Added

- `source` column to `sessions` table to distinguish log origins

## [0.11.0] - 2026-04-26

- Version bump to stay in sync with trail-viewer and vscode-trail-extension (no core changes)

## [0.10.0] - 2026-04-25

### Added

- `computeReleaseQualityTimeSeries` for stacked Release Quality chart
- `leadTimePerLoc` metric (min/LOC) replacing `leadTimeForChanges`
- `tokensPerLoc` metric (tokens/LOC) with `computeTokensAndCostPerLocTimeSeries`
- `costPerLocTimeSeries` exposed on `QualityMetrics`
- `linesAdded` field on `CombinedCommitPrefix`
- DB indexes for productivity metrics queries

### Changed

- Rewrite Change Failure Rate to 168h time-window + file-overlap logic
- Replace prompt-to-commit rate with AI first-try success rate
- Require file overlap for AI first-try failure detection; exclude non-code files
- Recalibrate thresholds to cache-read and commit-unit reality
- Widen daily bucket threshold to 31 days
- `VALID_MESSAGE_COMMIT_CONFIDENCES` widened to `ReadonlySet<string>`

### Fixed

- Resolve `message_commits` to user-ancestor UUID
- Align timeSeries with sum-ratio aggregation
- Use commit `committed_at` instead of `mc.detected_at` for productivity metrics
- Redefine productivity metrics on session-scoped commit windows

## [0.9.1] - 2026-04-24

### Changed

- Version aligned with `vscode-trail-extension` release (no code changes in `trail-core`)

## [0.9.0] - 2026-04-23

### Added

- `ManualGroup` type and conversion to `GraphGroup` in `c4ToGraphDocument`
- Dynamic, re-export, and type import edge extraction with metadata
- Framework, runtime, and language icons to service catalog
- GitHub, VS Code, and AI service icons to service catalog

## [0.8.0] - 2026-04-19

### Added

- DORA 4 metrics domain types, thresholds, and classification (`types.ts`, `thresholds.ts`)
- Deployment frequency metric implementation
- Lead time for changes metric implementation
- Prompt-to-commit success rate metric implementation
- Change failure rate metric implementation
- `computeQualityMetrics` orchestrator aggregating all DORA metrics
- `getQualityMetrics` port to `ITrailReader`
- `ISessionRepository` port for session-level persistence
- `budget` and `session` domain model additions
- `BackfillMessageCommits` use case for retroactively linking messages to commits
- Time-series utility functions for metrics windowing

## [0.7.0] - 2026-04-18

### Added

- Introduce `trail_daily_counts` table replacing `trail_daily_costs`
- Add `getAllDailyCounts()` and remove `getAllDailyCosts()` in TrailDB
- Replace `IRemoteTrailStore.upsertDailyCosts` with `upsertDailyCounts`

### Changed

- Update `SyncService` to use `getAllDailyCounts` / `upsertDailyCounts`
- Update `PostgresTrailStore` and `SupabaseTrailStore` to use `trail_daily_counts`
- Filter releases sync to `anytime-markdown` repository only
- Filter `trail_current_graphs` sync to `anytime-markdown` only

### Fixed

- Use parameterized query in `getAllMessageToolCalls` to prevent SQL injection
- Filter `message_tool_calls` by `messageCutoff` to prevent FK violation

### Removed

- Remove `daily_costs` dead code

## [0.6.0] - 2026-04-13

### Added

- `IC4ModelStore` port and `fetchC4Model` service for multi-repository C4 model support

### Changed

- Replace remote sync with full wipe-and-reload strategy and 7-day message window
- Split `trail_graphs` into `current_graphs` and `release_graphs` tables
- Use `repo_name` as primary key for `current_graphs`
- Add ISO 8601 UTC timestamps to `TrailLogger` output

### Fixed

- Re-import sessions whose messages were silently dropped during sync
- Correct `INSERT_MESSAGE` SQL placeholder count and surface previously silent catch errors
- Aggregate `daily_costs` by JST boundary instead of process timezone

## [0.5.3] - 2026-04-12

### Fixed

- Fix `.gitignore` pattern that inadvertently excluded `src/c4/coverage/` source files from version control, causing CI build failure

## [0.5.2] - 2026-04-12

### Added

- Domain layer (model, schema, engine, port, reader, usecase) for trail-core
- `releases` table schema and `TrailRelease` domain model with release resolver engine
- `release_files` and `release_features` tables (replacing task domain)
- `trail_graphs` schema for graph data storage
- `release_coverage` table and `ReleaseCoverageRow` type
- `session_costs` and `daily_costs` tables for cost tracking
- `repo_name` column to `trail_sessions` and `trail_releases`
- `cacheCreation` to MODEL_RATES and cost estimation
- `getFileStatsByRange` to `IGitService`
- `getReleases` to `ITrailReader`
- `skill_models` table for skill-based cost classification
- Unit tests for domain engine, usecase, and release resolver
- Merged `c4-kernel` package into `trail-core`

### Changed

- Restructured sessions/messages tables; added `session_costs`/`daily_costs` population in `importAll`
- Import performance: batching by message count (20,000), in-memory session map, reduced I/O
- `daily_costs` and `session_costs` rebuild moved to post-processing in `importAll`
- Progress logging at DB commit boundary with processed/total/skipped counts
- Cost classification simplified to Current/Optimized (removed Rule/Feature)

### Fixed

- Yield event loop during import to prevent Extension Host timeout
- Session boundary transaction commit
- Backfill `repo_name` and `release_files` for existing records
- Separate skip logic for main sessions and subagents
- `sessionId` extraction from grandparent directory for subagents

## [0.5.1] - 2026-04-11

### Added

- `formatDate` utility for locale-aware date formatting
- Unit tests for `formatDate`

### Changed

- Date/time display unified to local timezone using `formatDate`
- Daily graph aggregation changed to local timezone basis

## [0.5.0] - 2026-04-09

### Added

- Remote DB sync layer (SQLite → Supabase/PostgreSQL)
- `IRemoteTrailStore` interface for remote DB abstraction
- `SupabaseTrailStore` and `PostgresTrailStore` implementations
- PostgreSQL migration for remote trail tables
- `SyncService` for SQLite-to-remote sync
- `resolveCommits` and `isCommitsResolved` methods
- `session_commits` table and `commits_resolved_at` column
- `getSessionCommitStats` and `getSessionCommits` queries
- `totalFilesChanged`, `totalAiAssistedCommits`, `totalSessionDurationMs` analytics fields

## [0.4.0] - 2026-04-08

- Version sync with vscode-trail-extension

## [0.3.0] - 2026-04-07

### Added

- `--format c4` option for CLI output

## [0.2.0] - 2026-04-05

### Added

- CLI --help option, format validation, and parseArgs export

### Changed

- Index TrailNodes by Map for O(1) lookup in EdgeExtractor

### Security

- Prevent ReDoS in matchGlob pattern handling

## [0.1.0] - 2026-04-04

### Added

- trailToC4 L2-L4 conversion and MDA CLI command
- --format mermaid CLI option with granularity and direction
- toMermaid transform with module and symbol granularity

### Changed

- Simplify toMermaid to trailToC4 + c4ToMermaid pipeline
- Cache sourceFiles and add diagnostics to EdgeExtractor
- Remove unused code

### Fixed

- Use filePath for Mermaid node labels instead of internal id

## [0.0.1] - 2026-04-04

Initial release. Static analysis engine for TypeScript project architecture visualization.

### Added

- ProjectAnalyzer for TypeScript project scanning with configurable filters
- SymbolExtractor for extracting classes, functions, interfaces, and type aliases
- EdgeExtractor for detecting import dependencies between symbols
- FilterConfig for include/exclude path patterns and symbol type filtering
- Mermaid diagram output (toMermaid transform)
- C4 model output (toC4 transform)
- Cytoscape.js graph output (toCytoscape transform)
- Trail stylesheet for consistent graph styling
- Custom trail definitions for user-defined analysis scopes
- C4 model types (Person, System, Container, Component, Relationship)
- CLI tool (`trail`) for command-line analysis
