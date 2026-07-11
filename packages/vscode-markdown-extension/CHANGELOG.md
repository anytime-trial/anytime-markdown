# Changelog

All notable changes to the "anytime-markdown" VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.13.0] - 2026-07-11

### Added

- Auto-register the bundled mcp-markdown server into the workspace `.mcp.json` on activation, merging with any existing entries via an atomic write.

### Changed

- Bundled skills updated: added the new `anytime-doc-authoring` skill (per-type documentation authoring rules) and `anytime-spec-lookup` (spec navigation, renamed from `spec-lookup`); renamed `anytime-markdown-mcp-tactics` to `anytime-markdown-usage`; refreshed `anytime-markdown-output`.

## [1.12.0] - 2026-07-11

### Added

- Added a note graph panel to the webview, shown only for GitHub-opened documents (viewing).

### Changed

- Bundled mcp-markdown now raises an ambiguous-heading error for duplicate headings and returns an operation summary from the update tools.
- Synced the mcp-tactics skill with the implementation, documenting write-side pitfalls.

### Editor Core (markdown-core)

- Wired the note graph panel to the editor side toolbar; show frontmatter in edit and review modes.

## [1.11.0] - 2026-07-11

### Changed

- Unified icon assets to the `camel_markdown-<size>` naming.

### Fixed

- Reflected hostReadOnly in the editorMode notification.

### Editor Core (markdown-core)

- Toolbar "Open" is now a menu with Google Drive and "Open from GitHub"; added a "New" button, a "Save" menu and an unsaved-changes guard.
- Save-target badge (Local / GitHub / Drive) in the status bar; GitHub overwrite-save relabeled "Commit to GitHub".
- Rendered preview for fenced markdown; fixed Mermaid labels stripped by DOMPurify; separated readOnly prop from user readonly mode.

## [1.10.0] - 2026-07-09

### Editor Core (markdown-viewer / markdown-rich)

- Added `DriveFileSystemProvider` for opening and saving Google Drive Markdown files with revision-based conflict detection.
- Added shared pure helpers for Google Drive API requests and page capture.
- Fixed a polynomial ReDoS in code-span protection (CodeQL js/polynomial-redos).

## [1.9.1] - 2026-07-02

### Security

- Added a workspace-trust guard and brought Disposable handling and logging into line with the project conventions.

### Editor Core (markdown-viewer / markdown-rich)

- Fixed vanilla-UI logic, editor-state subscription, and error-surfacing regressions; theme-tokenized diff colors.
- Fixed the PlantUML encoder; sanitized KaTeX / print SVG; symmetrized web-import sanitization with origin validation.
- Keyboard operation, aria, and i18n coverage for the vanilla UI.

## [1.9.0] - 2026-06-30

### Added

- Body-width `full` (full screen width) preset added to the VS Code measure setting.

### Fixed

- "Claude is editing" banner sometimes failed to clear; added a stale-state safety net and per-file lock delivery.

### Editor Core (markdown-viewer / markdown-rich)

- Thinking-method diagrams: structure-map diagram type, in-place inline label editing, and DSL-derived label editing (structure-map summaries, causal-loop polarity).
- Mindmaps switched to a FreeMind-style layout; child-node overlap fixed.
- New read-only `<anytime-markdown-view>` element for embedding.

## [1.8.0] - 2026-06-27

### Added

- Web page import: fetch a URL in the extension host with an SSRF-guarded fetch (manual redirect re-validation, content-type/size/timeout limits) and import it as Markdown — inserted at the cursor (`/web`) or opened as a new untitled document (toolbar).

### Editor Core (markdown-viewer)

- Web page import (Readability + Turndown) via slash command and toolbar, with YAML-safe frontmatter.

## [1.7.0] - 2026-06-27

### Added

- Open linked Markdown files in the Markdown editor: clicking an internal link opens the target in the editor, and the linked file can be fetched and saved through the host.

### Fixed

