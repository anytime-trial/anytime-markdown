# Changelog

All notable changes to the "graph-core" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.0] - 2026-06-08

### Changed

- Removed `@mui` from `MinimapCanvas`, deriving canvas colors from the in-house color system (MUI reduction Phase 3e).

## [0.4.1] - 2026-05-27

### Changed

- SonarCloud code quality improvements: reduced cognitive complexity (S3776) and mechanical safe fixes. No functional changes.

## [0.4.0] - 2026-05-24

### Added

- Added read-only `GraphView` (`./viewer` subpath) for vanilla embed consumers
- Added radial mindmap layout
- Added rooted tree layout (hierarchical layout with `rootId` support)
- Added collapsible subtrees to the read-only viewer (click connector endpoint to collapse; hover to show -/+ toggle)
- Added overview minimap to the read-only viewer (aligned with trail-viewer `MinimapCanvas`)
- Added opt-in node selection and drag-move to the read-only viewer

### Fixed

- Corrected wheel zoom in `GraphView` and preserved viewport on resize
- Converted pointer coordinates to canvas backing px, fixing hit-test / pan / zoom misalignment on DPR > 1

### Changed

- Extracted `resolveEdgesForRender` into the engine to deduplicate adjacency building and achieve O(1) node lookup

## [0.3.4] - 2026-05-21

### Changed

- Resolved SonarCloud findings across `graph-core` (S7769, S7735, S7748, S107, and others)
- Improved pure-logic unit-test coverage (`reducer`, `groupClustering`, and others to 100%)

## [0.3.3] - 2026-05-20

### Changed

- Extracted `deleteGroupsContainingSelection` helper from `useCanvasBase` to reduce cognitive complexity (S3776)

## [0.3.2] - 2026-05-17

### Changed

- Version bump only (no functional changes since 0.3.1)

## [0.3.1] - 2026-05-15

### Changed

- Test coverage added for culling / shape / drawHelpers paths without a real canvas

## [0.3.0] - 2026-05-04

### Added

- `fragment` shape for sequence diagram fragments

### Fixed

- React component props wrapped in `Readonly` (Sonar S6759)
- Removed unnecessary type assertions (Sonar S4325)
- Replaced array-index keys with stable composite keys (Sonar S6479)
- Replaced global `parseInt` with `Number.parseInt` (Sonar S7773)

### Changed

- Split `handleKeyDown` into per-category handlers to reduce cognitive complexity (Sonar S3776)
- Split `handleMouseDown` into per-mode helpers (Sonar S3776)
- Extracted layer helpers from `assignCoordinates` in physics (Sonar S3776)
- Extracted helpers from `computeVisibleElements`, `findShortestPath`, `findBestSnap` in engine (Sonar S3776)
- Table-driven optional drawio node style parts; collapsed `buildNodeStyle` ternary chains (Sonar S3776)
- Preferred `globalThis.localStorage` over `window.localStorage` (Sonar S7764)

## [0.2.3] - 2026-05-03

### Added

- `onNodeCtrlClick` callback option for Ctrl+click multi-select toggle
- `wheelRequiresShift` option to require Shift key for wheel zoom

## [0.2.2] - 2026-05-02

### Added

- Dim unrelated elements in the graph when a node is selected

### Fixed

- Move `MinimapCanvas` above the left-side control panel
- Order minimap controls
- Move fit control into minimap

## [0.2.1] - 2026-04-24

### Added

- Tests for `splitManualTopBottom`, `packGroupMembers`, and nested frame layout

## [0.2.0] - 2026-04-23

### Added

- `MinimapCanvas` component: overview minimap with viewport drag-to-pan and zoom in/out buttons
- Exported `MinimapCanvas` from package index
- Frame Z-behavior: `hitTestFrameBody` and node drag inside frames in `useCanvasBase`

### Changed

- `LIGHT_COLORS` aligned with sumi-e design system palette

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
