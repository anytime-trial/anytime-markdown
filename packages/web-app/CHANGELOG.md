# Changelog

All notable changes to `@anytime-markdown/web-app` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.21.0] - 2026-04-28

### Added

- Added/expanded press-page visual features (parallax caravan, oasis timing, seasonal vignette refinements)

### Changed

- Refactored shared press utilities to reduce duplication and improve maintainability

### Fixed

- Fixed press-page responsive and visual regressions (layout breakpoints, icon sizing, dark-mode camel rendering)
- Updated WSJ RSS parsing string handling to satisfy Sonar escape recommendations
- Applied docs-index frontmatter parsing hardening to avoid regex backtracking hotspots

## [0.20.1] - 2026-04-26

### Fixed

- Limit WSJ news articles to 3 on press page
- Stack latest reports section vertically at ≤880px viewport
- Place Anytime Trail title full-width at top, embed and list side by side below
- Always place briefing verdict below description regardless of viewport width
- Extend briefing mobile layout breakpoint from 600px to 880px
- Add top padding to 2nd/3rd trending columns on mobile
- Stack news section header vertically on mobile (≤880px)
- Shrink mobile briefing number column from 56px to 24px
- Reduce mobile briefing column gap from 18px to 10px
- Tighten mobile briefing list spacing to match newspaper style
- Move shipped badge below description on mobile (≤600px)
- Remove №/DISPATCH label and filed timestamp from press dispatch section
- Add top margin between stacked doc category columns at ≤560px
- Replace SVG sun circles and camel paths with fixed-size CSS elements to prevent squishing on narrow viewports
- Fix camel SVGs squished to 0px by over-broad `.caravan svg` selector

## [0.20.0] - 2026-04-26

### Added

- Seasonal vignette (水墨画風 ink wash style) to masthead, updated daily via deterministic day seed
- 二十四節気 (24 solar terms) display in masthead edition line
- 和風月名 (traditional Japanese month names) in masthead edition date (JA locale)
- 漢数字 (kanji numerals) for day and year in masthead edition date (JA locale)
- 大字 (formal kanji: 壱弐参肆伍陸漆捌玖拾) for kanji numeral conversion
- 十二支の刻 (zodiac hour) in masthead replacing 朝刊 (JA locale)
- GitHub Trending section (daily/weekly/monthly top 5) on press page
- Latest daily/weekly reports section on press page
- Docs section on press page using CMS layout data
- `#news` anchor link to Masthead nav
- Dynamic edition date in masthead (always shows today)

### Changed

- News source reverted to The Guardian API
- `PressDocsSection` redesigned to colophon-style flat list
- Press page sections reordered
- Restored `/docs/edit` and updated middleware redirect target to `/docs/view`

### Fixed

- `docs/view` breadcrumb now links to home
- Press-reports category filter uses `includes` match
- `pressDocs` link font changed to `font-body` for consistency
- `pressDocs` item font size increased to `fs-body` (16px)
- News section heading renamed to "本日のニュース" / "Today's News"
- Added `scroll-margin-top` to newsfront section anchor

## [0.19.0] - 2026-04-26

### Added

- Theme toggle button in `LandingHeader`

### Changed

- Replaced locale `ToggleButtonGroup` with a compact toggle button in `LandingHeader`
- Removed `SiteFooter` from `/docs`, `/docs/view`, `/docs/edit`, `/report`, `/report/[slug]`, and `/privacy`

## [0.18.0] - 2026-04-25

### Added

- New landing page (Press) promoted to top route (`/`); redirect `/press` → `/`
- Press page sections: Masthead, Headline, Dispatch, Briefing (Trail Viewer + Markdown Viewer embeds), PullQuote, Ticker, CtaStrip, Colophon
- JA Headline title with ruby annotations via `next/font` Yuji Boku brush font
- Locale toggle (EN / JA) in Masthead
- Progress rule scroll-bound indicator
- Dynamic web-app version display in Headline aside meta
- Robots and sitemap entries for the press page
- Font integration: Bodoni Moda, Shippori Mincho, Yuji Boku, JetBrains Mono