- Intercept internal links at the window-capture phase so they no longer escape to the browser via `vscode-resource` URLs; resolve workspace-root (`/`-prefixed) links against the workspace root.
- Wire the webview `Ctrl+S` to the host save handler (it was falling back to a "Save As" download dialog).
- Wire `vscodeApi` into the webview mount.

### Editor Core (markdown-viewer / markdown-rich)

- mdEmbed transclusion (inline-editable embedded Markdown links), a `link` slash command, comparison-mode minimap diff markers, the restored change-overview minimap, and several change-gutter / search-bar / mdEmbed save-integrity fixes.

## [1.6.0] - 2026-06-24

### Added

- Made the body-measure width configurable via the `anytimeMarkdown.measure` VS Code setting, and restored the `fontSize` wiring.

### Changed (Breaking — settings)

- Unified the documentation-root settings into a single top-level `anytimeMarkdown.docsRoot`, used by both doc search indexing and the Note Graph panel. The previous keys `anytimeMarkdown.noteGraph.repositoryPath` and `anytimeMarkdown.docSearch.docsRoot` were removed — reconfigure `anytimeMarkdown.docsRoot` if you had set either.
- Doc search now indexes the entire `docsRoot` (previously limited to a subdirectory). Removed the `anytimeMarkdown.docSearch.subDir` setting.

### Removed

- Removed the unused `anytimeMarkdown.editorMaxWidth` setting (it was never applied by the editor).
- Removed the `anytimeMarkdown.claudeStatus.directory` setting. Claude Code editing status is now read from the agent-status worker (DB), so the old `claude-code-status.json` file path is no longer used.

### Editor Core (markdown-viewer / markdown-rich)

- Removed the spell-check feature; source mode now wraps on narrow widths; image crop edit goes full-screen; table inline-toolbar ops moved into the edit dialog; `embed-all` template gains Anytime Chart / Thinking Diagram sections; HTML edit live preview and code-block preview highlighting restored.

## [1.5.1] - 2026-06-23

### Editor Core (markdown-viewer / markdown-rich)

- Wide tables now scroll horizontally on narrow viewports (the table wrapper is rendered by default).

## [1.5.0] - 2026-06-22

### Added

- Bundle the `mcp-markdown` MCP server in the extension and auto-register it, so the Markdown MCP tools work on install alone.
- Bundle the `doc-core` document-search pipeline (node:sqlite based ingest + `search_docs` / `doc_backlinks` / `doc_neighbors`).
- Bundle the Markdown skill set and auto-install it into the workspace `.claude/skills/` on activation.

### Security

- Guard bundled skill names against path traversal (`isSafeSkillName`).

### MCP (mcp-markdown)

- Add `format_markdown`: in-place style fix following the markdown-check conventions, returning only a diff summary to save tokens.
- Add `search_sections` / `get_frontmatter` / `update_frontmatter` / `grep_markdown`.
- `search_docs` excerpts/snippets and `get_section` `maxChars`; section-granular FTS.
- Heading blank-line convention changed from 2 to 1 line above (formatting rule update).

### Editor Core (markdown-viewer / markdown-rich)

- Extract vanilla UI primitives into `@anytime-markdown/ui-core`.
- `anytime-chart`: combo-stacked / combo-area / markers samples; chart-core bottom legend, drill-down, pie centering.

## [1.4.0] - 2026-06-20

### Added

- Added typed note relations (relationship type picker and legend for depends-on / implements / part-of / supersedes / refines) to the note graph panel, with i18n support. Frontmatter `related` entries are parsed and written via gray-matter with typed relationship semantics.
- Added a spec index generator (`spec:index` script) and the `spec-lookup` skill for searching the spec index.

### Fixed

- Hardened the `related` frontmatter read/write path (pre-merge review fixes).

### Editor Core (markdown-viewer / markdown-rich)

