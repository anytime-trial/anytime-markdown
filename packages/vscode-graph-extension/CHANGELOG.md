# Change Log

All notable changes to the "Anytime Graph" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.1.4] - 2026-04-12

### Graph Core (graph-core)

- Fix `.gitignore` pattern that inadvertently excluded `trail-core/src/c4/coverage/` source files from version control

## [0.1.2] - 2026-04-11

### Graph Core (graph-core)

- Reduce cognitive complexity across rendering pipeline and layout algorithms (SonarCloud S3776)
- Fix SonarCloud issues: S125, S1854, S6582, S2871, S1871, S7781
- Add unit tests for drawEdge in edgeRenderer

## [0.1.0] - 2026-04-04

### Added

- TypeScript analysis with Trail Webview panel
- tsconfig selection, export, bidirectional sync, filter and layout UI

### Changed

- Improve GraphCanvas rendering with updated shape and edge renderers
- Update canvas interaction handling for orthogonal routing support

### Graph Core (graph-core)

- Mermaid diagram import with mermaidParser
- Hierarchical layout engine and orthogonal edge routing
- Frame collapse/expand and waypoint editing
- Straight routing mode and parallel connector offsets
- Bottom-up subgraph layout and nested frame support

## [0.0.3] - 2026-04-01

### Added

- Integrate data mapping, filter, path highlight, and detail panel

### Security

- Add postMessage origin verification for VS Code webview handlers

### Graph Core (graph-core)

- Add metadata to GraphNode and weight to GraphEdge
- Add data mapping utilities, graph traversal, batch import, node filter, path highlight
- Preserve metadata and weight in Draw.io and SVG export

## [0.0.2] - 2026-03-29

### Changed
- Updated Marketplace images

### Graph Core (graph-core)
- Fixed SonarCloud minor and major issues

## [0.0.1] - 2026-03-27

Initial release. Graph editor extracted from Anytime Markdown extension.

### Added

**Editor**
- Visual node-graph editor with custom editor for `*.graph` files
- Create nodes, edges, and labels on a canvas
- Start text editing by typing when a node is selected
- Dark/light theme support with theme-aware colors
- Settings panel with theme and language switching

**Layout**
- Physics-based layout (force-directed, Fruchterman-Reingold)
- VPSC constraint-based overlap removal
- Auto-spread connected nodes for readable layouts

**Shapes**
- Shape tool with rectangle, ellipse, diamond, and more
- Shape hover bar for quick actions (hidden for non-basic shapes)
- Drag-time collision detection

**Commands**
- `Anytime Graph: New Graph` to create a new graph file

### Graph Core (graph-core)
- 10 node types (rect, ellipse, diamond, parallelogram, cylinder, sticky, text, doc, frame, image)
- 3 edge types (line, arrow, connector) + orthogonal connectors (A* obstacle avoidance) + Bezier curves
- Smart guides, grid snap, node alignment and distribution
- Viewport (pan, zoom 0.1-10x, fit-to-content)
- Undo/Redo (selection state preservation, max 50 history entries)
- SVG export, draw.io XML export/import
- Accessibility (ARIA roles, keyboard navigation, prefers-reduced-motion)
