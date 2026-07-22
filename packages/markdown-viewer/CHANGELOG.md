# Changelog

All notable changes to `@anytime-markdown/markdown-viewer` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.17.0] - 2026-07-22

### Added

- Host mode control: a new `initialMode` option lets the host (e.g. the web-app's `/markdown?mode=review` link) force the startup mode explicitly, taking priority over `defaultSourceMode` and the persisted `localStorage` value. The initial application is not persisted to `localStorage`, so a tab opened from a review link doesn't overwrite the user's normal startup mode.
- Cooccurrence network diagram (markdown-rich / graph-core): a new anytime-graph diagram type showing which factor events are discussed together with a given subject, encoding frequency as circle area, co-occurrence strength as line width, and cluster membership as color.

### Fixed

- Angle-bracket autolinks (`<https://...>`) were dropped by `sanitizeMarkdown` because DOMPurify treats the syntax as an invalid HTML tag; autolinks are now escaped and restored using the same placeholder pattern as the existing MATH/FN/ADM/CMT constructs.
- A regression where adding the cooccurrence network diagram broke the web-app production build (`next build` type check), because the exhaustiveness check in `describeNode` hadn't been updated for the new diagram type.

## [1.16.0] - 2026-07-19

### Added

- Screenmock edit panel (markdown-rich): the screenmock edit dialog gained a right-hand panel for parts, attributes, structure and screens — variants, color tokens, offset inputs, drag-to-insert, a hierarchy tree, screen add/duplicate/delete and id/title editing, plus snippets, screen templates, presets, reordering, alignment and zoom.
- Screenmock design editing: drag reordering and Alt free placement, operation hints and drag-badge wording, and the grabbed element now follows the cursor while dragging.
- Screenmock write-back functions were extracted into a dedicated HTML-mutation module (insert / delete / duplicate / wording / transition target / class toggle / style declaration / offset / screen-block operations).
- Editor: Ctrl/Cmd + wheel zooms the whole document (body text and diagrams together).
- Code-block edit dialog: a collapse/expand icon for the code pane.

### Fixed

- Reopening a code-block edit dialog after applying showed stale content.
- Screenmock design editing could not be operated at non-100% zoom, and element drags ran twice together with the preview pan.
- Free placement now preserves flow layout by reading `position: static` as `relative` instead of switching to absolute coordinates.
- Native drag-and-drop hijacked screenmock reordering; it is now suppressed so indentation is preserved.
- The screenmock edit panel is laid out beside the preview instead of below it.
- Divider rendering writes are centralized in `updateLayout`.
- Cross-review fixes: `sm-screen` unwrap guard, unhandled `pointercancel`, preset `custom` display, image-source handling restricted to `img`, independent size write-back, duplicate parent resolution, double rendering, screen add/duplicate on bare sources, `position` preservation at offset 0, and duplicate id rejection.

## [1.15.0] - 2026-07-17

### Added

- Screenmock fenced blocks (markdown-rich): a `screenmock` code fence renders an interactive screen mockup with screen navigation, transitions and a component vocabulary. A design edit mode supports mouse resizing of parts and writes the edited layout back to the source.
- Slash command: a "screenmock" insertion item was added to the vanilla editor slash menu.

### Fixed

- Cross-review fixes across the screenmock feature (9 items): `:host` CSS-variable resolution, redraw after DOM reconnection, selection preservation across regeneration, `aria-label`s, edit-UI protection, `srcset` image-source bypass, theme application and preview width.

### Added

- Section Lock: heading sections can be locked as "final" (FR-8.3). Locked sections reject edits inside the editor, the outline panel gets per-heading lock/unlock buttons, and lock state is persisted in the document frontmatter. A new shared `section-lock-core` package supplies the lock model so the editor, the MCP server and agent hooks enforce the same rules.

### Fixed

- Outline panel lock buttons were not shown, or not updated, in some documents (2 bugs).
- Frontmatter no longer auto-expands when the document contains a section lock.
- Documents containing locks failed to mount due to a status-bar initialization-order bug.
- Hardened lock enforcement across the section-lock stack following cross-review (8 agreed findings).

## [1.13.4] - 2026-07-16

### Changed

- Rewrote the privacy policy strings (rendered by the web app's privacy pages) to describe current features: per-feature external services (Google Drive, GitHub, sign-in, link previews, web page import, images) and actual browser storage usage.

## [1.13.2] - 2026-07-13

### Fixed

- The markdown preview inside a fenced code block now follows the editor body-width setting instead of staying at its own fixed width.

## [1.12.0] - 2026-07-11

### Added

- Wired the note graph panel to the editor side toolbar (viewing only).

### Fixed

- Show the editor frontmatter in edit and review modes.

## [1.11.0] - 2026-07-11

### Added

- Turned the toolbar "Open" button into a menu and integrated Google Drive as an option.
- Added a "New" button and a "Save" menu to the toolbar, with an unsaved-changes guard on new-document.
- Added an "Open from GitHub" entry to the "Open" menu.
- Show a save-target badge (Local / GitHub / Drive) next to the file name in the status bar.
- Render fenced `markdown` code blocks as a rendered preview (markdown-rich).

### Changed

- Renamed overwrite-save for a GitHub-backed document to "Commit to GitHub" and removed the standalone top-right commit button.
- Consolidated ownership of the body draft into draftStorage and removed externalFilePath.
- Unified save-target predicates into hasSaveTarget.

### Fixed

- Fixed the multipart boundary for a new Drive save colliding with the document body.
- Fixed the body being discarded without awaiting completion of an external save.
- Separated the readOnly prop from the user-selected readonly mode, resolving a stuck mode switch.
- Fixed Mermaid labels being stripped by DOMPurify.
- Propagated comment-only changes to draft storage and onContentChange.
- Made the save target a discriminated union so overwrite-save after "Save As" no longer writes to local.
- Stop associating a same-named local file's native handle with a document that came from an external source.
- Fixed a Drive-opened file name reverting to a stale local name in the status bar.
- Fixed overwrite-save being disabled for a body opened from Drive.
- Moved the save keyboard-shortcut hint onto the menu item that actually triggers it.
- Wired the explorer toggle into the side toolbar.

### Security

- Removed forms and inline style from the Mermaid label region and froze the configuration constants.

### Accessibility

- Made the location badge aria-hidden and consolidated location announcement into a single aria-label.
- Stop leaving role/aria-label residue when toggling the preview (markdown-rich).

## [1.10.0] - 2026-07-09

### Added

- `DriveFileSystemProvider`: open a Markdown file on Google Drive by id, detect concurrent edits via revision comparison, and confirm before overwriting through an injected `confirmOverwrite` callback.
- Shared pure helpers for building Google Drive API requests and for capturing the current page as Markdown.

### Changed

- Removed an always-empty handle array and its destroy loop (Sonar S4158).

### Security

- Replaced the code-span protection regex with a linear scan to eliminate a polynomial ReDoS (CodeQL js/polynomial-redos).

## [1.9.1] - 2026-07-02

### Fixed

- Vanilla UI: fixed logic, editor-state subscription, and error surfacing regressions from the de-React migration.
- Markdown-rich: fixed the PlantUML encoder; sanitized KaTeX and print SVG output; completed graph-preview i18n.
- Diff colors are now theme-token-driven; resolved a silent catch in diff position resolution.
- Completed remaining i18n keys, corrected the detached-node check, and finished dead-code removal (pre-merge review follow-ups).

### Security

- Symmetrized web-import sanitization, added origin validation, and unified the `vscodeApi` access path.

### Accessibility

- Vanilla UI: added keyboard operation, aria attributes, and i18n coverage.

## [1.9.0] - 2026-06-30

### Added

- Thinking-method diagrams: new `structure-map` diagram type.
- Edit diagram text in place: click a label in the preview to edit it directly; structure operations move to a "…" popover.
- DSL-derived label editing coverage: structure-map summary-label editing and causal-loop polarity (+/-) inline editing.
- Mindmaps now use a FreeMind-style layout (central root, leaf-count-balanced left/right expansion, bezier curves).
- Body width: new `full` (full screen width) preset.
- Read-only embedding: a lean read-only `<anytime-markdown-view>` custom element and published `view-element` package exports.

### Fixed

- Mindmap child-node overlap resolved (sibling spacing made angle-dependent).
- Inline label editing now blocks line breaks to avoid corrupting the line-based diagram DSL.

## [1.8.0] - 2026-06-27

### Added

- Web page import: fetch a web page by URL, extract its main article with Readability, and convert it to Markdown with Turndown (GFM). Insert at the cursor via the `/web` slash command, or create a new document via the toolbar button. Conversion runs in the editor; an injectable provider supplies the raw HTML per environment, and frontmatter values are escaped to prevent YAML injection.

## [1.7.0] - 2026-06-27

### Added

- mdEmbed transclusion: expand a standalone Markdown link in a paragraph into a collapsible, inline-editable embedded block. The linked Markdown is rendered in a nested editor and written back on edit, with round-trip serialization and a singleton provider that resolves link targets.
- `link` slash command to insert a link inline.
- Comparison mode now marks the changed locations on the minimap.

### Fixed

- Restored the change-overview minimap beside the scrollbar (lost in the vanilla migration).
- Keep the search bar always visible instead of letting it scroll away with the body.
- mdEmbed: resolved save-consistency and edit-conflict handling, the late provider-injection "unconfigured" sticky state, the pending re-fetch when the provider is swapped mid-fetch, and special-character link escaping.
- Prevented change-gutter markers from disappearing by sending live updates as diffs and not re-acquiring the gutter baseline on identical live-patch re-application.

## [1.6.0] - 2026-06-24

### Removed

- Removed the spell-check feature from the editor entirely.

### Changed

- Source mode now wraps long lines when the width is narrowed, unified with the compare-mode behavior.
- Disabled the body-measure width while in paper mode and reordered the settings to paper → body width.
- Consolidated the table inline-toolbar operations into the edit dialog.
- Removed the source-export icon from the diagram inline toolbar.
- Added Anytime Chart / Thinking Diagram sections to the `embed-all` template.
- Unified the image crop-edit screen to a full-screen display.

### Fixed

- Tidied the image-annotation edit toolbar: added a close button to the crop screen, unified the annotation close button to the left edge, and removed the top-right undo button.
- `markdown-rich`: restored the syntax-highlight colors and layout of the code-block edit preview.
- `markdown-rich`: show a live preview in the right pane of the HTML edit screen.

## [1.5.1] - 2026-06-23

### Fixed

- Render the table wrapper (`renderWrapper`) by default in `CustomTable` so wide tables scroll horizontally on narrow viewports. CSS `.tableWrapper { overflow-x: auto }` alone had no effect because `resizable: false` disabled the native TableView that creates the wrapper.

## [1.5.0] - 2026-06-22

### Changed

- Extracted the vanilla UI primitives (14 components + icon set) from `graph-core` into the shared `@anytime-markdown/ui-core` package (internal refactor, no rendering behavior change).
- `markdown-rich`: added combo-stacked / combo-area / markers sample charts to the `anytime-chart` fence.
- `chart-core`: bottom legend layout, category-click drill-down events, and pie charts centered within the full rect.

### Fixed

- `chart-core`: series labels rendered in a near-identical color on bar/area charts now shift their legend adjacently to stay visible.

## [1.4.0] - 2026-06-20

### Added

- Bundled the new `chart-core` package; `anytime-chart` fenced code blocks are now rendered as `<anytime-chart>` Web Components supporting line, bar, horizontal-bar, stacked, area, pie/donut, scatter, composite, and dual-Y-axis chart types, with DPR correction, hover tooltips, and accessibility. Chart palette follows the Japan Digital Agency Dashboard Guidebook.
- Added a **Table** tab to the `anytime-chart` edit dialog for converting between tabular data and chart spec with live right-pane preview. Added a `chart` slash command and quick-start sample selector.
- Added a body-measure width switcher (**Focused / Standard / Wide**) to the settings panel, using em-based presets for improved readability.
- Added 5 new diagram samples to the Mermaid sample gallery.

### Fixed

- Updated Mermaid sample diagrams to fix deprecated and invalid syntax for Mermaid 11.15.
- Applied pre-merge review fixes: eliminated duplicate `chartLayer` instantiation, excluded missing-value points from area charts, added a series-name fallback for empty header columns, and fixed tab selection state propagation.

## [1.3.0] - 2026-06-17

### Added

- Added a frontmatter-derived note graph viewer (document-centric view with backlinks) rendered via `graph-core`.
- Added in-preview WYSIWYG editing for thinking-method diagrams (`anytime-thinking-model`).
- Added a line-number gutter to source mode.
- Added a `.md` drop affordance: dropping a markdown file onto the content area (and the compare-mode left pane) opens it.
- Added a light/dark theme toggle to the side toolbar (later consolidated into the settings panel).

### Changed

- Reworked the side toolbar into a full-height right rail; reordered its actions and moved dark-mode switching into the settings panel.
- Made the save toolbar icon enabled only when there are unsaved changes (dirty gate).
- Removed mode-switch (review/edit/source) items from the right-click context menu; the compare-mode left pane now shows a read-only (review) menu.
- Consolidated compare-mode source display into `InlineMergeView`.
- Aligned editor spacing, scrollbars, focus, and font sizing with the design spec.

### Fixed

- Followed dark mode for the editor root background and source-mode text color.
- Fixed a regression where entering compare mode from source mode briefly showed a single WYSIWYG view.
- Self-supplied chrome theme tokens in the Web Component so backgrounds no longer show through for plain consumers.

## [1.2.0] - 2026-06-13

### Added

- Added the `anytime-markdown-view` Web Component — a React-free custom element for embedding the read-only markdown view (used by web-app `/report`).
- Added an inline font/theme toolbar (`viewerToolbar`) placed directly in the read-only view.

### Changed

- Hardened the Web Component base class for SSR/Node environments (guards against `HTMLElement` being undefined so the class definition no longer throws).
- Switched the default editor logo to the new camel branding (`camel_markdown.png`).

### Fixed

- Fixed body text not wrapping at narrow widths in the read-only view.
- Restored `anytime-markdown-view` to a chromeless (toolbar-hidden), read-only appearance matching the pre-React-removal behavior.

## [1.1.0] - 2026-06-13

### Added

- Aligned editor body design with the design-system spec (spacing, measure, scrollbar styling, unified focus rings).
- Changed the default body measure (line wrap width) to 1000 px.

### Changed

- Upgraded TypeScript to 6.0.3 across the monorepo (toolchain update and bundle-config deduplication).

### Fixed

- Accessibility: raised touch targets to 44 px minimum, unified focus rings, and extended the maximum font-size cap (a11y).
- Fixed a dark-mode regression where right-side toolbar icons disappeared (the root cause was that resetting `style.color` to `""` reverted to the UA default black; applied `"inherit"` in three icon-color reset sites).
- Fixed a regression where the block-edit toolbar overlapped the block body instead of floating above it.
- Fixed a dark-mode regression in `markdown-rich` where Mermaid previews rendered with light-mode colors.
- Fixed the figure-block edit dialog showing a white background and a broken tab-row layout in dark mode.
- Fixed the "About" entry in the more menu not opening its dialog (missing event wiring).

## [1.0.0] - 2026-06-12

### Changed

- **Fully removed React from the editor core.** All NodeViews (footnote, gif, image, table) and the editor chrome (overlays, dialogs, settings panel, UI primitives) are now native/vanilla implementations with no React dependency; the editor and `markdown-rich` packages are React-free.
- Rebuilt the block-edit overlays on a shared vanilla scaffolding (`useBlockChrome` shell, unified portal self-append contract) and promoted the chrome seam to a first-class vanilla host installer/orchestrator.
- Introduced a vanilla UI primitive kit (30+ components) replacing the former React wrappers across all three consumers.
- Inverted the `markdown-rich` codeblock architecture to a native content NodeView with string/embed/math-graph previews and a full-screen edit dialog.
- Extracted React islands (embed/graph previews) into the separate `markdown-react-islands` package injected via a registry, keeping the viewer/rich cores React-free.

### Removed

- Deleted the legacy React editor implementation (136 source files, 27 CSS files, 148 tests) and retired the `markdown-react` package.

### Fixed

- Restored `.tiptap` content CSS on the vanilla path (heading decorations were missing).
- Restored the slash command menu (34 commands incl. templates), the search & replace bar (Mod+F), outline fold synchronization with progressive unfold, and the side-toolbar/top-toolbar view-toggle exclusivity on the vanilla path.
- Made empty code blocks visible and clickable again (block-level contentDOM) and restored `role="switch"` on the dark mode toggle.
- Restored the beforeunload guard, comment dialog wiring, and read-only re-check on the vanilla host.
- Fixed the trailing-newline loss in merge source mode and restored compare-mode codeblock editing across both editors.
- Restored keyboard shortcuts, the help entry point, status-bar targeting, and a mount error fallback on the vanilla path.
- Fixed `update(externalCompareContent)` null close and transition detection.
- Expanded MUI `sx` shorthands in `ui/GlobalStyle`, fixing the heading hover label regression.

## [0.18.0] - 2026-06-08

### Changed

- Removed all `@mui/material` and `@mui/icons-material` usage from the editor chrome, replacing it with an in-house `ui/` primitive kit (layout, buttons, forms, feedback, overlays, dialogs, tooltips, menus, drawers, popovers, selects) and vendored icons (MUI reduction Phase 3a/3b).
- Replaced MUI `GlobalStyles` with a stylis-based `ui/GlobalStyle`, and `useTheme` / `useMediaQuery` with an in-house `ThemeModeContext` (`useIsDark`) and media-query hook.
- Dropped `@mui/*` and `@emotion/*` from peer dependencies and removed `@mui` from the test suites.

### Fixed

- Fixed compare mode rendering the imageRow badge as a vertical stack.

## [0.17.0] - 2026-06-03

### Changed

- Extracted the framework-agnostic `diffEngine` and sanitize cluster into the new `@anytime-markdown/markdown-engine` package; `sanitizeMarkdown` is now DOM-agnostic.
- Extracted a shared editor theme CSS variable injector (`applyEditorThemeCssVars`) and a shared Tiptap content-style composer, unifying compare-mode styles with the normal editor.
- Pointed the `Extension` import at `@anytime-markdown/markdown-core`.

### Performance

- Deferred full `onUpdate` serialization off the keystroke path.
- Cached the diagram aggregate in plugin state for the toolbar.

### Fixed

- Shared the imageRow flex layout with the compare view (regression).
- Declared the React node-view `renderer` field so it survives the SWC class-field reset (markdown-core regression).

## [0.16.0] - 2026-05-31

### Changed

- Renamed the package from `@anytime-markdown/markdown-core` to `@anytime-markdown/markdown-viewer`.
- Migrated to vendored Tiptap v3.20.0: `@tiptap/*` imports now resolve to the `@anytime-markdown/markdown-*` vendored namespace instead of npm packages. `prosemirror-tables` is imported via `@tiptap/pm/tables`.
- Relocated the rich code-block cluster (diagrams, PDF dark-diagram rendering) to `@anytime-markdown/markdown-rich`, removed those re-exports from the public API, and now inject the `codeBlock` extension via `getBaseExtensions`. A shared API is exposed for `markdown-rich`.

## [0.15.6] - 2026-05-27

### Changed

- SonarCloud code quality improvements: removed unnecessary type assertions (S4325), and S4624 / S2004 / S4043 / S7744 / S3735 fixes. No functional changes.

## [0.15.5] - 2026-05-24

### Added

- Added i18n label keys for the landing footer mindmap viewer link (en.json / ja.json)

## [0.15.4] - 2026-05-21

### Changed

- Resolved SonarCloud findings across `markdown-core` (S7780 `String.raw`, S6582 optional chaining, S6653, S7776, S3358 nested ternary, and others)

## [0.15.3] - 2026-05-20

### Changed

- Refactored `MarkdownEditorPage` editor-init effect by extracting `applyInitialFontSizeOnce` and `buildEditorPortalTarget` helpers to reduce cognitive complexity (S3776)

### Security

- Bumped `mermaid` to 11.15.0 to patch Gantt DoS (GHSA-6m6c-36f7-fhxh) and CSS/HTML injection CVEs (GHSA-xcj9-5m2h-648r, GHSA-87f9-hvmw-gh4p, GHSA-ghcm-xqfw-q4vr)

## [0.15.2] - 2026-05-17

### Changed

- Replaced `next/dynamic` with `React.lazy` for client-only components so `markdown-core` no longer carries a Next.js runtime dependency when consumed by non-Next hosts (VS Code webviews, VS Code extension bundles)
- Documentation references to AI Note now point to the new Anytime Agent extension

## [0.15.1] - 2026-05-16

### Fixed

- Table cell text now escapes `|` to `\|` so column pipes survive round-trips
- `SourceModeEditor` syncs textarea height to mirror so the textarea fills the editor
- Image URL serialization escapes backslashes to keep raw markdown round-trip safe
- Logged silent mode-switch failures instead of swallowing them

### Changed

- Dropped redundant `spreadsheet-core` dependency from `markdown-core`

### Security

- 4 webview message listeners now verify the message origin before handling events

## [0.15.0] - 2026-05-15

### Changed

- Migrated `markdown-core` to self-contained i18n (no longer reuses `trail-viewer` or sibling i18n packages)
- Exposed messages via a public subpath so client-only deps stay out of server bundles

### Fixed

- Avoided `navigator` access and broken dynamic import resolution in non-browser bundles
- Wrapped `mcp-markdown` `server.tool()` calls to suppress MCP SDK TS2589 depth errors
- Hardened `updateSection` edge-case coverage and integration sanitize tests

## [0.14.1] - 2026-05-06

### Fixed

- Admonition initial render glitch and trailing newline accumulation

### Security

- Fixed remote-property-injection and log-injection issues flagged by CodeQL

### Changed

- Improved test coverage for `ssrfGuard`, `embedSeenStore`, and `embedCache`

## [0.14.0] - 2026-05-04

### Fixed

- Admonition serializer now falls back gracefully for unknown node types
- React component props wrapped in `Readonly` (Sonar S6759)
- Removed unnecessary type assertions (Sonar S4325)
- Replaced global `parseInt`/`parseFloat` with `Number.parseInt`/`Number.parseFloat` (Sonar S7773)
- Inverted negated ternary conditions for clarity (Sonar S7735)
- Replaced literal string `replace` with `replaceAll` (Sonar S7781)

### Changed

- Extracted helpers from `parseTagAttributes`, `classifyEmbedUrl`, `parseEmbedInfoString`, `isPrivateAddress` to reduce cognitive complexity (Sonar S3776)
- Extracted action and dialog helpers from `TableNodeView` and `ImageNodeView` (Sonar S3776)
- Extracted diagram block kind/toolbar helpers from codeblock extension (Sonar S3776)
- Extracted drop helpers from `applyDropAction` in plugins (Sonar S3776)
- Extracted handler ternaries in `MarkdownEditorPage` (Sonar S3776)
- Preferred `globalThis.localStorage` over `window.localStorage` (Sonar S7764)
- Replaced array-index keys with stable composite keys (Sonar S6479)

## [0.13.4] - 2026-05-02

### Fixed

- Make admonition newline serialization idempotent

### Changed

- Updated i18n strings (en/ja) for press page content

## [0.13.3] - 2026-04-28

### Fixed

- Reworked embed excerpt and OGP/frontmatter parsing paths to avoid regex backtracking hotspots (`S5852`)
- Updated escaping in comment serialization and regex literals to satisfy secure/string-escape Sonar findings (`S7780`)
- Updated RSS parsing to match the current `@xmldom/xmldom` handler type and keep feed parsing compatible

## [0.13.2] - 2026-04-26

### Fixed

- Backslash characters no longer multiply inside admonition blocks

### Changed

- Removed dark/light mode toggle icon from `ReadonlyToolbar`

## [0.13.1] - 2026-04-25

### Changed

- Refresh Anytime Trail LP benefit copy with visualization framing (structure / behavior / quality)

## [0.13.0] - 2026-04-24

### Added

- Embed block system: URL classifier, info string parser, SSRF guard, `EmbedProvider` interface
- `EmbedProviders` context with `useEmbedData` hook (LocalStorage cache, in-flight de-duplication)
- Embed node views: `OgpCardView` (card / compact), `YouTubeEmbedView`, `FigmaEmbedView`, `SpotifyEmbedView`, `TwitterEmbedView` (widgets.js), `DrawioEmbedView`
- `EmbedNodeView` dispatcher and `EmbedBlock` codeBlock routing
- `/embed` slash command and embed edit dialog
- Embed update detection: `embedSeenStore`, OGP / RSS fingerprint utilities, `rssDiscovery`, `rssParser`, `fetchRss` provider interface, `embedUpdateCheck` entry point with badge UI
- Tweet HTML sanitizer, OGP HTML parser
- Image-style width resize for embed card variant; width persisted through the embed info string

### Fixed

- Preserve full embed info string through markdown roundtrip
- Restore embed block layout from `inline-block` `fit-content` to `block`
- Use flex instead of grid for `imageRow`; apply `fit-content` to the inner box to eliminate gaps
- Use the Web Crypto API directly and polyfill jsdom `TextEncoder` / `crypto` for node tests

### Changed

- Tighten embed update detection internals

## [0.12.0] - 2026-04-23

### Added

- `MarkdownMinimap` component: document minimap with scroll-synced viewport indicator and click-to-jump
- `useMarkdownMinimap` hook: computes heading/diff marker positions as scroll ratio list

### Fixed

- Minimap scroll container now tracks `.tiptap` element for correct scroll sync
- Minimap no longer overlaps the scrollbar
- Removed viewport indicator from minimap rendering

### Changed

- Extracted spreadsheet functionality into `@anytime-markdown/spreadsheet-core` and `@anytime-markdown/spreadsheet-viewer` packages
- Migrated `TableNodeView` to the `SheetAdapter` interface via `createTiptapSheetAdapter`
- Removed the legacy `components/spreadsheet/` directory and the tiptap table wrappers `useSpreadsheetSync`
- Moved viewer-only i18n keys to `spreadsheet-viewer`; `markdown-core/i18n/index.ts` merges them before re-exporting
- Applied sumi-e light palette and violet warning colors to the design system theme
- Enabled `showApply` and `showRange` in `TableNodeView` spreadsheet editor

## [0.11.4] - 2026-04-19

### Added

- i18n keys for Trail Viewer and Markdown Editor CTA link labels and descriptions (ja/en)

## [0.11.3] - 2026-04-18

### Added

- Collapse frontmatter by default when opening a file

### Changed

- Remove Note treeview (moved to vscode-trail-extension)

## [0.11.2] - 2026-04-12

### Fixed

- Fix `.gitignore` pattern that inadvertently excluded `trail-core/src/c4/coverage/` source files from version control

## [0.11.1] - 2026-04-12

### Changed

- Added `json-summary` to jest `coverageReporters` for E2E coverage integration
- Minor i18n string fixes

## [0.11.0] - 2026-04-11

### Changed

- Reduce cognitive complexity in TableNodeView, MathBlock, MarkdownEditorPage, ImageNodeView, DiagramBlock (SonarCloud S3776)
- Reduce cognitive complexity in tableCellModeKeymap, tableCellModeMouse, tableCellModeClipboard, handlePaste (SonarCloud S3776)

## [0.10.4] - 2026-04-09

### Added

- i18n translation key for Trail navigation label

## [0.10.3] - 2026-04-08

- Version sync with vscode-markdown-extension

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