- Bundled `chart-core`; `anytime-chart` fences render as `<anytime-chart>` Web Components with 9 chart types, DPR correction, hover tooltips, and a11y. Added a Table tab to the chart edit dialog and a `chart` slash command.
- Added a body-measure width switcher (Focused / Standard / Wide) using em-based presets for improved readability.
- Added 5 new Mermaid diagram samples; fixed deprecated Mermaid 11.15 syntax in existing samples.
- Applied pre-merge review fixes (duplicate chartLayer, area missing-value exclusion, header-column fallback, tab state).

## [1.3.0] - 2026-06-17

### Added

- Added a note graph panel in the editor's right rail (Outline-style): document-centric view with backlinks, mouse-draggable width, and a pin (keep-open) option that opens the note graph on startup across files.

### Editor Core (markdown-viewer / markdown-rich)

- Frontmatter-derived note graph viewer and in-preview WYSIWYG editing for thinking-method diagrams.
- Source-mode line-number gutter; `.md` drop-to-open on the content area and compare-mode left pane.
- Full-height right side rail; save icon enabled only when there are unsaved changes; design-spec alignment.
- Dark-mode theme following for editor root background / source text and Web Component chrome tokens.

## [1.2.0] - 2026-06-13

### Changed

- Switched the extension icon to the new camel branding.

### Editor Core (markdown-viewer / markdown-rich)

- Added the `anytime-markdown-view` Web Component (React-free read-only custom element) and an inline font/theme `viewerToolbar` in the read-only view.
- Hardened the Web Component base class for SSR/Node safety.
- Fixed read-only narrow-width wrapping and restored chromeless read-only parity.

## [1.1.0] - 2026-06-13

### Changed

- Upgraded TypeScript to 6.0.3 (build toolchain update).

### Editor Core (markdown-viewer / markdown-rich)

- Aligned editor body design with the design-system spec; changed the default body measure to 1000 px.
- Accessibility improvements: 44 px touch targets, unified focus rings, extended font-size cap.
- Fixed dark-mode regressions: side-toolbar icon disappearance, block-toolbar overlap, Mermaid preview colors, and figure-block dialog background/tab layout.

## [1.0.0] - 2026-06-12

### Changed

- Bundled the React-free editor core. The webview now boots from a vanilla bootstrap with React fully removed from the extension bundle, reducing bundle size.
- Reflect VS Code language changes via an `editorKey` remount.

### Editor Core (markdown-viewer / markdown-rich)

- Fully removed React from the editor core: all NodeViews and chrome are now native/vanilla. The legacy React implementation (136 src / 27 css / 148 tests) and the `markdown-react` package were removed.
- React islands (embed/graph previews) split into the separate `markdown-react-islands` package; viewer/rich cores are React-free.
- Numerous regression fixes (content CSS, shortcuts, beforeunload, merge mode, compare-mode codeblock editing, status bar).

## [0.18.0] - 2026-06-08

### Changed

- Bundled the rewritten editor core that fully drops MUI in favor of an in-house UI primitive kit (no extension-facing behavior change).

### Editor Core (markdown-viewer / markdown-rich)

- Removed all `@mui/material` / `@mui/icons-material` usage from the editor chrome and `markdown-rich`, replacing it with an in-house `ui/` primitive kit and vendored icons (MUI reduction Phase 3a/3b).
- Replaced MUI `GlobalStyles` / `useTheme` / `useMediaQuery` with a stylis-based `ui/GlobalStyle`, `ThemeModeContext` (`useIsDark`), and an in-house media-query hook; dropped `@mui/*` and `@emotion/*` from peer dependencies.
- Fixed compare-mode imageRow badge layout.

## [0.17.0] - 2026-06-03

### Added

- Read the current editing status from the agent-status worker.

### Fixed

- Unified the heading border to the design-spec sumi (ink) color.

### Editor Core (markdown-viewer / markdown-rich)

- Extracted the framework-agnostic `diffEngine` / sanitize cluster into the new `@anytime-markdown/markdown-engine` package and made `sanitizeMarkdown` DOM-agnostic.
- Extracted shared editor theme CSS variable injector and Tiptap content-style composer; unified compare-mode styles with the normal editor.
- Deferred `onUpdate` serialization off the keystroke path and cached the diagram aggregate for the toolbar.
- Fixed the imageRow flex layout in compare view and the SWC class-field reset of the node-view renderer.

