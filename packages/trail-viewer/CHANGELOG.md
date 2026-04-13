# Changelog

All notable changes to `@anytime-markdown/trail-viewer` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

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
