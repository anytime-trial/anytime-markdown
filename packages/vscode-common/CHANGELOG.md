# Changelog

All notable changes to `@anytime-markdown/vscode-common` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- `registerMcpServerInMcpJson`: registration is now a freshness-checked reconcile instead of a write-if-absent, so stale entries written by older extension versions are refreshed.
- `mergeMcpJson`: reconciliation now performs a field-level update instead of replacing the whole server entry, preserving user-added fields (e.g. `cwd`) that the generated shape does not know about.

## [0.1.2] - 2026-05-04

### Added

- `TimelineProvider` migrated from `vscode-history-extension` for shared use
- `jstDateString` helper extracted for JST date formatting

### Fixed

- Today-stats efficiency improvement

## [0.1.1] - 2026-04-18

### Added

- Multi-file `ClaudeStatusWatcher` with agent map support
- Session-ID based status files with branch field
- `AgentInfo` type for multi-agent tracking
- Plan file hook to write `plannedEdits` on Write events
- `getPlannedEdits()` to `ClaudeStatusWatcher`
- `plannedEdits` field to `ClaudeStatus`
- Persist session edit history in `claude-code-status.json`

### Fixed

- Fix `ClaudeStatus` cast via `unknown` to resolve TS2352
- Replace `jq` with `node` in claude hook commands

## [0.1.0] - 2026-04-13

### Added

- Initial release: `ClaudeStatusWatcher` for VS Code extensions
