# Changelog

All notable changes to `@anytime-markdown/markdown-core` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.10.2] - 2026-04-07

### Fixed

- SonarCloud issues: nested ternary operators (S3358), optional chaining (S6582)
- HTML sanitization for pasted external content (security)
- i18n label update for C4Model navigation

## [0.10.1] - 2026-04-05

### Fixed

- Add missing borders to side toolbar
- Align hamburger menu center with side toolbar

### Changed

- Replace app icon with hamburger menu in toolbar

## [0.10.0] - 2026-04-04

### Added

- PlantUML source (.puml) export
- Mermaid (.mmd) export with SVG-to-PNG capture fix

### Fixed

- Update logo image path from /help/ to /images/

### Changed

- Resolve ESLint warnings across markdown-core
- Remove unused code

## [0.9.3] - 2026-04-01

### Added

- Horizontal scroll for Mermaid diagrams on narrow screens
- Word-break setting in editor settings

### Fixed

- Close outline panel on heading click in readonly mode and fix panel width

## [0.9.2] - 2026-04-01

### Added

- EditorModeContext for low-frequency mode state management
- Progressive outline unfold and auto-close on narrow viewports
- Overlay outline/comment panels on narrow viewports

### Changed

- Refactor: extract editor DOM handlers, crop utilities, merge hooks, PDF export, notification management
- Refactor: replace `(window as any).__vscode` with typed window protocol

### Fixed

- Table cell height reduced by removing padding and lowering line-height
- Center heading in viewport when selected from outline panel
- Style text highlight mark to match design system
- Cursor positioning and cell highlight for inline tables

### Security

- Resolve CodeQL code scanning alerts (TOCTOU, origin check, trivial conditional, unused variables)

## [0.9.1] - 2026-03-30

### Added
- Responsive toolbar: collapsed layout for narrow screens (<=900px)
- Apply button and discard confirmation dialog for all block edit dialogs
- Close fullscreen edit on apply for all block types
- Spreadsheet: clipboard support, range selection, column filter, and configurable grid size
- Spreadsheet: apply button and discard confirmation dialog

## [0.9.0] - 2026-03-29

### Added
- Spreadsheet mode: full-screen table editing with Canvas-based grid rendering
- Spreadsheet: cell size settings dialog with fixed/auto modes
- Spreadsheet: per-cell alignment with toolbar integration
- Spreadsheet: Undo/Redo by syncing ProseMirror changes to grid
- Spreadsheet: multi-row and multi-column selection
- Spreadsheet: drag reorder for rows and columns
- Spreadsheet: draggable data range borders for resizing
- Spreadsheet: context menu for row/column operations
- Table cell mode: keyboard navigation and editing modes with clipboard handlers
- Math graph visualization: LaTeX to expression converter, JSXGraph/Plotly rendering
- Physics engine: force layout, collision detection, Fruchterman-Reingold algorithm
- Handwritten theme preset with hand-drawn heading, admonition, and diagram styles

### Changed
- Spreadsheet: rewritten grid rendering from DOM to Canvas for performance
- Default theme preset changed to Handwritten
- Embed template files updated

### Fixed
- Spreadsheet: Undo/Redo forwarding (Ctrl+Z/Y) and sync timing
- Spreadsheet: context menu suppression on canvas right-click
- Spreadsheet: data range initialization and cell grid lines
- Table: TextSelection into selected cell on navigation mode
- Mermaid SVG rendering improvements
- Auto-highlight disabled for code blocks without language specification
- SonarCloud minor issues resolved

## [0.8.5] - 2026-03-28

### Added
- External/base64 image paste: local save support via VS Code integration

### Changed
- Renamed template files and removed unused assets

### Fixed
- Block node (image, etc.) copy & paste in VS Code
- GIF recorder: use data URL instead of blob URL for Web app compatibility
- Side panel (Comment, Outline, EditorSideToolbar) border display

## [0.8.4] - 2026-03-28

### Added
- `showFrontmatter` prop to control frontmatter visibility in editor
- Clear screen option in editor context menu
- ReadonlyToolbar: dark/light mode toggle and theme style toggle icons
- EditorFeaturesContext for feature flags (jsxgraph/plotly exclusion)

### Changed
- Claude editing indicator changed to fixed overlay bar (no layout shift)
- Moved Claude editing overlay from core to vscode-extension (separation of concerns)
- ReadonlyToolbar hidden during Claude Code editing lock

### Fixed
- MUI Menu Fragment children warning in EditorContextMenu, ToolbarFileActions, ToolbarMobileMenu
- `latexToExpr` sort() now uses localeCompare
- StatusBar aria-label: removed trivial conditional

