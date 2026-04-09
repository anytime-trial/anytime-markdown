# Changelog

All notable changes to `@anytime-markdown/trail-viewer` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

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