### Changed

- Promote `/press` as top page; top page now serves the full press layout
- Refresh Anytime Trail LP benefits copy with visualization framing

## [0.17.0] - 2026-04-24

### Added

- `/api/ogp` route with SSRF guard and `rawHtml` response for RSS discovery
- `/api/oembed` route for Twitter embeds
- `/api/rss` route with `fetchRss` provider implementation
- Inject embed providers via `EmbedProvidersBoundary` for web clients
- Add embed provider domains (YouTube / Figma / Spotify / Twitter / Drawio) to CSP `frame-src`
- Change browser tab favicon to brand logo

### Changed

- Allow all HTTPS images in CSP `img-src` for embed / OGP thumbnails
- Update Next.js 16.2.3 → 16.2.4 for security fixes

### Fixed

- ESLint import-sort warnings and remove non-null assertion

## [0.16.0] - 2026-04-23

### Added

- `LandingHeader` on `/graph` page
- `/sheet` page for spreadsheet editor (behind `NEXT_PUBLIC_SHOW_SHEET` feature flag)
- Theme-aware scrollbar styles (amber dark / ink light)

### Changed

- Replace landing header logo with Anytime Trail wordmark
- Expand MUI theme palette: `data-theme` attribute, sumi-e heading borders
- Switch `/sheet` page to `InMemoryWorkbookAdapter`
- Resolve 73 pre-existing TypeScript errors in test files

## [0.15.2] - 2026-04-19

### Added

- Trail Viewer CTA link button below embedded Trail Viewer on landing page
- Markdown Editor CTA link button below Markdown Preview on landing page
- `LandingHeader` on `/markdown` editor page

### Changed

- Align Trail and Markdown section container width to `md` (matches "Why Camel" section)
- Match Markdown Preview height to Trail Viewer embed (`clamp(320px, 40vh, 550px)`)
- Reduce top padding above Markdown Preview section
- Remove home icon from Markdown editor toolbar (replaced by LandingHeader)

### Fixed

- Add `region1.google-analytics.com` to CSP `connect-src` for GA4 data collection
- Improve SEO metadata: add `/trail` and `/report` to sitemap, unify description to English, add `openGraph.url`
- Add `ハーネスエンジニアリング` keyword to SEO description

## [0.15.1] - 2026-04-19

### Changed

- Convert Hero background image from PNG to WebP and use `next/image` for improved performance

## [0.15.0] - 2026-04-19

### Added

- Camel-themed Hero background images for light and dark mode on landing page
- "Why Camel?" section to landing page
- Spotify and YouTube playlist pages (`/spotify`, `/playlist`)
- Spotify and YouTube API routes (`/api/spotify/*`, `/api/youtube/*`)
- Quality metrics API route (`/api/trail/quality-metrics`) for DORA metrics visualization
- Spotify library (`src/lib/spotify.ts`) and YouTube library (`src/lib/youtube.ts`)

### Changed

- Strengthen light-mode Hero overlay for better text readability
- Update VS Code page (`VsCodeBody`) layout and content

## [0.14.1] - 2026-04-18

### Added

- Embed interactive TrailViewer (600px) below trail3 section on landing page
- Embed interactive TrailViewer with browser-frame style below trail4 section on landing page
- Wrap MarkdownViewer in macOS-style window frame on landing page

### Changed

- Replace dynamic `viewerHeight` calculation with fixed 500px for MarkdownViewer embed

## [0.14.0] - 2026-04-18

### Added

- AI agent monitoring framing to Trail section on landing page
- Extension icons in section titles on landing page
- Instant 3-mode switching to Markdown features

### Changed

- Reorder landing page sections — Trail first, Markdown second
- Reorder navigation items — Analytics / Report / Docs / Graph
- Move online editor link to header (removed from hero/CTA)
- Trail feature descriptions polished: Code Mapping, Real-time Visualization, Traceability, Visual AI Briefing
- Reorder Markdown benefits — preview → auto-lock → 3-mode
- Hero description refactored to single cohesive flow with AI framing