### Security
- NEXT_LOCALE cookie: added Secure attribute
- `importDrawio`: fixed incomplete multi-character HTML sanitization

## [0.8.3] - 2026-03-27

### Added
- Math Graph: Graph visualization for LaTeX math expressions (JSXGraph, Plotly.js)
- Math Graph: LaTeX to math.js expression converter with graph type detection
- Math Graph: Full-screen graph preview with fill mode using ResizeObserver
- Handwritten theme preset with hand-drawn headings, admonitions, and diagrams

### Changed
- Default theme preset changed to Handwritten

## [0.8.2] - 2026-03-25

### Fixed
- Mermaid: Clear stale SVG on theme change before re-rendering
- Light mode color scheme and PDF export improvements

## [0.8.0] - 2026-03-25

### Changed
- Renamed package from `editor-core` to `markdown-core`

## [0.7.6] - 2026-03-22

### Added
- Slash command: auto-open fullscreen edit dialog for mermaid, PlantUML, math, HTML, and GIF blocks
- Slash command: frontmatter now outputs correct `---` fence format instead of yaml code block
- Slash command: footnotes use sequential numbering and auto-append definition at document end
- Tab/Shift+Tab in blockquote to nest/unnest (max 6 levels)
- Suppress Tab key focus escape from editor to toolbar

### Changed
- Admonition slash command labels: removed "Callout" suffix (ja), replaced with "Admonition" (en)

### Fixed
- Admonition slash commands now correctly set admonitionType attribute
- HTML block fullscreen preview background aligned with editor theme

## [0.7.1] - 2026-03-22

### Changed
- Block element alignment unified to text-align + inline-block pattern (images, PlantUML, Mermaid, math)
- SonarQube 588 CODE_SMELL fixes (Cognitive Complexity, readonly, optional chaining, etc.)

### Fixed
- closest() return type cast for dataset access

## [0.7.0] - 2026-03-21

### Added
- GapCursor display on the left side of block elements (ArrowUp/Down/Left/Right + Enter)
- Screen capture with ImageCropTool trimming (Screen Capture API)
- ImageCropTool: move and resize trim area (8-direction handles) with real-time size/capacity display
- Source mode: base64 image data folding
- Auto-reload toggle for external changes
- Change gutter highlight with Alt+F5 sequential jump and ESC reset
- MarkdownViewer component (readonly display, locale switch, font size switch)

### Changed
- Block handlebar: separator between label and edit icons
- Image handlebar: moved edit icon before annotation
- Font sizes consolidated to constants/dimensions.ts (28 constants)

### Fixed
- GapCursor positioned immediately left of block elements
- Initial mode changed from review to edit
- Theme controlled exclusively by editor settings

### Security
- Regex backtracking vulnerability fixes (SonarQube Hotspots MEDIUM 7)
- SonarQube BLOCKER: functions always returning same value (7)
- SonarQube CRITICAL: Cognitive Complexity reduction (34 functions refactored)

## [0.6.5] - 2026-03-20

### Changed
- Admonition style changed to GitHub-compliant
- MUI theme color references replaced with constant helpers (253 locations)

### Fixed
- Table text selection Ctrl+C/X copying entire table instead of selection
- Admonition consecutive display and template insertion issues

### Security
- ReDoS vulnerable regexes replaced with linear-time parsers

## [0.6.4] - 2026-03-20

### Added
- Paper size display (A3/A4/B4/B5, adjustable margins, toggle in editor settings)
- Template insertion via slash command (Welcome, Markdown All, etc.)
- Editor settings button in side toolbar
- Slash command menu screen reader result count notification
- localStorage wrapper (`safeSetItem`) for quota exceeded handling

### Changed
- Toolbar height fixed to 44px
- Scrollbar styled thin and rounded

### Fixed
- Scrollbar and inline code color contrast to WCAG AA compliance
- ConfirmDialog autoFocus separated for alert/non-alert
- Readonly mode: save and save-as disabled

## [0.6.3] - 2026-03-20

### Security
- Base URI XSS vulnerability fix (URL object normalization + scheme whitelist, CodeQL CWE-79)
- gif-settings extraction ReDoS fix (regex → indexOf linear-time parser)
- Heading parser ReDoS fix (`\s+` → single space)

### Changed
- Template filename change (defaultContent → welcome), markdownAll template added
- Heading style changed to left border + gradient background

## [0.6.1] - 2026-03-20

