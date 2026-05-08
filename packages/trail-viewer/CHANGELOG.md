# Changelog

All notable changes to `@anytime-markdown/trail-viewer` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.16.0] - 2026-05-08

### Added

- C4 overlay legend: discrete segment bars for coverage, importance, defect-risk, dead-code, DSM-cyclic, and size metrics
- C4 overlay legend: gradient horizontal bar for coverage (3-color continuous)
- C4 overlay legend: boundary labels for size threshold markers; maximum value on left, 0 on right
- C4 overlay legend: values increase left-to-right consistently across all overlay types
- C4 overlay legend: `?` icon with help tooltip for each overlay type
- Hotspot: churn metric added to popup; defect-risk/hotspot gates removed
- Element tree search box: clear icon
- Message tab filter: unified width with C4 model filter; clear button added
- Overlay selector: repository dropdown sorted ascending
- Overlay selector: data-independent overlays disabled until data is available; DSM overlay selected by default

### Fixed

- Hotspot overlay legend not displaying
- MetricsReader materialized view query URL length overflow workaround

### Changed

- MatrixPanel: DSM view removed; popup metrics realigned with overlay metrics
- Hotspot: `subagent` granularity option removed

## [0.15.0] - 2026-05-04

### Added

- C4 popup: resizable and maximizable for Matrix/Graph panels
- C4 popup: metrics grouped into size / quality / structure sections
- Graph/matrix popups in C4 element panel; community graph icon
- Overlay selector redesigned as two-level category + sub-item selects
- MatrixPanel: community color-coding toggle
- C4 Sequence sub-tab wired from context menu to TRACE tab
- `useCodeGraph` now supports release and repo options

### Fixed

- Community now shown for code (C4) elements in info panel
- HotspotControls popup hidden when no commit data available
- Hotspot shows "-" indicator when no commits exist
- Overlay sub-select disabled when data not yet fetched
- Overlay selection reset on repository switch
- Empty entries in coverage/DSM/complexity matrices treated as no-data
- Hotspot/defect-risk APIs made repository-dependent
- C4 context menu uses domain type instead of graph render type

### Changed

- C4 level labels renamed from L1-L4 to C1-C4
- Hotspot controls moved from top toolbar into C4 settings popup
- Temporal Coupling control shared between C4 and CodeGraph panels
- Session/daily token display removed
- `TraceTimeline` renamed to `MessageTimeline`
- 30 orphaned i18n keys removed; tab label keys unified under `viewer.tab.*`
- `viewer.tab.c4` renamed to `viewer.tab.model`
- `trace.*` i18n keys merged into `message.*`

## [0.14.0] - 2026-05-03

### Added

- F-cMap overlay on C4 graph nodes
- Matrix panel: DSM L4 (Code level)
- Matrix panel: Cov L3/L4 with Component/Package/Code level switching
- Cov view: complexity, defect count, LOC, and commit count columns
- Cov view: community label colors and coverage coloring
- DSM: community color fill in label cells
- Breadcrumb ancestor labels for Cov L3/L4 row headers
- Ctrl+click multi-select for C4 elements
- L4 element function list in right-side popup
- L4 "Open file" context menu item
- Trace tab with TraceViewer integration
- Overlay legend moved into C4 popup
- Step count display in model tab element popup

### Fixed

- DSM L4 aggregates from C4 code elements instead of raw files
- Complexity column shows `totalCount` numeric value
- Cov view numeric columns right-aligned
- Drill Down clears selection state
- Column header 90° rotation restricted to DSM view only
- SpreadsheetGrid `showHeaderRow` disabled in Matrix panel
- Matrix panel Sheet wrapper uses `display:flex` for proper scrolling
- Space pan and Ctrl+click multi-select interaction fixed

### Changed

- Matrix view button order: Cov / DSM / F-cMap
- Level buttons use L2/L3/L4 notation (was C2/C3)
- DSM and Cov share a unified level state
- C4 tab label changed to "C4 Model"
- Matrix toolbar hidden in SpreadsheetGrid
- Pan/zoom: Shift+wheel required for zoom (reverted from plain wheel)
- Removed duplicate logic and unused code in trail-viewer components

### Removed

- Heatmap view from MatrixPanel
- DSM metrics from element selection popup
- Defect risk display from CodeGraphPanel
- Reload button from CodeGraphPanel
- Subagent mode display from Heatmap

## [0.13.0] - 2026-05-02

### Added

- URL parameter `?tab=` for initial tab selection on page load
- URL parameter `?c4level=` for initial C4 hierarchy level on page load
- Auto-select first session when opening Traces tab via URL
- Help tooltips on metric cards, chart toggles, and pie chart titles
- Dim unrelated C4 graph elements when a node is focused

### Fixed

