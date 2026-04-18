# Changelog

All notable changes to the "trail-core" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