### Added
- GIF recorder block: screen capture → rectangle select → record → animated GIF (`/gif` slash command)
- Block element capture save: PNG/SVG/GIF from handlebar camera icon
- Block-level Ctrl+C/Ctrl+X: copy/cut code blocks, tables, GIFs preserving block structure
- Right-click menu block support: cut/copy enabled within block elements
- Slash commands: `/h4`, `/h5`, `/image`, `/frontmatter`

### Changed
- Clipboard operations consolidated to `clipboardHelpers.ts`
- Block clipboard operations consolidated to `blockClipboard.ts`

### Fixed
- GIF encoder replaced with custom implementation (gif.js Web Worker CSP block)
- Source mode switch causing GIF block/gif-settings disappearance
- HTML preview capture changed to direct SVG save (foreignObject tainted canvas workaround)

## [0.6.0] - 2026-03-19

### Added
- Image annotation: SVG overlay with rectangles/circles/lines and comments (resolve/delete, comment panel integration)
- Image crop: drag selection trimming (Base64/link image branched save)
- Image resize: preset buttons (25%-200%)
- Image editor: ruler (pixel scale) and grid lines
- Semantic comparison: heading-based section LCS matching with diff display (toggle)
- Context menu: cut/copy/paste/paste-as-markdown/paste-as-code-block (with shortcut display)
- Box drawing table (Unicode) auto-conversion to Markdown table on paste
- Keyboard shortcuts: Alt+Arrow (block move), Shift+Alt+Arrow (block duplicate), Ctrl+Enter/Shift+Enter (empty line), Ctrl+L (line select), Ctrl+D (word select), Tab/Shift+Tab (heading level)
- React Error Boundary (role="alert", reload button)

### Changed
- EditorMainContent split into EditorContentArea / EditorMergeContent / EditorSideToolbar
- Context values memoized with useMemo, section number logic extracted to hook
- isEditable access unified (useCurrentEditor hook)
- Compare mode left block elements: toolbar hidden in review mode, label-only on selection in edit mode

### Fixed
- Semantic diff line number calculation (padding line exclusion)
- Image annotation disappearance on source mode switch (Markdown tail block save)
- Base64 image annotation save crash (indexOf-based search)

### Security
- CSP base-uri directive added (javascript: scheme injection prevention)
- Webview message runtime type guard (TypeScript type assertion → typeof check)

## [0.5.2] - 2026-03-17

### Added
- Fullscreen table comparison: cell-level diff highlight in left panel
- Compare mode left (source) block elements: edit icons hidden

### Changed
- Panel header heights unified (outline, comment, explorer)
- Hardcoded values consolidated to constants (PANEL_HEADER_MIN_HEIGHT, etc.)

### Fixed
- Fullscreen table comparison left/right determination by editor instance comparison

## [0.5.1] - 2026-03-15

### Added
- Section number insert/delete (outline panel icon, H1-H5, direct source write)
- Hard break auto-append for consecutive text lines
- Excel/Google Sheets table paste support (cell line breaks → `<br>`)

### Changed
- Section number auto-display removed, replaced with explicit insert/delete operations
- Text formatting keyboard shortcuts disabled (use bubble menu instead)

### Fixed
- TipTap normalization file write-back suppressed on initial load
- Table cell hard break `\\` output breaking table rows (→ `<br>`)
- Excel paste inserted as image instead of table (text/html priority)
- Table outer background color mismatch

### Removed
- Details/Summary (collapsible block)
- Inline math ($...$)

### Security
- fetchFromCdn SSRF mitigation (URL reconstruction)

## [0.5.0] - 2026-03-15

### Added
- Unified fullscreen block edit dialog for all block types (code/Mermaid/PlantUML/math/HTML/table/image)
- Mermaid/PlantUML: Code / Config tab for separated configuration editing
- Live preview in all block edit dialogs (syntax highlight / SVG / image / KaTeX / DOMPurify)
- Zoom and pan in all block edit dialogs (buttons / wheel / drag)
- Sample insertion panel (Mermaid 23 / PlantUML 12 / Math 7 / HTML 6 / Code 24 languages)
- Line numbers and Tab indent in all block edit dialogs
- Diagram/math/HTML inline preview resize grip
- Table edit dialog: side-by-side comparison mode
- HTML block edit dialog: code diff in comparison mode
- Double-click to open block edit dialog for diagrams/math/HTML
- Block-specific icons in edit dialog header

