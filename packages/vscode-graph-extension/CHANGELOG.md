# Change Log

All notable changes to the "Anytime Graph" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.12.0] - 2026-07-22

### Added

- Added an activity bar view listing the `.cooc.json` co-occurrence networks in the workspace; selecting an item opens it in the co-occurrence network editor. Shows a "New Network" welcome action when the workspace has none, and stays in sync with the file system via a watcher (create/delete).
- Added the `anytime-graph.refreshNetworks` command and a refresh button in the new view's title bar.

### Changed

- **Breaking:** Replaced the `.graph` general graph editor with a `.cooc.json` co-occurrence network editor.
- **Breaking:** Opening a `.graph` file now shows a migration guide instead of failing silently. The general graph editor remains available in the web app at `/graph`.
- **Breaking:** Renamed the creation command from `anytime-graph.newGraph` to `anytime-graph.newCooccurrence`. Update any custom keybindings that referenced the old id.
- Rebuilt the editor webview as vanilla JS, removing the React and `graph-viewer` dependencies. Saving now goes through a `WorkspaceEdit`, so unsaved markers, undo, and diff view work through VS Code's standard document editing.
- Unified the extension display name and the activity bar view container title to "Anytime Graph" (both languages); the per-view and per-editor labels ("Co-occurrence Network(s)") are unchanged.
- The webview build (webpack) now type-checks instead of only transpiling, catching bugs (e.g. undefined variables) that previously compiled successfully; the packaged webview bundle also shrank from 607KB to 172KB by avoiding a DOM-dependent import path into graph-core.

### Fixed

- Fixed PNG export failures being silently swallowed; a failed write is now surfaced instead of leaving the user believing the file was saved.
- Fixed creating a new co-occurrence network silently truncating an existing file at the same path with no confirmation; a confirmation prompt is now shown before overwriting, and unsafe paths (path separators, `..`) are rejected.

### Graph Core (graph-core)

- 共起ネットワーク図種・`.cooc.json` スキーマ検証・Barnes-Hut レイアウト・絞り込みと編集操作、および共起ネットワークビューア（描画コア・フィルタ/語一覧パネル・レイアウト Worker・i18n・Web アプリ `/cooccurrence`）を追加。
- 孤立語の発散・入力検証漏れ・`node:crypto` 依存によるビルド失敗・クラスタ絞り込みの不具合・Worker 未終了や中断処理まわりの不具合・右サイドパネル下部の到達不能を修正。
- ビューアの描画を要求時のみに変更（アイドル時の負荷を削減）。

## [0.11.1] - 2026-07-13

### Graph Core (graph-core)

- Fixed a ReDoS in the causal-loop link parser of `parseGraphDsl`.

## [0.11.0] - 2026-07-11

### Graph Core (graph-core)

- Extracted the note graph panel into graph-core with a read-only (viewing) option.

## [0.10.0] - 2026-07-09

### Added

- Right-click context menu in the graph editor: cut / copy / paste / delete and selection actions are wired to the canvas, Paste is always enabled to match `Ctrl+V`, and the menu is clamped inside the viewport.

### Fixed

- The context menu body is now painted in front of its backdrop (a missing z-index made the items unclickable).
- Removed an unwired `ContextMenu` handle (CodeQL js/property-access-on-non-object).

### Graph Core (graph-core)

- Removed a ternary expression that always evaluated to the same value (Sonar S3923).

## [0.9.0] - 2026-06-30

### Graph Core (graph-core)

- Thinking-method diagrams: new `structure-map` diagram type.
- FreeMind-style mindmap layout (central root, balanced left/right expansion, bezier curves).
- Mindmap child-node overlap fixed; edge metadata moved onto the label text to keep edit fields compact.

## [0.8.0] - 2026-06-20

### Graph Core (graph-core)

- Added typed note-relation vocabulary (depends-on / implements / part-of / supersedes / refines) and per-relation-type edge styling.

## [0.7.0] - 2026-06-17

### Graph Core (graph-core)

- Added thinking-method diagram support (presets, DSL parser, SVG rendering for 10 types).
- Added the `buildNoteGraph` preset for frontmatter-derived document note graphs, plus a spec→DSL serializer and `node.metadata.path`.

## [0.6.0] - 2026-06-13

### Graph Core (graph-core / graph-viewer)

- Fully removed React from the graph editor: hooks, toolbar, canvas, panels, and overlays are now vanilla; the webview bundle no longer ships React.
- Added the `anytime-graph` Web Component (React-free distribution) and removed the graph-core React peer dependency.