- Left-align metric label, center-align value, place unit text right of value in `CyclingCard`
- Unify card height to align values vertically across cards
- Allow empty `serverUrl` in `useTemporalCoupling`
- Extend message read window up to 90 days
- Add `sectionBg` token to `ThemeColors` used by `PromptManager`
- Fix test mock to include `range` method and `trail_current_coverage` handler

## [0.12.0] - 2026-04-28

### Added

- Added Code Graph tab and panel UI in Trail viewer
- Added `CodeGraphCanvas` (sigma.js) and `useCodeGraph` hook for graph visualization

### Fixed

- Deferred sigma initialization until container dimensions are available
- Tolerated invalid x/y coordinates in code graph rendering path

## [0.11.0] - 2026-04-26

### Added

- Timing Breakdown chart showing API inference time and tool execution time per turn
- Tool/Skill mode toggle on Session Timeline to switch chart focus
- Tool usage token bars on Session Timeline (right y-axis)
- Commit and error reference lines spanning all charts in Session Timeline
- TurnLaneChart below Session Timeline with model/tool stripes and skill stripe per turn
- Dynamic timeline height based on sub-agent track count; scrollbar added for 5+ sub-agents
- Sub-agent lane per agent with dominant-tool coloring (replacing individual tool rows)
- Error inverted triangle markers with hover tooltips
- Commit triangle markers with timestamp-based fallback detection
- Tool names shown in sub-agent timeline tooltip
- Tokens, cost, messages, and error count in session Usage card
- DORA metrics as individual expandable overview cards
- Total count displayed in center of Error/CommitType pie charts

### Changed

- Merged 3-chart layout into single stacked Session Timeline (renamed from Session Cache Timeline)
- X-axes aligned across all charts with reference lines spanning the full width
- Error/CommitType bar charts replaced with side-by-side pie charts
- Model bar replaced with thin model-color stripe per lane in TurnLaneChart
- SessionCacheTimeline moved below session list for full-width display
- Session Usage/Productivity card metrics reorganized; Total Commits / Lines Added moved to Usage card
- DORA metrics expanded into individual cards; Lines Added renamed to Total LOC
- Consecutive same-model/tool runs merged into single rect in TurnLaneChart
- Skill bar height set to 8px, rendered as separate row below tool/model bar

### Removed

- `SessionModelUsageChart` from day summary view
- Quality Metrics tab
- Quality and Productivity aggregate cards from OverviewCards
- Related Commits table from session detail
- Model usage chart from session detail
- Cache Hit Rate from Usage overview cards
- Cumulative Inference from Session Timeline token chart

### Fixed

- Skill stripe now visible in TurnLaneChart
- Dashed reference lines clipped at X-axis and anchored to chart top
- Y-axis widths set explicitly to keep all chart X-axes aligned
- Commit prefix regex corrected; session_commits hash fallback added
- Loading spinner shown in DailySessionList while sessions are loading
- `sessionsLoading` isolated from `loadSession` loading state

### Performance

- Removed heavy `trail_message_tool_calls` and `trail_session_commits` queries from `getSessions`

## [0.10.0] - 2026-04-25

### Added

- Stacked Release Quality chart on Activity tab
- Release toggle and Deployment Frequency bar chart on Activity tab
- Lead Time bars stacked by commit prefix with toggle
- Commits / LOC toggle on Activity commits chart
- Per-session commit-prefix chart in drilldown panel
- Commit-prefix stacked chart on Activity tab
- Overlay Tokens/LOC or Cost/LOC line on `DailyActivityChart`
- AI first-try success rate line overlay on commits chart
- Show productivity thresholds dialog
- Format `minPerLoc` and `tokensPerLoc` in `MetricCard`
- Show unmapped commit count in Lead Time tooltip
- Show dated x-axis on quality metric charts

### Changed

- Rename viewer tabs to "activity" and "messages"
- Replace `leadTimeForChanges` with `leadTimePerLoc` / `tokensPerLoc` labels (i18n)
- Adapt Supabase reader to new metric input shape
- i18n: localize thresholds dialog metric column header
- Refactor `DeltaBadge` nested ternaries to helper functions

### Fixed

- Show spinner while Release chart fetches quality metrics
- Extract `Intl.DateTimeFormat` instance outside render loop
- Wire `fetchQualityMetrics` to `AnalyticsPanel`

### Performance

- Skip quality metrics fetch while on Release chart
- Add dedicated deployment-frequency endpoint for Release chart

## [0.7.0] - 2026-04-18

### Added

- Show day-aggregate charts in Analytics date panel right column
- Add design tokens: `amberGoldHover`, `iceBlueBorder`, skill chart color, `toolPalette`, `commitColors`

### Changed

- Rename `Behavior*` to `Combined*` to align with Analytics UI naming
- Apply `scrollbarSx` to all scrollable areas
- Remove model column from session list table
- Remove cache timeline from day-aggregate panel