## [0.16.0] - 2026-05-31

### Editor Core (markdown-viewer / markdown-rich)

- Replaced the `@tiptap/*` npm dependencies with vendored Tiptap v3.20.0 sources under the `@anytime-markdown/markdown-*` namespace, removing the external Tiptap supply chain.
- Split the rich code-block cluster (diagrams, dark-mode PDF rendering) into the new `@anytime-markdown/markdown-rich` package; `markdown-viewer` exposes the shared API it consumes.
- Renamed the editor core package to `@anytime-markdown/markdown-viewer` (the former `markdown-core` name now hosts the vendored Tiptap sources).

## [0.15.6] - 2026-05-27

### Editor Core (markdown-core)

- SonarCloud code quality improvements (type assertion removal, mechanical safe fixes).

## [0.15.5] - 2026-05-24

### Editor Core (markdown-core)

- Added i18n label keys for the landing footer mindmap viewer link

## [0.15.4] - 2026-05-21

### Changed

- Version bump synchronized with `markdown-core` 0.15.4 (no extension-specific source changes)

### Editor Core (markdown-core)

- Resolved SonarCloud findings (S7780/S6582/S6653/S7776/S3358 and others)
- `mcp-markdown`: resolved SonarCloud findings (S7772/S6594); added tests covering uncovered `sanitizeMarkdown` branches (branch 88→100%)

## [0.15.3] - 2026-05-20

### Security