## [0.13.0] - 2026-04-13

### Added

- Multi-repository C4 model support via shared `IC4ModelStore`
- `/api/c4/dsm` endpoint serving release DSM from SQLite

### Changed

- Unify `TrailViewer` with `useTrailDataSource` HTTP path
- Unify `C4Viewer` with `useC4DataSource`
- Remove unused `/c4model` page and legacy `/api/c4model` route
- Remove `c4Matrix` from DSM pipeline

### Fixed

- Force dynamic rendering for `/api/c4/*` routes
- Fall back to `NEXT_PUBLIC_` Supabase env vars in API routes
- Show C4 tab once releases are loaded (not dependent on `c4Model`)
- Always pass `c4` prop to `TrailViewerCore` (match extension behavior)
- Trigger DSM build after analyze and pass query to `/api/c4/dsm`
- Reset C4/DSM/Coverage state on fetch failure or 204 response
- Fall back to SQLite `current_graphs` for `/api/c4/dsm?release=current`

## [0.12.4] - 2026-04-12

### Fixed

- Fix `.gitignore` pattern that inadvertently excluded `trail-core/src/c4/coverage/` source files from version control, causing CI build failure

## [0.12.3] - 2026-04-12

### Added

- C4 tab in trail viewer page using `/api/c4model` endpoint
- Japanese translations for header nav items
- Releases data passed to `TrailViewerCore`

### Changed

- Removed C4 Model nav link; renamed Trail to Analytics in header navigation

## [0.12.2] - 2026-04-11

### Changed

- Reduce cognitive complexity in useCanvasInteraction, GraphEditor, GraphCanvas, useDataMapping (SonarCloud S3776)
- Fix SonarCloud issues: use Number.parseInt (S7773), use replaceAll (S7781), localeCompare for sort (S2871), optional chaining (S6582), consolidate duplicate drag cursor branches (S1871), remove unnecessary assignment (S1854)

## [0.12.1] - 2026-04-09

### Added

- Trail navigation link in landing page header

## [0.12.0] - 2026-04-08

### Added

- Trail API routes (`/api/trail/*`) for session data
- `/trail` page for Claude Code conversation trace viewing

### Fixed

- Turbopack build errors for trail-viewer integration

## [0.11.0] - 2026-04-07

### Added

- E2E coverage collection with V8 → Istanbul reporter
- `/api/c4model` endpoint to fetch c4-model.json from GitHub docs repository
- `/api/docs/github-content` endpoint for GitHub-sourced document viewing
- Document links in C4 Viewer now open in `/docs/view` instead of GitHub

### Changed

- Renamed `/modeling` route to `/c4model`
- Consolidated `DOCS_GITHUB_REPO` / `NEXT_PUBLIC_DOCS_GITHUB_REPO` into single server-side env var

### Fixed

- SonarCloud issues (S1854, S6557, S4624, S6481, S3358, S6582)
- HTML sanitization for pasted content (security)
- Rate limiting for C4DataServer HTTP endpoints

## [0.10.1] - 2026-04-05

### Added

- Restructure landing page as twin-product (md / md2) layout
- Add skill-based instruction description to md2 benefit
- Add home logo link to editor toolbar

### Fixed

- Handle 204 No Content in initial data fetch

### Changed

- Extract shared C4 viewer components to graph-core package
- Remove web app remote data source, use standalone viewer only

### Accessibility

- Add keyboard navigation and ARIA to DSM/Graph canvas
- Fix contrast ratios to meet WCAG AA 4.5:1
- Add keyboard resize and ARIA to split bar
- Add aria-pressed to buttons, aria-live to connection status

## [0.10.0] - 2026-04-04

### Added

