# Change Log

All notable changes to the "Anytime Trail" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.38.0] - 2026-07-19

### Added

- Bundled skills: the review format gained a checklist-reference line, and retro now detects checklist-promotion candidates (P1/P2). Promotion has a formalized exit and clause-effect measurement (P3/P4).

### Changed

- `anytime-token-budget` was merged into `anytime-dev-retro`, which also gained ticket creation.

### Fixed

- The `anytime-dev-retro` manifest version was bumped to 13 so the updated skill actually reinstalls.

### Trail Core (trail-core / trail-server / trail-viewer / memory-core)

- Acceptance ledger (`acceptance_records`) with miss-rate aggregation and API.
- Phase 6 S5: shared C4 Component Rollup, Bus Factor Score, Drift History Graph and Newly Active Code Detection.
- Review findings gained a `checklist_ref` checklist key (memory-core).
- Analytics period is a day-count input with a 1day/1week bucket toggle; pie charts keep a fixed size when empty.

## [0.37.0] - 2026-07-17

### Added

- Phase 6 Flight Review UI: a flight-review list / detail view with manual correction and CSV export in the viewer.
- Rationale Audit UI: audit status and a rationale reference view.

### Trail Core (trail-core / trail-server / trail-viewer)

- Flight Review foundation: `flight_reviews` schema, a Stop-hook debrief that mechanically aggregates the transcript server-side, and User Feedback Logging (post-hoc "revert" detection).
- Tickets: assignee and workspace became selectable fields, effort is tracked in minutes, and `labels` / `progress` were dropped (`assignee` strictly validated as an enum).
- Cross-review fixes across trail-server / trail-viewer / trail-core (editing latch, store encapsulation, serverUrl follow, CSV formula injection, 415 guard, CHECK-constraint fail-open).

## [0.36.0] - 2026-07-17

### Added

- Phase 5 emergency protocol: Kill Switch, safe-point and non-destructive rollback commands; a floating Kill Switch button and EmergencyPanel in the viewer; HTTP APIs for emergency state, trigger, release and rollback.
- Knowledge-base persistence: pre-write snapshots and shrink audit for graph-destructive writes, with a shrink warning notification and a restore command.
- Periodic drain of the emergency spool written by agent hooks while the server is unreachable.
- Quality metrics: MTTR / TCR cards in the viewer.
- "Export to Agent Note" on the node context menu, delegated to the Anytime Agent extension via a new WS command / IPC event.

### Fixed

- Kill Switch: cancelling the reason input no longer aborts silently without a record (FR-S5-5 / FR-S5-6).
- Removed the startup cliff when `trail.db` exceeds 2 GiB (backup and save paths no longer load the whole file into memory).
- Cross-review fixes across trail-server / trail-viewer / trail-db.

### Security

- Extended the CSRF Content-Type guard to every persistent-write POST endpoint of the local trail server.

## [0.35.0] - 2026-07-16

### Changed

