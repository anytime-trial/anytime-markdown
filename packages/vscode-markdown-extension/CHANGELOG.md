# Changelog

All notable changes to the "anytime-markdown" VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