## [0.5.1] - 2026-06-13

### Changed

- Upgraded to TypeScript 6.0.3 (monorepo-wide build toolchain update).

## [0.5.0] - 2026-06-08

### Changed

- Removed the `ThemeProvider` and dropped the `@mui` / `@emotion` dependencies.

### Graph Core (graph-core / graph-viewer)

- Replaced `@mui` across `graph-viewer` and `graph-core` (`MinimapCanvas`) with an in-house `ui/` kit (MUI reduction Phase 3e).

## [0.4.1] - 2026-05-27

### Graph Core (graph-core)

- SonarCloud code quality improvements (reduced cognitive complexity, mechanical safe fixes).

## [0.4.0] - 2026-05-24

### Graph Core (graph-core)

- Added read-only `GraphView` with overview minimap, collapsible subtrees, and opt-in node drag-move
- Added radial mindmap and rooted tree layouts
- Fixed wheel zoom and DPR > 1 hit-test / pan / zoom misalignment
- Extracted `resolveEdgesForRender` to engine for O(1) node lookup

## [0.3.4] - 2026-05-21

### Changed

- Version bump synchronized with `graph-core` 0.3.4 (no extension-specific source changes)

### Graph Core (graph-core)

- Resolved SonarCloud findings (S7769/S7735/S7748/S107 and others)
- Improved pure-logic unit-test coverage (`reducer`, `groupClustering`, and others)
- `mcp-graph`: resolved SonarCloud findings (S7772/S7754/S7741/S1128)

## [0.3.3] - 2026-05-20

### Graph Core (graph-core)

- Extracted `deleteGroupsContainingSelection` helper from `useCanvasBase` to reduce cognitive complexity (S3776)

## [0.3.2] - 2026-05-17

### Changed

- Version bump only (no functional changes since 0.3.1)

### Graph Core (graph-core)

- バージョン同期のみ (機能変更なし)

## [0.3.1] - 2026-05-15

### Changed

- Removed retired VS Marketplace badge from README
- `graph-viewer` migrated to self-contained i18n via public package API

### Graph Core (graph-core)

- Test coverage added for culling / shape / drawHelpers paths without a real canvas

## [0.3.0] - 2026-05-04

### Graph Core (graph-core)

- Added `fragment` shape for sequence diagram fragments
- Sonar fixes: Readonly props (S6759), type assertions (S4325), stable keys (S6479), Number globals (S7773), globalThis (S7764)
- Cognitive complexity reduction via helper extraction across hooks, engine, physics, and IO modules (S3776)

## [0.2.3] - 2026-05-03

### Graph Core (graph-core)

- `onNodeCtrlClick` callback for Ctrl+click multi-select toggle
- `wheelRequiresShift` option for wheel zoom behavior

## [0.2.2] - 2026-05-02

### Graph Core (graph-core)

- Dim unrelated C4 graph elements when a node is selected
- Minimap control ordering and fit control positioning improvements

## [0.2.1] - 2026-04-24

### Changed

- Update extension icon and marketplace logo to `anytime-graph-128`

### Graph Core (graph-core)

- Add tests for `splitManualTopBottom`, `packGroupMembers`, and nested frame layout

## [0.2.0] - 2026-04-23

### Added

- English UI support — the webview now honors `vscode.env.language` (falls back to English when not Japanese) via a rewritten `next-intl` shim using `graph-viewer/src/i18n/`
- Manifest NLS — `package.nls.json` / `package.nls.ja.json` for Marketplace listing and VS Code UI language support
- `containerHeight` prop to `GraphEditor` for layout flexibility

### Changed

- Webview integrated with `@anytime-markdown/graph-viewer` package via `PersistenceAdapter` bridge; eliminates duplicated `GraphCanvas` and related hooks

### Graph Core (graph-core)

- Add `MinimapCanvas` with viewport drag-to-pan and zoom buttons
- Align `LIGHT_COLORS` with sumi-e design system palette
- Add frame Z-behavior (hitTestFrameBody, node drag inside frames)

## [0.1.5] - 2026-04-18

### Graph Core (graph-core)

- Add `onNodeContextMenu` callback to `useCanvasBase` for context menu support
- Show dot at connector start point
- Include frame nodes in context menu hit test
- Reduce connector start dot radius from 5 to 3
- Break circular dependency between `shapes` and `shapeRenderers`

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