- Renamed the bundled `anytime-dev-health` skill to `anytime-dev-retro`, now focused on retrospectives. The environment/setup audit was split into `anytime-dev-audit`, which ships with the Anytime Agent extension instead.
- `anytime-dev-retro` gained an incident mode (turning production incidents into requirements), prompt feedback loops (two-window comparison of skill firing and delegation performance aggregation), per-model behavior profiles with model tags on delegation records, a meta-mechanism health check, and meta-loop promotion (when repeated revisions of a target don't stick, propose revising the feedback machinery itself).
- Updated the bundled `anytime-token-budget` skill text (manifest bumped so the update deploys).
- Skill scripts' `.test.cjs` tests are now part of the package jest run (they were previously not wired in).

### Fixed

- Delegation performance aggregation missed adopt/return markers written directly after Japanese text (JS `\b` does not match there), and no longer splits model stats between the short model alias and the full model ID.

## [0.34.0] - 2026-07-14

### Added

- Architectural alignment check. Detects code that was committed without touching the design documents describing it, and surfaces the violations in a new "Alignment" panel in the Trail sidebar. A command sends them to the Problems panel as diagnostics, grouped by file × C4 element (one element can be described by many documents, so a per-document diagnostic would flood the panel).
- The check is exposed as the MCP tool `check_alignment` through `TrailDataServer`, so agents can query alignment directly.
- The bundled `anytime-dev-health` skill gained a setup-audit mode (`references/setup-audit.md`) that diagnoses the Claude Code environment: hook wiring, settings, and bundled-skill integrity.

### Fixed

- Timestamps in trail views are rendered in the local timezone. The Extension Host runs with `TZ=UTC` on WSL, so `Date`'s local getters were returning UTC values.
- Bundled skills now actually update. Skill deployment is gated on `skills/manifest.json` versions recorded in `.claude/skills/.anytime-trail-skills.json`, so a changed `SKILL.md` reaches workspaces that already have the skill instead of being preserved forever. `anytime-reverse-codegraph` moved onto the same path as the other bundled skills.

### Removed

- Removed `installBundledSkills` from `vscode-common`. It only ever deployed `anytime-reverse-codegraph`'s `SKILL.md` and preserved any deployed file that differed, which is the preserve-forever bug this release fixes; the skill now goes through the same version-gated path as the others.

### Trail Core (trail-core / trail-db / trail-server / mcp-trail)

- `CheckArchitecturalAlignment` use case, scoped to the current worktree, with a workspace C4 element provider and real-data wiring through `SpecDocIndex` / `FileChangeResolver`.
- Commit paths are decoded from git's quoted form before comparison, so non-ASCII paths no longer mismatch forever.
- `AlignmentApiHandler` serves the check over `TrailDataServer`.

## [0.33.2] - 2026-07-13

### Trail Core (trail-core / trail-db)

- Fixed Supabase sync FK violations: referential-integrity gate, retry on transient HTTP failures, and per-chunk error isolation.

## [0.33.1] - 2026-07-12

### Changed

- Renamed the bundled `anytime-review` skill to `anytime-trail-review` so the name reflects that it is trail's memory-core ingest contract. The old `.claude/skills/anytime-review/` directory is removed automatically on extension activation.

## [0.33.0] - 2026-07-11

### Added

- Bundled the `anytime-review` skill (code-review finding format for memory-core ingest, renamed from `review-finding-format`) and install it into `.claude/skills/` automatically.

### Trail Core (memory-core)

- Updated review-ingest references to follow the skill rename (`review-finding-format` → `anytime-review`).

## [0.32.2] - 2026-07-11

### Changed

- Updated the bundled anytime-dev-health skill: the cost signal now uses a rolling 30-day window to correct false positives from cumulative metrics.

## [0.32.1] - 2026-07-11

### Changed

- Stopped bundling the `anytime-cross-review` skill; it is now distributed by the Anytime Agent extension. An already installed `.claude/skills/anytime-cross-review/` is left untouched, but you need the Anytime Agent extension to receive further updates.

## [0.32.0] - 2026-07-09

### Added

- `get_verification_status` MCP tool: reads the verification ledger (`verification.db`) and reports which verification commands ran, with a protected-path guard and a `busy_timeout`.

### Trail Core (trail-core / trail-server / trail-viewer / agent-core)

- `agent-core`: the worker entry point now validates the `workspaceRoot` taken from `argv` and warns when `chmod` fails.
- `trail-viewer`: pass an explicit wrapper to `flatMap` instead of a bare unary callback (CodeQL js/superfluous-trailing-arguments).
- `trail-server`: dropped an unnecessary `await` on a non-Promise value (Sonar S4123).

## [0.31.2] - 2026-07-02

### Trail Core (trail-viewer)

- De-React parity recheck: restored missing behavior/appearance across C4, the shell/panels, logs/messages/memory, analytics tooltips, the C4 toolbar (i18n/a11y), the C4 canvas dynamic aria-label, and the codeGraph/evaluation/sessionList panels; restored loading/empty-state presentations; circled the metric-card `?` help icon; restored visible labels, aria, and variants (Alert fallback color, Spinner aria).

## [0.31.1] - 2026-06-30

### Security

- Updated bundled dependencies for security: `ws` 8.20.1 → 8.21.0, `dompurify` 3.4.0 → 3.4.11.

### Changed

- Bundled `anytime-dev-health` skill: added scanning and ledgering of intentional-simplification markers (`// SHORTCUT: … ceiling … upgrade`).

## [0.31.0] - 2026-06-27

### Changed

- Documentation: the Stop hook script is now `token-budget.sh` (renamed from `trail-token-budget.sh`); the hook is registered by the Anytime Agent extension.

### Trail Core (trail-viewer)

- C4: architecture-layer annotation and visualization wired through `classifyLayer`; completed the vanilla wiring of the Scatter / Code Graph popups; turned element-tree type badges into SVG icons (dropped the S / C / Co text); consolidated the C4 left-panel controls into a single scrollable column (Ghost Edges / Hotspot / overlay-legend / defectRisk-TC overlap fixes); restored the selected-element details panel's missing sections and enlarged its fonts; removed the C4 layer-container auto-seed (Phase 4).

## [0.30.1] - 2026-06-24

### Trail Core (trail-viewer / memory-core)

- `trail-viewer`: fixed the resizable popup maximize / resize regression, restored the ↗ popup trigger on combined charts, and matched the popup top-right icon color to the theme.
- `memory-core`: generalized failed-items retry so it also picks up the `conversation_incremental` scope, and resolved the `spec_incremental` partial warning (added the `reference` type and a soft-skip for `related:`-only frontmatter).

## [0.30.0] - 2026-06-23

### Added

- Bundle the `anytime-dev-health`, `anytime-cross-review`, and `anytime-token-budget` skills and auto-install them into `<workspace>/.claude/skills/` on activation (version-diff overwrite via `installStaticSkillDir`).

### Trail Core (memory-core / doc-core / trail-server)

- `memory-core`: record `reviewer` and `severity_overall` on review ingest, and anchor `linkAddresses` on `reviewed_at` to close the review→fix linkage (RC1).
- `memory-core`: fix the review session parser dropping findings past a 2048-char message truncation and ignoring the explicit `重大度:` severity marker (now parses from full text and honors the marker).
- `memory-core`: map synthetic drift subject IDs (`file:` / `package:` …) to canonical entities to stop FK silent drops (RC5).
- `doc-core` / `trail-server`: wire the doc-core runner into the trail daemon child process, stop the embed silent failure (per-item resilience + status persistence), and cap embed input to 3000 chars to avoid bge-m3 context-length errors (RC3).

## [0.29.0] - 2026-06-22

### Trail Core (trail-viewer / mcp-trail / trail-server / chart-core)

- `mcp-trail`: add discovery tools — `get_important_files` and `get_code_dependencies` (wrapping the existing TrailDataServer HTTP analysis), plus `query_code_graph` / `find_code_path` / `get_cochange_partners`.
- `mcp-trail`: redesign `query_code_graph` as search-only (depth=0 default, ranked by node size, detail mode), with induced-subgraph and edge caps to prevent result blowup.
- `trail-viewer`: full migration to vanilla DOM on `ui-core` (replacing React/@mui); Trace/Prompts kept as React islands via a vanilla→React bridge. Drop `@mui` / `@mui/x-charts` / `@emotion` dependencies.
- `trail-viewer`: migrate all charts to the `chart-core` web component (`<anytime-chart>`); add `AnytimeChartView` wrapper and pie/stacked-bar spec transforms.
- Fix several regressions surfaced during the vanilla/chart migration (C4 level buttons, empty C4/Prompts panels, embedded popup overlay, bar-selection highlight, combined chart series).

## [0.28.0] - 2026-06-20

### Trail Core (trail-core / trail-server / mcp-trail / memory-core)

- Added `doc-core` package: document search with structural index, FTS5 keyword search, and embedding-based semantic search in a single `doc-core.db` (trigram tokenizer for Japanese).
- Added `search_docs` tool to `mcp-trail` for cross-document search via `doc-core.db`.
- Wired `doc-core` into the `trail-server` daemon; document root is now sourced from `lep.json` `sources.docs.root` (legacy `DOC_CORE_DOCS_ROOT` env removed).
- Fixed `memory-core` episode summary persistence: added missing `summary` column to the ollama INSERT and introduced `summarizeSpecDoc` for whole-document spec summarization.

## [0.27.2] - 2026-06-13

### Trail Core (trail-core / trail-viewer)

- Updated the bundled C4 viewer to import React-coupled canvas helpers (`useCanvasBase`, `MinimapCanvas`) from `graph-react-islands`, following the graph-core React peer-dependency removal.

## [0.27.1] - 2026-06-13

### Fixed

- Upgrade TypeScript to 6.0.3 (build toolchain update).

### Trail Core (trail-core / trail-server / memory-core)

- Escalate daemon `dispose` to SIGKILL to prevent daemon orphaning on Extension Host crash.
- Yield to the event loop periodically in `bug_history` sweep to reduce blocking on large data sets (perf).
- Fix unawaited `ChatBridge.dispose` (S4822).
- Resolve SonarCloud findings in trail-core / memory-core.

## [0.27.0] - 2026-06-08

### Fixed

- Update `VSCODE_NODE_TARGET` to 24.15.0 and bundle `better-sqlite3` for the Node 24 ABI; limit `prepare-native` reuse to matching targets.

### Trail Core (trail-server / memory-core)

- trail-server: resolved CodeQL tainted-format-string & log-injection in `computeImportance` and fixed an unawaited async attach in `openReadOnly`.
- memory-core: hardened embedding regex patterns (S5850 / S5868) and added Stryker mutation-test coverage for embedding helpers.

## [0.26.0] - 2026-06-03

### Fixed

- Await the MCP command handler and reuse the trace terminal.

### Trail Core (trail-core / trail-server / trail-viewer)

- `lep.json`: per-analyzer toggle for primary analyzers (ReleaseResolver, CoverageImporter, BehaviorAnalyzer, CommitFilesBackfiller, SubagentTypeBackfiller, MessageCommitMatcher).
- trail-server: serialized chat init and stopped swallowing analyzer errors.
- trail-core: fixed call-graph cycles, null entries, division-by-zero, and O(n^2) aggregation.
- trail-viewer: fixed async races / pagination gaps / per-frame canvas resets and deferred C4 / prompts fetch until first access.
- trail-db: pushed the message cutoff into SQL in `SyncService`.

## [0.25.0] - 2026-05-31

### Added

- Auto-generate `lep.json` with sensible defaults on activation when the file is absent.
- `lep.json` workspace configuration wired end-to-end: `configPaths`, `defaultRepoName`, and trace-directory injection decouple the data server / daemon from a single git root.

### Changed

- Decoupled the daemon HTTP server from `configure()` and routed `lep.json workspace.excludeRoot` / `configPaths` through to the daemon `CodeGraphService` and data server.

### Fixed

- Clean `dist` before production packaging so stale artifacts are excluded from the VSIX.
- Anchor the trail hook `TRAIL_HOME` at the workspace root (`vscode-common`).

### Trail Core (trail-core / trail-server / trail-db)

- `trail-server`: add `/config` lep helpers and `workspace.configPaths` schema; inject trace dir and default repo name to decouple display from a single git root.
- `trail-db`: create the database parent directory in `init()` before opening better-sqlite3.

## [0.24.0] - 2026-05-29

### Added

- L5 function-level graph viewer in the C4 model view: select a component to inspect its function-call graph (new C4 level 5).
- C5 component scope: the function graph can now be scoped to an individual component in addition to container / system.

### Changed

- Migrated the extension host to the trail-daemon architecture (HTTP + IPC clients via `DaemonClient`), reaching the milestone of zero bundled TypeScript in `extension.js`.

### Fixed

- Externalized optional native dependencies in node bundles to avoid resolution failures.
- Plugged a `ChatBridge` leak and hardened daemon error logging.

### Trail Core (trail-core / trail-server / memory-core / mcp-trail)

- trail-server: new `/api/c4/function-graph` endpoint and trail-daemon host with IPC analyze pipelines (`AnalyzeAllRunnerClient` / `AnalyzeCommandClient`); added `/services` `/analyze-utils` `/llm` `/github` `/config` subpaths.
- trail-core: L5 function graph engine (`filterTrailGraphByElement`) and generated service icon data that drops `simple-icons` from bundles.
- memory-core / mcp-trail: split TypeScript-consuming exports into `/pipeline` and `/query` subpaths to keep root barrels TypeScript-free.

## [0.23.2] - 2026-05-27

### Fixed

- `analyze_current_code` now persists `current_code_graphs` and communities to the same repository as the analyzed workspace (per-call `repositories` override). Previously the statistics (saved to the analyzed workspace) and the code graph / communities (generated for the fixed activation-time repo) could diverge to different projects.

### Security

- Hardened `handleTraceFile` with resolved-path containment check to defend against path injection (S2083).
- The analyze child process now writes results to a private directory created via `mkdtempSync`, resolving an insecure temporary file issue.
- Replaced `parseGitHubRemote` with an `indexOf`-based implementation to eliminate a polynomial ReDoS.

### Build

- Reduced VSIX size by ~40% by excluding development and build artifacts from the package.

### Trail Core (trail-core / trail-server / trail-db / memory-core)

- Reduced cognitive complexity (S3776) across trail-server, trail-db, memory-core and trail-core.
- Added +181 coverage tests in trail-db (package coverage 77.5% → 80.6%).
- Various SonarCloud mechanical safe fixes (S4624, S7735, S7780, S4325, etc.).

## [0.23.1] - 2026-05-26

### Changed

- Analyze now runs the heavy TypeScript analysis in an isolated child process (`analyze-child`). A native crash in analysis no longer takes down the extension host; the host survives, retries once, and returns a structured error instead of an opaque failure.
- Pipeline panel shows all 4 LEP waves, grouped by wave.
- `analyze-exclude` / `excludeRoot` is resolved from the open VS Code workspace folder (`lep.json` `workspace.excludeRoot`).
- Analyze supports Python-only repositories (no `tsconfig.json`).

### Fixed

- Notify `model-updated` after analyze so the C4 model view refreshes.

### Build

- Build the webpack multi-config sequentially (`parallelism: 1`) to reduce peak load and mitigate non-deterministic SIGSEGV on Node 24 / WSL2.

### Trail Core (trail-core / trail-server)

- Heavy TS analysis isolated into a child process (compute in child, persist in host) for crash resilience.
- Language-agnostic CFG-IR shared by the flow and sequence analyzers.
- Python file classification (ui / logic / excluded) applied in the analyze pipeline.
- Ollama load throttle: skip conversation scopes while COOLING.
- Recover in-repo built `.d.ts` resolution imports to source nodes.
- Localized code-graph kind badges (`c4.kind.*`).

## [0.23.0] - 2026-05-24

### Changed

- trail-viewer: show repository / release selector when the current C4 model is empty
- Resolved embed ambiguity in `trail_repos` (`!repo_id`)

### Trail Core (trail-core / trail-server / trail-db / memory-core)

- `trail-core`: Python multi-language code graph analysis (tree-sitter-python, import / inheritance / call edges, `PythonExportExtractor`, function list / tree, importance scoring)
- `trail-core`: Ollama thermal throttle (`OllamaThrottleGovernor`) — EWMA latency / error / run-cap detection; serializes background analysis; `throttle` config in `lep.json`
- `trail-core`: repository normalization — `repo_id` / `release_id` introduced; Supabase mirror synced

## [0.22.1] - 2026-05-21

### Security

- Fixed polynomial ReDoS in `trail-db` session-metadata parsing (`sessionMeta`, S5852 / js/polynomial-redos)
- Fixed OS command injection in `trail-db` `GitStateService.getCommitsSince`

### Trail Core (trail-core / trail-db / mcp-trail / memory-core / trail-server)

- `trail-core`: resolved SonarCloud findings (S3358/S2871/S4325/S7748/S6397/S3735 and others)
- `trail-db`: resolved SonarCloud findings (S4325/S3358/S7718/S7776/S3863/S1854 and others)
- `mcp-trail`: resolved SonarCloud findings (S1874/S7735/S4325/S7772/S2486/S4043); raised sqlite/tools coverage (`searchMemory`/`read`/`write`/`client`/`dbPath`/`sqlJsUtil` to 100%)
- `memory-core`: raised coverage (statements 85.6→92.1%, branches 69.9→77.7%)
- `trail-server`: added `TrailDataServer` WebSocket integration tests (statements 52→57%); improved LEP pipeline (analyzers/ingesters) and server/analyze/runtime coverage
- `vscode-common`: improved `claudeHookSetup`/`installSkills` coverage (69→94% / 75→99%)

## [0.22.0] - 2026-05-20

### Added

- **LEP (Layered Event Pipeline) — GitHub PR review ingestion**: `GitHubPrReviewIngester` ingests GitHub PR review findings as a new `github_pr_review` source event type; `FindingAnalyzer` parses and stores review findings into the DB
- **LEP — DORA metrics aggregation**: Layer 4 `DoraMetricsAggregator` computes deployment frequency, lead time, change-failure rate, and MTTR from the unified event stream
- **LEP — cross-source correlation**: `CrossSourceCorrelator` links events across sources (commits, sessions, PR reviews) and writes `cross_source_correlations` to the DB; enables surfacing related signals in the Trail viewer
- **`lep.json` config unification**: `LepConfig` schema extended to cover all pipeline settings; `config.json` is automatically migrated and renamed on first startup. All schedule / LLM / memory / gitRoots settings now live exclusively in `lep.json`

### Changed

- **LEP — stage enum and `memory` scope skip**: when the pipeline stage does not include memory processing, the memory scope is now displayed as `skipped` instead of failing silently
- **LEP — LLM pre-flight health check**: the pipeline performs an LLM reachability check before memory analysis stages; unreachable analyzers are skipped gracefully with partial-skip reporting
- **`memory-core` 7-analyzer decomposition**: the monolithic memory pipeline is now split into 7 focused analyzers wired through LEP `lep.json`

### Fixed

- `LEP ingester → consumer` initialization-order bug: `import_sessions` events were ingested as 0 items due to incorrect startup ordering; fixed by reordering `LepOrchestrator` initialization
- `ollama-core` / `memory-core` split-brain: `resolveOllamaBaseUrl` now resolves a single authoritative `baseUrl` from `lep.json`, eliminating divergent configurations between the daemon and the extension

### Security

- Sanitized stack-trace exposure in 13 HTTP 500 error handlers in `trail-server`
- Validated daemon URL before `fetch` in `trail-server` and `vscode-trail-extension`
- Used `mkdtempSync` for trail-attach temporary files in `memory-core` to eliminate TOCTOU race
- Closed TOCTOU file-system-race in 4 spec/install/loader paths
- Bumped `hono` / `mermaid` / `next-intl` / `ws` to patch 4 moderate CVEs

### Trail Core (trail-core / trail-server / memory-core / trail-db)

- `trail-server`: `Config.ts` (`config.json` loader) removed; daemon and extension wired entirely to `lep.json`
- `trail-db`: cognitive complexity reduced to ≤15 in 16 methods (`SyncService.doSync/syncManualElements`, `ClaudeCodeBehaviorAnalyzer.analyze`, `communityCarryOver` resolve helpers, `ExecFileGitService` numstat/namestatus helpers) (S3776)
- `trail-db`: statement coverage raised from 56% to 70%; new characterization tests for analytics, search, stats, and session interruption
- `trail-core`: cognitive complexity reduced to ≤15 in 30+ functions (S3776)
- `trail-core`: boundary-regex bounds tightened to prevent polynomial ReDoS
- `trail-db`: `sessions.repo_name` now derived from JSONL `cwd` field
- `memory-core`: `FIX_COMMITTED_AT` anchored to frontmatter date in E5 test

## [0.21.0] - 2026-05-17

### Added

- `anytime-reverse-spec` skill expanded to chapters 9-11 and now supports `evaluate=true` with Phase E1-E4 to generate evaluation reports for produced spec docs; backed by the new `mcp-trail` tool `evaluate_reverse_spec`
- Prompt popup renders Markdown via the `markdown-core` read-only viewer
- Trail Memory tab: structured bug causal info panel (replaces the prior graph), bug-fix session link with "open in messages" action, Drift sub-tab `Fix Target` column + filter, Drift Type help tooltip listing 11 definitions, Reviews sub-tab UX improvements with session reviewer surfacing
- Trail Commits: cumulative stacked area mode with regression rate
- Memory pipeline panel surfaces "memory backup" runs (memory-core.db backup rotation)
- `trail-server` propagates the `repo` parameter through code-graph and pipeline/refresh routes

### Changed

- Conversation backfill default window extended to 30 days; widening `config.json` `backfillDays` now auto-triggers a re-backfill; `readMessagesSince` streams per session with an incremental heartbeat
- Right axis of the cumulative commits chart swapped from regression rate to fix ratio; pre-window commits folded into the cumulative baseline
- Memory pipeline aggregates runs per (day, scope) for the stacked chart
- `anytime-reverse-spec` template structure stabilized for 02 / 04 / 07 chapters and 05 interface MCP sub-categorization for evaluation use
- `memory-core` review finding parser recognizes Sample 1/2/3 session formats; backfill progress and total are forwarded to `PipelineStatusWriter`

### Fixed

- `memory-core` clears `failed_items` on embedding success
- `memory-core` purge script wrapped in a transaction with a valid reason
- `memory-core` conversation pipeline is reload-safe (mid-run cursor advance removed)
- `memory-core/spec` excludes `90.skill/` from spec ingestion and constrains `caused_by` root causes to concrete entities
- `trail-server` decodes percent-encoded drift event ids in path params
- `trail-viewer` `CombinedDataReader` test mock aligned with current schema

### BREAKING

- Removed the AI Note panel and `anytime-trail.openAiNote*` commands.
  This functionality moved to the new Anytime Agent extension
  (`anytime-trial.anytime-agent`) as `anytime-agent.openAiNote*`.
  Existing notes under `.anytime/notes/` and the `anytime-note` skill
  are reused without any data migration.

### Refactor

- Moved `installBundledSkills` / `installTemplatedSkill` /
  `installStaticSkillDir` and their tests from `vscode-trail-extension`
  to `@anytime-markdown/vscode-common` so the agent extension can
  share the same skill-installer.

### Trail Core (trail-core)

- バージョン同期のみ (ソース変更なし)

## [0.20.0] - 2026-05-16

### Added

- New VS Code command `Anytime Trail: Analyze Code (Pick Tsconfig)` (`anytime-trail.analyzeCurrentCodePickTsconfig`). Exposes the legacy QuickPick tsconfig selection flow for monorepos where the default shallowest pick is not desired. Available from the command palette only (not bound to the dashboard icon)
- New VS Code command `Anytime Trail: Register MCP Server (write .mcp.json)` (`anytime-trail.registerMcpServer`). Adds/updates the `mcpServers.mcp-trail` entry in the workspace root's `.mcp.json` (preserving other server entries), including a `TRAIL_SERVER_URL` env that reflects the current `anytimeTrail.viewer.port` setting. Unparseable JSON is backed up to `.bak.<timestamp>` before recreating (avoiding silent data loss)
- Expanded `DEFAULT_ANALYZE_EXCLUDE_CONTENT` (used by `seedAnalyzeExclude` to create `.anytime/analyze-exclude` on first analyze). Added `.claude/` / `.changeset/` / `.github/` / `.config/` / `.playwright-mcp/` / `.serena/` / `.vscode/` / `__mocks__/` / `demos/` / `dist/` / `**/CHANGELOG.{ja,}.md` / `**/README.{ja,}.md` to match the patterns we keep in our own workspace
- `loadConfig` now **auto-generates `config.json` on disk** when the file is missing (used by both the extension and daemon), giving users an editable starting point. Falls back to in-memory DEFAULT_CONFIG if the write fails
- **Breaking:** New VS Code setting `anytimeTrail.analyzeAll.enabled` (boolean, default `false`). When disabled, the Pipelines tree view is hidden and AnalyzeAllRunner is not constructed (automatic / manual command / HTTP API all become no-ops). Existing users who want to keep auto-runs must set this to `true` and reload the window
- Bundled `anytime-basic-design` skill: installed automatically on activate via the new `installStaticSkillDir` helper
- Bundled `anytime-note` skill as a template: installed via the new `installTemplatedSkill` helper, with agent notes stored under `<workspace>/.anytime/notes`
- Renamed the bundled `anytime-reverse-*` skill family (dirs + content + install helpers wired to the new names)
- Multi-repo `code-graph` support: `trail-server` honors the `repo`/`repoName` parameter across `/api/code-graph` current mode, query/explain/path routes, and pipeline/refresh paths; `CodeGraphService` cache is now per-repo
- `mcp-trail` `list_community_nodes` read tool

### Changed

- `Anytime Trail: Analyze Code` (dashboard icon / command palette) no longer prompts for tsconfig selection when multiple `tsconfig.json` files are found. It auto-selects the shallowest one (workspace root preferred) with an info notification, matching the HTTP / MCP behavior. Use the new `Anytime Trail: Analyze Code (Pick Tsconfig)` command from the command palette to choose a specific tsconfig
- **Breaking:** Default `analyzeAll.runOnStart` flipped from `true` to `false`, and `startupDelaySec` raised from `5` to `30`. AnalyzeAll now requires explicit opt-in
- **Breaking:** Simplified `TrailServerConfig`: removed `scheduler.*` (periodicImport / memoryCore) and `memory.ingest`, and reset `schemaVersion` to `1`. **No migration is performed** from prior schemas — unknown legacy fields are silently ignored and defaults are used. Users with existing configs must either rewrite to the new `analyzeAll.*` shape or delete the file to regenerate DEFAULT_CONFIG
- **Breaking:** Consolidated memory-core pause/resume into AnalyzeAll-level (importAll + memory-core runOnce)
- **Breaking:** Renamed VS Code commands `anytime-trail.memory.{pause,resume,status}Ingest` to `anytime-trail.analyzeAll.{pause,resume,status}` (old commands removed)
- **Breaking:** Renamed HTTP endpoints `/api/memory-core/{pause,resume,status}` to `/api/analyze-all/{pause,resume,status}` (old endpoints removed)
- **Breaking:** Renamed trail-server CLI subcommands `ingest {pause,resume,status}` to `analyze-all {pause,resume,status}` (old subcommand removed)
- Added AnalyzeAllRunner that centralizes importAll → memory-core orchestration, pause/resume, and persistent ticks/lastRunAt/lastError tracking (`<TRAIL_HOME>/analyze-all-runner.json`). `memory-core-runner.json` remains for diagnostics but its paused field is no longer consulted

### Fixed

- Per-character pipe escape in feature-list summary is now forbidden (`anytime-reverse-spec`)
- `anytime-note` skill is installed at activate so users see it on first launch
- `pipeline-status.json` reader / writer kept in sync

### Removed

- **Breaking:** VS Code commands `Anytime Trail: Pause AnalyzeAll Pipeline` (`anytime-trail.analyzeAll.pause`) and `Anytime Trail: Resume AnalyzeAll Pipeline` (`anytime-trail.analyzeAll.resume`). Pause/resume remain available via HTTP API (`POST /api/analyze-all/{pause,resume}`) and `trail-server analyze-all {pause,resume}` CLI for daemon/automation use. `anytime-trail.analyzeAll.status` command stays
- **Breaking:** VS Code command `Anytime Trail: Analyze Release Code` (`anytime-trail.analyzeReleaseCode`). The underlying `runAnalyzeReleaseCodePipeline` and HTTP endpoint (`onAnalyzeReleaseCode` / `mcp-trail`'s `analyze_release_code` tool) remain functional for MCP / automation use
- **Breaking:** VS Code command `Anytime Trail: Register MCP Server to Claude Code (mcp-trail)` (`anytime-trail.registerMcpToClaudeCode`) and its helper `buildClaudeMcpAddCommand`. The clipboard-based `claude mcp add` flow is superseded by the new `Anytime Trail: Register MCP Server (write .mcp.json)` (`anytime-trail.registerMcpServer`) which writes the workspace-level `.mcp.json` directly. Users who registered via the old command can re-run the new one (and optionally `claude mcp remove mcp-trail` to drop the user-scope registration)
- `createAnalyzeAllJob` / `createPeriodicImportJob` (replaced by AnalyzeAllRunner)
- `TrailDataServer.setMemoryCoreService` (AnalyzeAllRunner hosts the service)
- Backward-compatibility shims in trail-server and vscode-trail-extension

### Security

- Hardened regex literals against polynomial backtracking (ReDoS)
- Webview message listeners verify message origin before handling events

### Trail Core (trail-core)

- Expanded `DEFAULT_ANALYZE_EXCLUDE_CONTENT`
- **Breaking:** Agent mapping moved from `trail-core` to the new `agent-core` package
- Hardened regex literals against ReDoS

### Changed

- `Anytime Trail: Analyze Code` (dashboard icon / command palette) no longer prompts for tsconfig selection when multiple `tsconfig.json` files are found. It auto-selects the shallowest one (workspace root preferred) with an info notification, matching the HTTP / MCP behavior. Use the new `Anytime Trail: Analyze Code (Pick Tsconfig)` command from the command palette to choose a specific tsconfig
- **Breaking:** Default `analyzeAll.runOnStart` flipped from `true` to `false`, and `startupDelaySec` raised from `5` to `30`. AnalyzeAll now requires explicit opt-in
- **Breaking:** Simplified `TrailServerConfig`: removed `scheduler.*` (periodicImport / memoryCore) and `memory.ingest`, and reset `schemaVersion` to `1`. **No migration is performed** from prior schemas — unknown legacy fields are silently ignored and defaults are used. Users with existing configs must either rewrite to the new `analyzeAll.*` shape or delete the file to regenerate DEFAULT_CONFIG
- **Breaking:** Consolidated memory-core pause/resume into AnalyzeAll-level (importAll + memory-core runOnce)
- **Breaking:** Renamed VS Code commands `anytime-trail.memory.{pause,resume,status}Ingest` to `anytime-trail.analyzeAll.{pause,resume,status}` (old commands removed)
- **Breaking:** Renamed HTTP endpoints `/api/memory-core/{pause,resume,status}` to `/api/analyze-all/{pause,resume,status}` (old endpoints removed)
- **Breaking:** Renamed trail-server CLI subcommands `ingest {pause,resume,status}` to `analyze-all {pause,resume,status}` (old subcommand removed)
- Added AnalyzeAllRunner that centralizes importAll → memory-core orchestration, pause/resume, and persistent ticks/lastRunAt/lastError tracking (`<TRAIL_HOME>/analyze-all-runner.json`). `memory-core-runner.json` remains for diagnostics but its paused field is no longer consulted

### Removed

- **Breaking:** VS Code commands `Anytime Trail: Pause AnalyzeAll Pipeline` (`anytime-trail.analyzeAll.pause`) and `Anytime Trail: Resume AnalyzeAll Pipeline` (`anytime-trail.analyzeAll.resume`). Pause/resume remain available via HTTP API (`POST /api/analyze-all/{pause,resume}`) and `trail-server analyze-all {pause,resume}` CLI for daemon/automation use. `anytime-trail.analyzeAll.status` command stays
- **Breaking:** VS Code command `Anytime Trail: Analyze Release Code` (`anytime-trail.analyzeReleaseCode`). The underlying `runAnalyzeReleaseCodePipeline` and HTTP endpoint (`onAnalyzeReleaseCode` / `mcp-trail`'s `analyze_release_code` tool) remain functional for MCP / automation use
- **Breaking:** VS Code command `Anytime Trail: Register MCP Server to Claude Code (mcp-trail)` (`anytime-trail.registerMcpToClaudeCode`) and its helper `buildClaudeMcpAddCommand`. The clipboard-based `claude mcp add` flow is superseded by the new `Anytime Trail: Register MCP Server (write .mcp.json)` (`anytime-trail.registerMcpServer`) which writes the workspace-level `.mcp.json` directly. Users who registered via the old command can re-run the new one (and optionally `claude mcp remove mcp-trail` to drop the user-scope registration)
- `createAnalyzeAllJob` / `createPeriodicImportJob` (replaced by AnalyzeAllRunner)
- `TrailDataServer.setMemoryCoreService` (AnalyzeAllRunner hosts the service)

## [0.19.0] - 2026-05-15

### Changed

- **Breaking:** Workspace config folder renamed from `.trail/` to `.anytime/`. Affected files: `analyze-exclude` / `dead-code-ignore` / `commit-categories.json` / `tool-categories.json` / `skill-categories.json` / `anytime-history.json`. Existing workspaces must manually rename `.trail/` to `.anytime/`
- **Breaking:** Default storage location for `trail.db`, Claude Code status files, and trace output changed from `.vscode/` to `.anytime/`. Affects empty default of `anytimeTrail.database.storagePath`, the default value of `anytimeTrail.claudeStatus.directory` (`.vscode/trail/agent-status` → `.anytime/trail/agent-status`), and trace output (`.vscode/trace` → `.anytime/trace`). Existing setups must override settings or manually relocate
- **Breaking:** Default `memory-core.db` location changed from `~/.claude/memory-core/memory-core.db` to `<workspaceRoot>/.anytime/db/memory-core.db`. The `MEMORY_CORE_DB_PATH` environment variable still takes precedence. Existing databases must be manually copied/moved
- **Breaking:** Default `TRAIL_HOME` changed from `~/.claude/trail` to `<workspaceRoot>/.anytime/trail`. `config.json` / `daemon.json` / `daemon.lock` / `memory-core-runner.json` / `pipeline-status.json` / `logs/` / `db/` all move to the new directory. The `TRAIL_HOME` environment variable still takes precedence. Existing `config.json` must be manually copied
- **Breaking:** Consolidated all runtime artifacts under `${TRAIL_HOME}`. `anytimeTrail.database.storagePath` default changed from `.anytime/db` to `.anytime/trail/db` (`${TRAIL_HOME}/db`). memory-core.db, pipeline-status.json, trace output, and hook state (session-guard / git-state) all live under `${TRAIL_HOME}/`. `.anytime-trail/metrics-thresholds.yaml` unified to `.anytime/metrics-thresholds.yaml`
- Removed `*_DB_PATH` env vars and dead `opts.dbPath` override
- `DaemonClient` now receives `workspaceRoot` explicitly; status file reads share the writer's path resolution

### Fixed

- `pipeline-status.json` reader aligned with the writer
- VS Code extensions removed `sql.js` and rely on native sqlite (Phase 4)

### Trail Core (trail-core)

- `TRAIL_HOME` 集約 — 共有 `getTrailHome` で trail 関連ストレージを解決
- `trail-db` の既定 DB ディレクトリを `<cwd>/.anytime/trail` に変更、`.anytime` を `SNAPSHOT_SKIP_DIRS` に追加
- `mcp-trail` / `memory-core` / `trail-server` を `TRAIL_HOME` 既定に整列、memory-core のフォールバック先を厳格化
- `saveCurrentGraph` の OOM 回避のため sql.js を WASM に切替

## [0.18.0] - 2026-05-08

### Fixed

- `collectAllRelFilePaths` now correctly restores CodeGraph node file extensions to `.ts`/`.tsx`
- `CodeGraphService.runAnalyze` now respects `analyze-exclude` patterns
- Importance analyzer now respects `analyze-exclude` patterns
- Extension webpack config now includes `extensionAlias` for correct TypeScript path resolution
- `noRecentChurn` recent window shortened from 90 to 30 days
- TypeScript `moduleResolution` changed to `bundler` in tsconfig

### Changed

- `.trail/analyze-exclude` is now interpreted as `.gitignore`-compatible. The auto-wrap `**/<pattern>/**` in `AnalyzePipeline` is removed; users can write `!` negation and `/dist`-style root-anchored patterns directly. `GraphDetector` now accepts an `ignore` instance
- `computeAndPersistImportance` now receives the `analyze-exclude` `Ignore` instance and applies exclusion to every SourceFile, making patterns like `__tests__/` propagate to importance analysis consistently

### Trail Core (trail-core)

- `.trail/analyze-exclude` now uses `.gitignore`-compatible syntax; `AnalyzeOptions.exclude` type changed from `string[]` to `Ignore`
- `analyze()` now shares `ts.Program` with `ImportanceAnalyzer`
- `mapFileToC4Elements` absolute path matching fixed
- `ProjectAnalyzer.getSourceFiles` now excludes `.d.ts` files
- SQLite schema: ISO 8601 + Z CHECK constraints and unified index naming added

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
