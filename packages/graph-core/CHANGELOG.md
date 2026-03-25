# Changelog

All notable changes to the "graph-core" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.8.0] - 2026-03-25

### Added
- 11 node types: rect, ellipse, diamond, parallelogram, cylinder, sticky, text, insight, doc, frame, image
- 3 edge types: line, arrow, connector
- Orthogonal connectors with A* obstacle avoidance routing
- Bezier curve edges with manual control points
- SVG export with support for all node types and gradients
- draw.io XML export/import (xmldom compatible for Node.js)
- Smart guides with snap-to-alignment
- Grid snap for nodes and resize
- Node alignment (left, right, top, bottom, center) and distribution
- Viewport: pan, zoom (0.1-10x), fit-to-content
- Animated zoom with easeOutCubic easing
- Viewport culling for rendering performance
- Frame node for visual grouping
- Node locking and z-index layer ordering
- Drag-and-drop image placement
- Node URL hyperlinks
- Edge labels and configurable endpoint shapes (arrow, circle, diamond, bar)
- Extra connection points customization
- Undo/redo with selection state preservation (max 50 history entries)
- MCP Server: `mcp-graph` package with 12 tools (CRUD, export/import, node/edge operations)

### Changed
- Optimized wrapText with word-by-word measurement instead of character-by-character
- Replaced A* open set with binary heap for O(log n) extraction
- Optimized render loop with single-pass node partitioning
- Replaced drawNode if-else chain with shape registry pattern
- Unified z-order management to use zIndex property exclusively
- Unified connection point calculation via getConnectionPoints
- Consolidated shared constants into constants.ts

### Fixed
- Text overflow clipping with ellipsis for truncated node text
- mouseup outside canvas no longer causes stuck drag state
- Locked nodes cannot be deleted
- Tool shortcuts no longer fire during text input
- Improved contrast, text color consistency, and selection visibility
- Malformed XML detection in importFromDrawio
- Edge label background theme consistency

### Accessibility
- Canvas ARIA role, labels, and live status region
- Arrow key navigation for node movement
- Color palette keyboard navigation with ARIA roles
- PropertyPanel control labels
- prefers-reduced-motion support for animations
- aria-live announcements for node add/delete
