# Changelog

All notable changes to the "c4-viewer" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.2.0] - 2026-04-07

### Added

- `C4ViewerCore` shared component extracted from web-app
- Dark/light mode support with design system theme
- Coverage heatmap mode in GraphCanvas
- `CoverageCanvas` matrix component
- Coverage diff display integration
- Feature-Component Map (F-C Map) view with column filtering by C4 level
- Checkbox filtering for element tree panel (cascade, check all/uncheck all)
- Document links in element tree panel
- Deleted elements display with strikethrough and transparency in DSM
- DSM scope border highlight (replacing scope filtering)

### Changed

- Toolbar restructured: DSM/F-C Map/Coverage/Cluster/Fit moved to panel-local toolbars
- C4/Matrix toggle changed to focus/unfocus behavior

### Fixed

- Edges rendering inside node rectangles
- setState during render in C4ElementTree
- Viewport centering only on tree panel selection, not canvas click