- Modeling page with C4 architecture diagram viewer and graph visualization
- C4Viewer component for rendering C4 models via graph-core
- Cytoscape.js integration: demo, editor, viewer pages and hub navigation
- .graph file import to graph editor toolbar
- LandingHeader component for /modeling page
- Default C4 diagram on /modeling initial render

### Changed

- Rename /trail route to /modeling

### Fixed

- Logo image path updated from /help/ to /images/
- Fallback to non-localized .md when locale-specific file is missing
- Resolve ESLint warnings across web-app
- Stabilize C4 wheel zoom with refs for viewport/dispatch

## [0.9.3] - 2026-04-01

### Fixed

- Fix landing page crash (Something went wrong) caused by Turbopack dynamic import failure in i18n request config
- Fix React 19 hydration mismatch in LocaleProvider where server/client locale diverged

## [0.9.2] - 2026-04-01

### Changed

- Upgrade Next.js 15.5.14 → 16.1.7 with Turbopack as default bundler
- Add Turbopack config for .md file loader
- Remove deprecated eslint config from next.config.ts
- Integrate path highlight, node filter, and filter panel into GraphEditor
- Add useDataMapping hook and DetailPanel component

### Security

- Upgrade next to 16.1.7 for CVE-2026-27980
- Add @auth/core 0.41.1 override for SNYK-JS-AUTHCORE-13744119
- Add path traversal prevention for image download

## [0.9.1] - 2026-03-30

### Changed
- Adjusted layout padding and removed unused navigation

## [0.9.0] - 2026-03-29

### Added
- Cloudflare Pages build support with ESLint skip during builds

### Changed
- CI: job timeout increased from 30 to 45 minutes
- CI: daily-build.yml actions/setup-node v5 → v6
- CI: develop push tsc/ESLint restored after temporary removal

## [0.8.5] - 2026-03-28

### Changed
- Updated help files with renamed template assets
- CI: upgraded Node.js 22 to 24 LTS, actions/setup-node v5 to v6
- CI: added Netlify deploy check job and `netlify.toml`

### Fixed
- npm audit fix: resolved brace-expansion and path-to-regexp vulnerabilities

## [0.8.4] - 2026-03-28

### Added
- Report blog page: S3 Markdown fetch/display with list and detail pages
- `MarkdownViewer` component with frontmatter parsing and breadcrumbs
- Report link always shown in navigation; Graph/Report nav links toggle via env vars
- Refactored S3 client initialization to use `cms-core`

### Fixed
- SSR hydration mismatch in theme provider
- SonarCloud issues in multiple components (GraphCanvas, PropertyPanel, ToolBar, graphStorage, etc.)

### Security
- handlebars updated to 4.7.9 (CVE-2026-33916)

## [0.8.3] - 2026-03-27

### Fixed
- MCP: Wrapped top-level await in async main for tsx compatibility

## [0.8.2] - 2026-03-25

### Fixed
- Next.js version mismatch prevention

## [0.8.1] - 2026-03-25

### Changed
- Updated Next.js to 15.5.14 (security fix)
- Updated @modelcontextprotocol/sdk to 1.27.1 (security fix)

### Fixed
- Fixed test type errors for Next.js 15.5.14 compatibility

## [0.8.0] - 2026-03-25

### Added
- MCP Server: `mcp-markdown` package with 7 tools (read/write, outline, section, sanitize, diff)

### Changed
- Renamed `editor-core` package to `markdown-core`

## [0.7.7] - 2026-03-23

### Changed
- CI: reuse VSIX artifact from CI job in publish (eliminates duplicate build)
- CI: auto-create GitHub Release with VSIX attachment on publish
- CI: use `.node-version` file for consistent Node.js version across local and CI
- CI: add `.gitattributes` for consistent line endings (`eol=lf`)
- CI: change daily build schedule to JST 5:00

## [0.7.6] - 2026-03-22

### Added
- Breadcrumb navigation with document title on /docs/view page
- next-auth v5 (Auth.js) migration with type-safe session handling

