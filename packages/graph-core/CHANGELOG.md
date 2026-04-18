# Changelog

All notable changes to the "graph-core" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.5] - 2026-04-18

### Added

- Add `onNodeContextMenu` callback to `useCanvasBase` for context menu support
- Show dot at connector start point

### Fixed

- Include frame nodes in context menu hit test
- Reduce connector start dot radius from 5 to 3

### Changed

- Break circular dependency between `shapes` and `shapeRenderers`

## [0.1.4] - 2026-04-12

### Fixed

- Fix `.gitignore` pattern that inadvertently excluded `trail-core/src/c4/coverage/` source files from version control

## [0.1.3] - 2026-04-12

### Changed

- Added `json-summary` to jest `coverageReporters` for E2E coverage integration

## [0.1.2] - 2026-04-11

### Added

- Unit tests for drawEdge in edgeRenderer

### Changed

- Reduce cognitive complexity in renderer.ts, textRendering.ts, hitTest.ts, smartGuide.ts (SonarCloud S3776)
- Reduce cognitive complexity in importDrawio.ts, importMermaid.ts, exportDrawio.ts (SonarCloud S3776)
- Reduce cognitive complexity in visibilityGraph.ts, vpsc.ts, resolveAllCollisions.ts, parseEdge.ts (SonarCloud S3776)
- Reduce cognitive complexity in findShortestPath.ts, hierarchical layout, PhysicsEngine, drawEdge (SonarCloud S3776)
- Fix SonarCloud issues: remove commented-out code (S125), remove unnecessary assignments (S1854), optional chaining (S6582), localeCompare for sort (S2871), consolidate duplicate branches (S1871), use replaceAll (S7781)

## [0.1.1] - 2026-04-07

### Added

- Person shape support for graph nodes
- `useCanvasBase` hook extracted for shared graph operations
- Editor key bindings in useCanvasBase

### Changed

- Wheel behavior: Shift+wheel for zoom, wheel for scroll in matrices

### Fixed

- Type errors in useCanvasBase (SELECT_RECT_COLORS / CanvasColors mismatch)
- SonarCloud issues (S1854, S6557, S4624, S6481, S3358, S6582)

## [0.1.0] - 2026-04-04

### Added

- Mermaid diagram import with mermaidParser for flowchart/sequence/class/state diagrams
- Hierarchical physics layout engine for layered graph visualization
- Orthogonal edge routing with visibility graph algorithm
- Frame collapse support for expandable/collapsible node groups
- Waypoint support for manual edge path adjustment
- Straight routing mode for connector edges
- Parallel connector path offset between same node pair
- Bottom-up subgraph layout for mermaid import
- Nested frame layout in layoutWithSubgroups
- Detour path when connector endpoints overlap

### Changed

- Split shapes.ts into shapeRenderers and textRendering modules
- Extract orthogonalRouter from visibilityGraph for separation of concerns
- Extract draw helpers from overlays
- Extract magic numbers to constants
- Replace pathfinding module with visibilityGraph-based orthogonal routing
- Remove obstacle avoidance from connector routing
- Remove 'arrow' from EdgeType

### Fixed

- Deflect bezier control points perpendicular to edge side
- Center-symmetric offset for parallel connector endpoints
- Adapt layer spacing to node height in hierarchical layout

## [0.0.3] - 2026-04-01

### Added

- Add metadata to GraphNode and weight to GraphEdge
- Add linearScale and interpolateColor utilities for data mapping
- Preserve metadata and weight in Draw.io and SVG export
- Add graph traversal, batch import, and node filter
- Add path highlight and filter panel

### Fixed

- Fix readonly type mismatch in resolveConnectorEndpoints and RenderOptions

## [0.0.2] - 2026-03-29

### Fixed
- SonarCloud minor issues resolved
- SonarCloud major issues resolved

## [0.0.1] - 2026-03-27

Initial release.

### Added

**Nodes**
- 10 node types: rect, ellipse, diamond, parallelogram, cylinder, sticky, text, doc, frame, image
- Frame node for visual grouping
- Node locking and z-index layer ordering
- Drag-and-drop image placement
- Node URL hyperlinks
- Text overflow clipping with ellipsis

**Edges**
- 3 edge types: line, arrow, connector
- Orthogonal connectors with A* obstacle avoidance routing (binary heap open set)
- Bezier curve edges with manual control points
- Edge labels and configurable endpoint shapes (arrow, circle, diamond, bar)
- Extra connection points customization

**Canvas**
- Smart guides with snap-to-alignment
- Grid snap for nodes and resize
- Node alignment (left, right, top, bottom, center) and distribution
- Viewport: pan, zoom (0.1-10x), fit-to-content with animated easeOutCubic easing
- Viewport culling for rendering performance
- Undo/redo with selection state preservation (max 50 history entries)
- Shape hover bar for quick actions on selected nodes
- Drag-time collision detection
- Dark/light theme support with theme-aware rendering

**Layout**
- Physics-based layout (force-directed, Fruchterman-Reingold algorithms)
- VPSC constraint-based overlap removal
- Auto-spread connected nodes for readable layouts

**Export / Import**
- SVG export with support for all node types and gradients
- draw.io XML export/import (xmldom compatible for Node.js)

**Accessibility**
- Canvas ARIA role, labels, and live status region
- Arrow key navigation for node movement
- Color palette keyboard navigation with ARIA roles
- PropertyPanel control labels
- prefers-reduced-motion support for animations
- aria-live announcements for node add/delete
