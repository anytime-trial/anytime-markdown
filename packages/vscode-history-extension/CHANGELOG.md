# Change Log

All notable changes to the "Anytime History" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.2.2] - 2026-05-17

### Changed

- Version bump only (no functional changes since 0.2.1)

## [0.2.1] - 2026-05-16

### Fixed

- Editing tabs are no longer force-closed on commit / save

## [0.2.0] - 2026-05-15

### Added

- Async `gitExec` helper to centralize git invocations off the Extension Host event loop

### Changed

- **Breaking:** SpecDocs storage path moved from `.vscode/history/` to `.trail/` (now consolidated under `.anytime/`)
- Configuration folder default renamed from `.trail` to `.anytime`
- VS Code extensions removed `sql.js` and now run on native sqlite (Phase 4)
- `GitOperations`, `GitStatusParser`, `ChangesProvider`, `GraphProvider`, `SpecDocsGitOps`, `changesCommands`, and auto-open-on-git-roots converted to async to keep the Extension Host responsive
- `OutputChannel` name unified to `Anytime History`

### Fixed

- Spec import paths and `DbLogger` interface alignment
- Avoided `navigator` access in node bundles

## [0.1.0] - 2026-05-04

### Added

- Database panel for trail DB inspection (Phase 2)

### Fixed

- Resolved duplicate VS Code configuration registration warning for DB sync settings

### Changed

- Migrated `TimelineProvider` to `vscode-common` package for shared use

## [0.0.1] - 2026-04-12

### Changed

- Renamed extension from Anytime Git (`anytime-git`) to Anytime History (`anytime-history`) to resolve VS Code Marketplace name conflict

## [0.1.1] - 2026-04-11

### Added

- README, CHANGELOG, and LICENSE files
- Moved git history from Trail extension to this package

## [0.1.0] - 2026-04-11

### Added

- Repository panel with file tree, folder open, and repository clone
- Branch switching from the repository tree
- File operations: new file, new folder, rename, delete, import, cut/copy/paste
- Markdown-only filter toggle for the repository tree
- Changes panel with staged/unstaged file grouping and inline badge
- Stage, unstage, discard per file and for all changes at once
- Commit and push from the Changes panel
- Graph panel with ASCII commit graph
- Timeline panel with per-file commit history and diff comparison