### Changed
- "Fullscreen view" renamed to "block edit dialog"
- Inline toolbar icon changed from fullscreen to edit
- Table operation icons moved from inline to block edit dialog
- Code copy button moved to block edit dialog code toolbar
- Close button position unified to left of label
- Syntax highlight colors unified to GitHub style
- Merge operations restricted to right-to-left only
- Common components extracted: EditDialogHeader, EditDialogWrapper, ZoomToolbar, SamplePanel, DraggableSplitLayout, ZoomablePreview, BlockInlineToolbar, ResizeGrip, useBlockResize, useBlockNodeState
- Magic numbers and style patterns consolidated to constants (dimensions.ts, uiPatterns.ts)

### Fixed
- Print: page 2+ clipping and PlantUML code collapse
- Status bar fixed to bottom with position:fixed
- Frontmatter show/hide editor height recalculation
- Code block preview highlightedHtml DOMPurify sanitization

## [0.4.0] - 2026-03-11

### Added
- Outline panel collapse/expand toggle
- Outline section number auto-display
- sanitizeMarkdown unit tests (50 tests)
- BoundedMap utility (FIFO eviction Map with size limit)

### Changed
- Panel background colors unified across OutlinePanel, CommentPanel, LinePreviewPanel
- EditorToolbar split (588→393 lines, ToolbarFileActions and ToolbarMobileMenu extracted)
- MergeEditorPanel and InlineMergeView split to under 500 lines
- EditorToolbar props consolidated (48→17 props)
- Source→WYSIWYG sync logic: 3 duplicates extracted to common function

### Fixed
- svgCache / urlCache unbounded growth prevention
- Frontmatter display editor height cutoff

### Security
- PlantUML URL origin validation (SSRF prevention)
- HTML tag removal changed from regex to DOMParser.textContent
- commentHelpers regex replaced with indexOf (ReDoS prevention)
- fetchFromCdn URL origin validation (SSRF prevention)

## [0.3.0] - 2026-03-10

### Added
- YAML frontmatter recognition, preservation, and editing (code-block-style display in WYSIWYG)
- Browser spell check setting in settings panel
- Frontmatter delete confirmation dialog

## [0.2.8] - 2026-03-09

### Added
- Fullscreen code comparison: line-level merge (Mermaid/PlantUML/code blocks/Math)
- Compare mode: code block fullscreen shows side-by-side comparison
- Compare mode: left editor block expand/collapse synced to right editor
- Readonly/review mode: cursor display and text selection enabled

### Fixed
- Template insertion: consecutive empty lines compressed
- Compare mode switch: NodeViews (diagrams, images, tables) disappearing

## [0.1.0] - 2026-03-06

### Added
- View mode (readonly browsing + outline improvements)
- `#L` line number navigation

### Fixed
- ZWNJ tight-transition marker spacing
- Consecutive paragraph line round-trip merge prevention
- Heading-list and block-list spacing preservation

## [0.0.11] - 2026-03-04

### Added
- Inline comment (range selection + point comment, resolve/reopen/delete)
- Callout extension ([!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION])
- Footnote reference extension ([^id] syntax)
- Section auto-numbering extension
- Code block syntax highlighting (lowlight)
- Slash command block insertion

## [0.0.9] - 2026-03-03

### Added
- KaTeX math rendering (inline and block)
- Math sample popover for LaTeX template insertion
- Math and date slash commands
- TOC auto-generation from headings
- Encoding conversion menu
- Line ending conversion menu

## [0.0.7] - 2026-03-01

### Added
- Slash command menu for block insertion
- PDF export (@media print styles)
- Mermaid/PlantUML diagram resize handles
- Diagram code default collapse display
- Code block copy button
- HTML sample popover and toolbar insert button

## [0.0.1] - 2026-02-26

### Added
- WYSIWYG Markdown editor (Tiptap-based)
- Source mode toggle
- Compare (merge) mode: side-by-side diff, line-level merge, block-level diff highlight
- Text formatting: Bold, Italic, Underline, Strikethrough, Highlight
- Headings: H1-H5
- Lists: bullet, numbered, task
- Block elements: blockquote, code block (syntax highlight), horizontal rule
- Table: insert, add/remove rows/columns
- Image: relative path resolution, drag-and-drop, clipboard paste
- Link dialog: insert/edit/delete (Ctrl+K)
- Mermaid / PlantUML diagrams: live preview code blocks
- Search and replace (Ctrl+F / Ctrl+H): case sensitive, word match, regex
- Outline panel: heading drag-and-drop reorder, collapse
- Template insertion
- Bubble menu: floating format menu on text selection
- Status bar: line number, character count, line count
- Keyboard shortcuts
- Large file (100KB+) debounce optimization
