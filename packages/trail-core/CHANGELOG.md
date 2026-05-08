# Changelog

All notable changes to the "trail-core" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