### Fixed
- Website accessibility: contrast ratios, aria-hidden on icons, keyboard support for InlineEditField
- Removed dead code (LandingPage/LandingBody), debug console.warn, globalThis usage
- CTA buttons extracted to shared VsCodeCtaButtons component
- Hero heading structure simplified (single h1 with span children)

## [0.7.5] - 2026-03-22

### Changed
- Landing page hero text changed to "Collaborate with AI"
- VS Code landing page Benefits section: added maxWidth constraint for wide screens

### Fixed
- VS Code landing page double scrollbar issue

## [0.7.4] - 2026-03-22

### Fixed
- middleware.ts config.matcher with String.raw causing Next.js build failure
- VS Code link disappeared from SiteFooter
- e2e test landing page wait locator fix

## [0.7.3] - 2026-03-22

### Added
- VS Code extension landing page (/vscode) with features, benefits, and Marketplace link
- Top page and VS Code page cross-navigation links
- Privacy policy updated to focus on editor features
- NEXT_PUBLIC_ENABLE_DOCS_EDIT flag to hide /docs/edit in production

### Changed
- Removed "open editor" button from landing page hero section
- docs/view block elements aligned to left
- Footer VS Code link changed from Marketplace to /vscode page
- SonarQube remaining CODE_SMELL fixes (S2681, S6479, S3358, S6478, S4624, etc.)

### Fixed
- File list language badge English detection fixed to .en.md suffix
- commentHelpers String.raw backtick conflict fix
- Firefox CI e2e test: GPU disabled and xvfb-run added

## [0.7.2] - 2026-03-22

### Changed
- TypeScript target upgraded to ES2023 for findLast and other modern APIs (S7750)
- SonarQube remaining CODE_SMELL fixes

### Fixed
- docs upload API basename extraction not working correctly
- Firefox CI e2e test crash resolved

## [0.7.1] - 2026-03-22

### Added
- /docs/view: locale-aware language switch (.ja.md/.en.md auto-detection, folder key support)
- /docs/edit: folder D&D improvement (show folder name instead of expanding all files)
- /docs/edit: overwrite confirmation dialog for folder upload
- /docs/edit: language badges (JA/EN) in folder list

## [0.7.0] - 2026-03-21

### Added
- /screenshot slash command (Web only)
- Landing page: Markdown document display, font size toggle icon
- CMS JA/EN badge display for md file pairs in file list

### Changed
- Landing page: feature cards section replaced with Markdown display

## [0.6.4] - 2026-03-20

### Added
- CI bundle size report added (daily-build + PR)

### Changed
- ExplorerPanel split into smaller components and hooks

### Fixed
- E2E tests updated to follow UI changes (settings panel, Edit button selector)
- Local E2E test retry added (Firefox flaky test fix)

## [0.6.3] - 2026-03-20

### Security
- sonarcloud job permissions added (least privilege principle, CodeQL CWE-275)

### Changed
- SonarCloud scan and coverage integration added to publish workflow
- e2e tests changed to expect-based waiting (CI flaky test fix)

## [0.6.2] - 2026-03-20

### Changed
- SonarCloud CRITICAL 23 resolved: Cognitive Complexity functions split into helpers and subcomponents
- lint warning 36 resolved (unused imports, non-null assertions, console.log → warn)
- Site URL changed to `www.anytime-trial.com`
- GitHub username changed to `anytime-trial`

### Fixed
- SonarCloud BUG: `error.tsx` function name `Error` → `ErrorPage` (reserved word conflict)
- flatted Prototype Pollution vulnerability fix (npm audit fix)

### Security
- GitHub Actions permissions moved from workflow level to job level (least privilege principle)

## [0.6.1] - 2026-03-20

### Changed
- GitHub username changed from `kiyotaka-ueda` to `anytime-trial`

## [0.6.0] - 2026-03-19

### Changed
- GitHub API utilities consolidated, ExplorerPanel split

### Fixed
- GitHub explorer file selection infinite loop fix
- Service Worker navigationPreload warning fix