- Fixed polynomial ReDoS in `claudeHookSetup` trailing-slash regex by replacing `/\/+$/` with an O(n) `charCodeAt` scan (CodeQL #818, `vscode-common`)
- Bumped `mermaid` to 11.15.0 to patch Gantt DoS and CSS/HTML injection CVEs

### Editor Core (markdown-core)

- Refactored `MarkdownEditorPage` editor-init effect — extracted `applyInitialFontSizeOnce` and `buildEditorPortalTarget` helpers (S3776)
- Security: bumped `mermaid` dependency (see above)

## [0.15.2] - 2026-05-17

### Changed

- Documentation references to AI Note now point to the new Anytime Agent extension

### Editor Core (markdown-core)

- `markdown-core` が `next/dynamic` から `React.lazy` へ移行し、Next.js ランタイム依存を排除

## [0.15.1] - 2026-05-16

### Editor Core (markdown-core)

- Table cell text now escapes `|` to `\|` so column pipes survive round-trips
- `SourceModeEditor` syncs textarea height to mirror so the textarea fills the editor
- Image URL serialization escapes backslashes to keep raw markdown round-trip safe
- Dropped redundant `spreadsheet-core` dependency
- Security: 4 webview message listeners now verify message origin before handling events

## [0.15.0] - 2026-05-15

### Changed

- **Breaking:** Default empty value of `anytimeMarkdown.claudeStatus.directory` changed from `.vscode` to `.anytime`. Existing setups must override the setting or manually relocate
- Default `.vscode` storage paths consolidated under `.anytime`
- Timeline `OutputChannel` name unified to `Anytime Markdown`

### Editor Core (markdown-core)

- `markdown-core` を自己完結 i18n に移行 (公開 API 経由でメッセージを export)
- 非ブラウザバンドルでの `navigator` アクセスと動的 import 解決の不整合を修正
- `mcp-markdown` の `server.tool()` 呼び出しをラップして MCP SDK の TS2589 深さエラーを抑止
- `updateSection` と `ssrfGuard` 周辺のテストカバレッジを強化

## [0.14.1] - 2026-05-06

### Changed

- Removed retired VS Marketplace badge from README

### Editor Core (markdown-core)

- Fixed admonition initial render glitch and trailing newline accumulation
- Security: fixed remote-property-injection and log-injection issues (CodeQL)
- Improved test coverage for `ssrfGuard`, `embedSeenStore`, `embedCache`

## [0.14.0] - 2026-05-04

### Added

- Anytime Markdown activity bar with Timeline view
- Timeline view and `compareWithCommit` command for git history browsing

### Changed

- Removed 5 unused commands

### Editor Core (markdown-core)

- Admonition serializer fallback for unknown node types
- Sonar fixes: Readonly props (S6759), type assertions (S4325), negated ternaries (S7735), Number globals (S7773), replaceAll (S7781), globalThis (S7764), stable keys (S6479)
- Cognitive complexity reduction via helper extraction across multiple components (S3776)

## [0.13.4] - 2026-05-02

### Editor Core (markdown-core)

- Fixed admonition newline serialization to be idempotent
- Updated i18n strings for press page content

## [0.13.3] - 2026-04-28

### Editor Core (markdown-core)

- Reworked embed excerpt and OGP/frontmatter parsing to avoid regex backtracking hotspots (`S5852`)
- Updated comment escaping and regex string literals for Sonar compliance (`S7780`)

## [0.13.2] - 2026-04-26

### Editor Core (markdown-core)

- Fixed backslash multiplication inside admonition blocks
- Removed dark/light mode toggle icon from ReadonlyToolbar

## [0.13.1] - 2026-04-25

### Editor Core (markdown-core)

- Refresh Anytime Trail LP benefit copy with visualization framing

## [0.13.0] - 2026-04-24

### Added

- Inject embed providers into the webview via extension messaging (`fetchOgp` / `fetchOembed` / `fetchRss` proxy)
- Inline OGP / SSRF helpers and `rssFetch` implementation to satisfy `rootDir` constraints
- Refresh extension icon and marketplace logo to `anytime-markdown-128`
- Refresh README with language links and AI gutter highlight section

### Editor Core (markdown-core)

- Add embed block system with URL classifier, SSRF guard, and provider interface
- Add embed node views for OGP card, YouTube, Figma, Spotify, Twitter, and Drawio
- Add `/embed` slash command and embed edit dialog
- Add embed update detection with badge UI (RSS discovery, OGP / RSS fingerprint, seen store)
- Support image-style width resize for embed card variant and persist width through markdown roundtrip
- Fix embed layout gaps by switching `imageRow` from grid to flex and restoring `block` display

## [0.12.0] - 2026-04-23

### Editor Core (markdown-core)

- Add `MarkdownMinimap` component with scroll-synced viewport indicator and click-to-jump
- Add `useMarkdownMinimap` hook for heading/diff marker position calculation
- Apply sumi-e light palette and violet warning colors
- Enable spreadsheet `showApply`/`showRange` in `TableNodeView`
- Extract spreadsheet functionality to `spreadsheet-core`/`spreadsheet-viewer` packages

## [0.11.4] - 2026-04-19

### Editor Core (markdown-core)

- Add i18n keys for Trail Viewer and Markdown Editor CTA link labels and descriptions

## [0.11.3] - 2026-04-18

### Added

- Add `anytimeMarkdown.storagePath` setting for intermediate file storage path

### Changed

- Migrate `ClaudeStatusWatcher` to `vscode-common` shared package
- Split `storagePath` into `database.storagePath` and `claudeStatus.directory`
- Remove Note treeview (moved to vscode-trail-extension)

### Editor Core (markdown-core)

- Collapse frontmatter by default when opening a file

## [0.11.2] - 2026-04-12

### Fixed

- Fix `.gitignore` pattern that inadvertently excluded `trail-core/src/c4/coverage/` source files from version control

## [0.11.0] - 2026-04-11

### Added

- Note panel multi-page support with `anytime-note-N` file naming
- Note file auto-update via FileSystemWatcher
- Auto-save after editor editing
- anytime-note skill: page number argument, summary mode, handover mode
- Note view skill display button
- Show frontmatter title in note page list
- Create new note page with cleared state

### Changed

- Note tree renamed: Agent Note → Note, Agent Memory → Memory

### Removed

- Memory panel moved to Anytime Trail extension

### Fixed

- Avoid corrupt cache when opening note files
- Restore skill auto-generation with path updated to `anytime-note-1.md`
- Fire Claude lock even when PreToolUse event is missed

### Editor Core (markdown-core)

- Reduce cognitive complexity in key editor components (SonarCloud S3776)

## [0.10.4] - 2026-04-09

### Editor Core (markdown-core)

- i18n translation key for Trail navigation label

## [0.10.3] - 2026-04-08

### Added

- Restore Agent Note view in sidebar

## [0.10.1] - 2026-04-05

### Editor Core (markdown-core)

- Replace app icon with hamburger menu in toolbar
- Fix side toolbar borders and alignment

## [0.10.0] - 2026-04-04

### Editor Core (markdown-core)

- PlantUML source (.puml) and Mermaid (.mmd) export
- Logo image path fix
- ESLint warnings resolved

## [0.9.3] - 2026-04-01

### Editor Core (markdown-core)

- Horizontal scroll for Mermaid diagrams on narrow screens
- Word-break setting in editor settings
- Fix outline panel close on heading click in readonly mode

## [0.9.2] - 2026-04-01

### Security

- Fix TOCTOU race conditions in file system operations using exclusive create flag
- Secure temporary file creation with restricted permissions (mode 0o600)
- Add postMessage origin verification for VS Code webview handlers
- Add path traversal prevention for network-to-file writes

### Editor Core (markdown-core)

- Add EditorModeContext for mode state management
- Progressive outline unfold and overlay panels on narrow viewports
- Refactor: extract editor DOM handlers, crop utilities, merge hooks
- Fix table cell height, heading centering, inline table cursor

## [0.9.1] - 2026-03-30

### Editor Core (markdown-core)
- Responsive toolbar for narrow screens (<=900px)
- Apply button and discard confirmation dialog for all block edit dialogs
- Spreadsheet: clipboard, range selection, column filter, and configurable grid size

## [0.9.0] - 2026-03-29

### Added
- Git treeview features extracted into new Anytime Git extension

### Changed
- VS Code extension page copy and icon order improvements
- Updated images and embed templates

### Editor Core (markdown-core)
- Spreadsheet mode: full-screen Canvas-based table editing with cell size settings, per-cell alignment, Undo/Redo, multi-selection, drag reorder, and context menu
- Table cell mode: keyboard navigation with clipboard handlers
- Math graph visualization with JSXGraph/Plotly
- Handwritten theme preset
- Physics engine for force layout

## [0.8.5] - 2026-03-28

### Added
- Save external/base64 pasted images to local workspace folder

### Editor Core (markdown-core)
- Fixed block node (image, etc.) copy & paste
- GIF recorder now uses data URL instead of blob URL
- Fixed side panel border display
- Renamed template files and removed unused assets

## [0.8.4] - 2026-03-28

### Added
- Claude Code editing notification: file edit detection → editor lock → unlock flow
- VS Code settings: `language`, `themeMode`, `themePreset`
- Toolbar controls moved to VS Code native editor title bar
- `mcp-cms` server registered in `.mcp.json`

### Changed
- Removed Claude editing status bar item, replaced with overlay approach
- Removed unused `claudeLock` message handler
- AI note button label shortened from "AI ノートを編集" to "ノート編集"
- Excluded jsxgraph and plotly from extension bundle (bundle size reduction)

### Fixed
- Claude edit notification lock/unlock reliability issues
- Claude Code hook array format correction
- Hook file path parsing via stdin jq
- Status file monitoring stabilized (fs.watch → fs.watchFile → setInterval polling)
- Fixed timestamp-based dedup blocking unlock detection
- Added active unlock polling after lock detected

### Editor Core (markdown-core)
- `showFrontmatter` prop for frontmatter visibility control
- Clear screen option in editor context menu
- Claude editing indicator: fixed overlay bar (no layout shift)
- Fixed MUI Menu Fragment children warning
- Security: Secure attribute on NEXT_LOCALE cookie, importDrawio sanitization fix

## [0.8.3] - 2026-03-27

### Added
- openCompareMode command for cross-extension diff integration with Anytime Git

### Changed
- Extracted Git treeview features (Repository, Changes, Graph, Timeline) into new Anytime Git extension

### Editor Core (markdown-core)
- Math Graph: Graph visualization for LaTeX math expressions (JSXGraph, Plotly.js)
- Handwritten theme preset (hand-drawn headings, admonitions, and diagrams)
- Default theme changed to Handwritten

## [0.8.2] - 2026-03-25

### Editor Core (markdown-core)
- Mermaid: Fixed stale SVG clearing on theme change
- Light mode color scheme and PDF export improvements

## [0.8.0] - 2026-03-25

### Changed
- Renamed `vscode-extension` package to `vscode-markdown-extension`

## [0.7.7] - 2026-03-23

### Added
- "Copy File Name" context menu item in treeview explorer
- Auto-reload enabled by default when opening files

### Fixed
- Treeview drag-and-drop now moves files instead of copying

## [0.7.6] - 2026-03-22

### Editor Core (markdown-core)
- Slash commands: auto-open block edit dialog, frontmatter/footnote improvements
- Tab/Shift+Tab blockquote nesting (max 6 levels)
- Admonition slash command label fixes

## [0.7.5] - 2026-03-22

### Changed
- Renamed "AI Note" to "Agent Note" (command names, messages, CLAUDE.md auto-append)

## [0.7.1] - 2026-03-22

### Editor Core (markdown-core)
- Block element alignment unified (text-align + inline-block)
- SonarQube 588 CODE_SMELL fixes

## [0.7.0] - 2026-03-21

### Editor Core (markdown-core)
- GapCursor (cursor display on left side of block elements)
- Screen capture + ImageCropTool trimming
- Source mode base64 image folding
- Auto-reload for external changes + change gutter highlight
- MarkdownViewer component
- Security: ReDoS/Cognitive Complexity fixes

## [0.6.5] - 2026-03-20

### Editor Core (markdown-core)
- Admonition style changed to GitHub-compliant
- Table selection Ctrl+C/X fix
- ReDoS vulnerability fixes

## [0.6.4] - 2026-03-20

### Added
- Toolbar icon changed to app camel logo
- VS Code API type stubs (`vscode.d.ts`) for improved type safety

### Changed
- Block move/duplicate shortcuts restricted to VS Code only (Web Chromium conflict avoidance)

### Editor Core (markdown-core)
- Paper size display (A3/A4/B4/B5, margin adjustment)
- Template insertion slash commands
- Scrollbar and inline code WCAG AA compliance

## [0.6.3] - 2026-03-20

### Editor Core (markdown-core)
- Template filename change, heading style change
- XSS/ReDoS security fixes

## [0.6.1] - 2026-03-20

### Editor Core (markdown-core)
- GIF recorder block (/gif slash command)
- Block element capture save (PNG/SVG/GIF)
- Block-level Ctrl+C/X, context menu support
- Slash commands: /h4, /h5, /image, /frontmatter

## [0.6.0] - 2026-03-19

### Added
- Clipboard image auto-save (Ctrl+V / D&D saves to images/ and inserts link)
- activationEvents optimization (onLanguage:markdown + onView)
- Workspace Trust support (untrustedWorkspaces: limited)
- Markdown link validation (file existence and anchor checks, Diagnostics API)
- Copy path, import files, external file D&D in treeview

### Fixed
- Source mode Ctrl+Z (Undo) not working in VS Code
- Pasted image not displaying in VS Code webview (base href dynamic setting)

### Security
- Webview message runtime type guard (TypeScript type assertion replaced with typeof check)

### Editor Core (markdown-core)
- Image annotation (SVG overlay + comments)
- Image crop and resize (preset buttons)
- Semantic comparison (heading-based LCS matching)
- Context menu, box drawing table auto-conversion, keyboard shortcuts

## [0.5.2] - 2026-03-17

### Editor Core (markdown-core)
- Fullscreen table comparison: cell-level diff highlight
- Panel header height and constants unified

## [0.5.1] - 2026-03-15

### Added
- Reload button in toolbar (VS Code extension only)
- VS Code extension i18n (package.nls.json / package.nls.ja.json, README.ja.md)

### Changed
- customEditors priority set to `option` (VS Code standard text editor as default)

### Fixed
- External change notification on Ctrl+S save (suppressed via onWillSaveTextDocument)

### Editor Core (markdown-core)
- Section number insert/delete
- Excel/Google Sheets table paste support
- Hard break auto-append
- Removed Details/Summary and inline math

## [0.5.0] - 2026-03-15

### Changed
- README.md translated to English

### Editor Core (markdown-core)
- Unified block edit dialog (all 7 block types)
- Live preview, zoom/pan, sample insertion panel
- 10 common components extracted, constants consolidated

## [0.4.0] - 2026-03-11

### Editor Core (markdown-core)
- Outline panel collapse/expand, section number auto-display
- EditorToolbar/MergeEditorPanel split refactoring
- Security: SSRF/ReDoS prevention

## [0.3.0] - 2026-03-10

### Editor Core (markdown-core)
- YAML frontmatter support (recognition, preservation, editing)
- Browser spell check setting

## [0.2.8] - 2026-03-09

### Editor Core (markdown-core)
- Fullscreen code comparison: line-level merge
- Readonly/review mode cursor and text selection enabled

## [0.2.4] - 2026-03-08

### Added
- Outline panel in activity bar (TreeView)
- Comment panel in activity bar (TreeView)

### Changed
- Status bar migrated to VS Code native (cursor position, char count, line count, line ending, encoding)
- Activity bar icon changed to Markdown-style M icon
- Removed Open Markdown Editor command
- Removed Compare with Git HEAD command

### Fixed
- VS Code Undo/Redo empty line disappearance
- Editor height calculation using DOM measured values (eliminated blank space when status bar hidden)

## [0.1.0] - 2026-03-06

### Added
- FileSystemWatcher for external change notification

### Fixed
- Source mode tab switch persistence in VS Code extension

### Editor Core (markdown-core)
- View mode (readonly browsing)
- Line number navigation (#L)

## [0.0.11] - 2026-03-04

### Editor Core (markdown-core)
- Inline comments, callouts, footnotes, section numbering extensions
- Code block syntax highlighting (lowlight)
- Slash command block insertion

## [0.0.9] - 2026-03-03

### Editor Core (markdown-core)
- KaTeX math rendering (inline and block)
- TOC auto-generation, encoding/line ending conversion

## [0.0.7] - 2026-03-01

### Editor Core (markdown-core)
- Slash command menu, PDF export
- Mermaid/PlantUML resize handles, code block copy button

## [0.0.3] - 2026-02-27

### Fixed
- Added repository field to vscode-markdown-extension package.json (vsce warning fix)

## [0.0.2] - 2026-02-26

### Added
- VS Code color theme synced with editor dark/light mode

### Changed
- Help and version info menu hidden in VS Code extension

### Fixed
- Source mode line numbers clipped

## [0.0.1] - 2026-02-26

### Added
- VS Code Custom Editor for *.md / *.markdown files
- Compare with Markdown Editor: load external file into right panel from explorer context menu
- Ctrl+S in compare mode saves right panel content to original file
- VS Code settings integration: fontSize, lineHeight, editorMaxWidth

### Editor Core (markdown-core)
- WYSIWYG Markdown editor (Tiptap-based)
- Source mode toggle, compare (merge) mode
- Text formatting, headings, lists, block elements, tables, images
- Mermaid / PlantUML diagrams
- Search and replace, outline panel, template insertion
- Bubble menu, status bar, keyboard shortcuts
