# Changelog

All notable changes to `@anytime-markdown/editor-core` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-03-11

### Added

- Auto-detection mode for section numbers (auto-numbering when less than 50% of headings have manual numbers)
- Auto-detect diagram type and set aria-label on diagrams (Mermaid/PlantUML) (WCAG SC 2.5.7)
- Alt+Arrow keyboard shortcut for reordering outline headings (WCAG SC 2.5.7)
- +/- prefix in diff view for non-color-dependent information (WCAG SC 1.4.1)
- aria-invalid and error display on dialog input fields (WCAG SC 3.3.1)
- Unit tests for sanitizeMarkdown (50 tests)
- BoundedMap utility (size-limited Map with FIFO eviction)
- ESLint rules (type assertion restriction, non-null assertion warning, console restriction, import sorting)

### Changed

- Unified background color for source mode and fullscreen dialogs with code blocks
- Split EditorToolbar from 588 to 393 lines (extracted ToolbarFileActions, ToolbarMobileMenu)
- Split MergeEditorPanel and InlineMergeView to under 500 lines (extracted mergeTiptapStyles, LinePreviewPanel)
- Consolidated EditorToolbar props into 4 objects (48 to 17 props)
- Extracted common function from 3 duplicated source-to-WYSIWYG sync logic
- Consolidated editor.storage casts into type-safe helpers (getEditorStorage/getMarkdownStorage)
- Reduced MarkdownEditorPage to 361 lines (869 to 579 to 361 lines)
- Changed default font size to 16px
- Improved light mode readability
- Removed line-height UI setting; now theme-linked (light 1.6 / dark 1.8)
- Improved contrast ratio of readonly checkbox and tooltip (WCAG SC 1.4.3)
- Pinned dependency versions to exact in package.json
- Internationalized aria-label attributes (previously English-only)
- Added dark mode support to global-error.tsx

### Fixed

- Added AbortController timeout to external requests
- Prevented unbounded memory growth of svgCache/urlCache with BoundedMap
- Added error logging to empty catch blocks (SlashCommandMenu, useDiagramCapture)
- Added cancellation to useLayoutEditor useEffect
- Removed 21 unused variables and imports
- Fixed editor bottom being cut off when frontmatter is displayed
- Fixed font size setting not reflecting in real-time
- Removed unnecessary `as any` cast in useSourceMode

### Security

- Fixed Symlink Path Traversal vulnerability in tar package
- Added origin validation to PlantUML URL construction (SSRF prevention)
- Replaced regex-based HTML tag removal with DOMParser.textContent
- Replaced regex in commentHelpers with indexOf-based approach (ReDoS prevention)
- Added origin validation to fetchFromCdn URL construction (SSRF prevention)

## [0.3.0] - 2026-03-10

### Added

- YAML frontmatter recognition, preservation, and editing support
- Browser spell check setting in settings panel
- Confirmation dialog for frontmatter deletion
- Line-level merge in fullscreen code comparison
- Left/right code comparison in fullscreen view during compare mode
- Synced block expand/collapse between left and right editors in compare mode
- Enabled cursor display and text selection in readonly/review mode

### Fixed

- Fixed consecutive blank lines being collapsed when inserting templates in edit mode
- Fixed NodeViews (diagrams, images, tables) disappearing when toggling compare mode

[Unreleased]: https://github.com/anytime-trial/anytime-markdown/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/anytime-trial/anytime-markdown/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/anytime-trial/anytime-markdown/releases/tag/v0.3.0