### Security
- overwriteImage/saveClipboardImage path traversal fix (directory boundary check)

## [0.5.0] - 2026-03-15

### Added
- English version of defaultContent with language-based selection
- Landing page: table editing, math, GitHub integration feature cards added
- HTML block sample added to defaultContent

### Changed
- README.md translated to English

## [0.4.1] - 2026-03-12

### Added
- File handle persistence (IndexedDB) for save-in-place and filename display after reload
- FileSystemFileHandle acquisition on drag-and-drop for direct overwrite save
- Editor area background color change on file drag for visual feedback

## [0.4.0] - 2026-03-11

### Added
- WCAG2.2 AA audit report and full code review report
- CHANGELOG (markdown-core, web-app)

### Changed
- package.json dependency versions pinned to exact
- aria-label English-only replaced with i18n support
- global-error.tsx dark mode support

### Fixed
- External communication AbortController timeout added
- useLayoutEditor useEffect cancellation added
- 21 unused variables/imports removed

### Security
- tar package Symlink Path Traversal vulnerability fix

## [0.3.0] - 2026-03-10

### Added
- SEO improvements: OG image dynamic generation, Twitter Card, JSON-LD structured data, per-page meta

## [0.2.8] - 2026-03-09

### Fixed
- Netlify CDN cache causing API responses to return stale data

## [0.2.7] - 2026-03-08

### Fixed
- /api/docs/content production cache fix (force-dynamic added)
- Dockerfile cleanup (Playwright browser install under node user)

## [0.2.6] - 2026-03-08

### Fixed
- /docs/view page production cache fix (force-dynamic added)

## [0.2.5] - 2026-03-08

### Added
- GitHub MCP server auto-configuration in devcontainer

### Fixed
- /docs/view showing wrong document (Next.js Data Cache disabled, Vary header added)
- /docs page server cache disabled (revalidate → force-dynamic)
- _layout.json fetched directly from S3 instead of CDN cache
- /privacy page language switch not reflecting (separated into client component)

## [0.2.1] - 2026-03-08

### Added
- Daily build check and weekly cache cleanup CI workflows

### Fixed
- Document list not updating after deletion
- Document list API Next.js server-side cache disabled
- Document API cache control improved (Cache-Control header added)

### Security
- HSTS header added to security headers

## [0.2.0] - 2026-03-08

### Added
- /docs page redesigned to GitHub Docs-style category layout
- Category item label editing, tooltip display, and drag reordering
- URL link item category addition (external URL and relative path support)
- LandingHeader added to /privacy page
- Readonly mode (environment variable controlled)

### Changed
- Layout data structure changed from LayoutCard to LayoutCategory
- AWS environment variables prefixed with ANYTIME_
- Header logo click navigates to top page

### Fixed
- docs/view showing wrong document content (localStorage cache conflict)
- HMR loading flash prevention
- blockquote empty line and list/table hard break round-trip fix

## [0.0.8] - 2026-03-01

### Added
- Landing page at `/` (Hero, Features, editor preview, Footer)
- Editor moved to `/markdown` route
- Landing page EN/JA language switch
- VS Code Marketplace link added to footer

### Changed
- PWA start_url changed to `/markdown`

## [0.0.7] - 2026-03-01

### Added
- Nonce-based CSP implemented in middleware (unsafe-inline removed from script-src)
- Playwright E2E tests
- OpenGraph metadata

### Security
- HTML sanitization changed to allowlist approach
- CSP script-src migrated from unsafe-inline to nonce-based

## [0.0.5] - 2026-02-28

### Added
- Landing page mobile support
- Browser/OS language setting auto-detection for initial language

## [0.0.4] - 2026-02-28

### Added
- web-app test suite

## [0.0.3] - 2026-02-27

### Changed
- GitHub Actions publish trigger changed from tag push to master merge

## [0.0.2] - 2026-02-26

### Added
- GitHub Actions Marketplace auto-publish workflow