### Fixed

- Fetch day tool metrics from `trail_daily_counts` for Analytics date panel
- Correct light-mode token values for bg, semantics, disabled text
- Replace hardcoded `TOOL_COLORS` and cost chart colors with design tokens
- Replace hardcoded commit type colors with `commitColors` tokens
- Replace hardcoded CTA hover color with `amberGoldHover` token
- Tokenize user message border and upgrade focus ring to 3px (WCAG 2.2)
- Migrate `getAnalytics` / `getCostOptimization` to `trail_daily_counts`

### Performance

- Replace `getBehaviorData` mass-fetch with `trail_daily_counts` SELECT

## [0.4.0] - 2026-04-13

### Added

- Jump from analytics session row to traces tab
- Plot cumulative inference time on session cache timeline
- Repository selector replaces branch/model filters

### Changed

- Extract `TrailViewerApp` as shared wrapper component (used by both VS Code extension and web app)
- Remove local mode from `useC4DataSource`
- Remove dead Supabase dual-mode from `useTrailDataSource`

### Fixed

- Apply search text and repository filter client-side correctly

## [0.3.1] - 2026-04-12

### Fixed

- Fix `.gitignore` pattern that inadvertently excluded `trail-core/src/c4/coverage/` source files from version control

## [0.3.0] - 2026-04-12

### Added

- Merged `c4-viewer` package and `C4DataServer` into `trail-viewer`
- Releases tab in `TrailViewerCore`
- `ReleasesPanel` component with releases data fetching
- i18n infrastructure with ja/en translation maps
- `NEXT_PUBLIC_SHOW_LIMITED` env var to restrict analytics and traces display
- `NEXT_PUBLIC_SHOW_90D_PERIOD` env var to hide 90D period selector
- Release panel (160px) wired through `TrailPanel` to `C4ViewerCore`
- `releases` and `selectedRelease` to `useC4DataSource`
- Scrollbar token and scrollable areas in `AnalyticsPanel`
- Session list height fixed (726px when selected, maxHeight otherwise)
- `SessionCommitList` moved to right column below timeline
- Lines added/deleted display in session list Commits column
- All 4 token types shown in session list with init→peak context tokens

### Changed

- Side-by-side layout breakpoint changed from `md` to `lg` (1200px)
- Right column widened to 600px
- `SessionCommitList` scrolls after 5 rows
- Cost by Period merged into `DailyActivityChart` Cost mode
- Cost graphs simplified to Current/Optimized
- Close buttons removed from `SessionCacheTimeline`, `SessionCommitList`, `DailySessionList`
- `SHOW_LIMITED` renamed to `SHOW_UNLIMITED` with inverted logic
- `SupabaseTrailReader` updated for `release_files`/`release_features`
- C4 data HTTP/WS double fetch removed; initial fetch restored via HTTP

### Fixed

- `SessionCommitList` height when no commits found
- `CyclingCard` key and alignment fixes
- `getCostOptimization` added to `SupabaseTrailReader`

### Accessibility

- WCAG 2.2 AA quick win and short-term fixes applied

## [0.2.1] - 2026-04-11

### Added

- Cost optimization section in Analytics tab
- Cost optimizer classification engine and rules configuration
- Model pricing constants and cost calculator
- Cost optimization types and data fetching API

### Fixed

- Session filter for date selection corrected to local timezone basis

## [0.2.0] - 2026-04-09

### Added

- Supabase remote data source integration via `SupabaseTrailReader`
- `ITrailReader` interface for remote data access abstraction
- Session interruption detection with context token display
- Tool calls parsing for Retry/Build/Test fail metrics
- Session efficiency metrics (12 metrics panel, overview cards expansion)
- Token efficiency cards (Tokens/Step, Cost/Step)
- Session-commit correlation with `SessionCommitList` component
- Session cache timeline and peak context column
- MUI X Charts integration for Analytics (cost toggle, period selector, session drill-down)
- Init Context column and batch context stats query

### Changed

- Apply Anytime Trial design system with dark/light mode support

### Fixed

- Remove timestamp from system messages and trace message bubbles

## [0.1.0] - 2026-04-08

### Added

- Initial release: Claude Code conversation trace visualization package
- JSONL session parser with message tree builder
- LINE-style chat bubble UI for messages
- Session list with filter bar (branch, model, date range)
- Trace tree with collapsible message hierarchy
- Tool call detail display
- Stats bar with token usage aggregation
- Claude Code version and model display
- Conversation turn dividers
- Evaluation panel (v1.1)
- Prompt management panel (v1.1)
- Analytics tab with cost estimation and tool usage statistics
- `useTrailDataSource` hook for data source abstraction
- Theme-aware styling for light/dark mode
