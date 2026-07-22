# Changelog

All notable changes to `@anytime-markdown/mcp-cms-remote` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.3.0] - 2026-07-22

### Added

- Added `read_google_doc` MCP tool: reads a Google Doc as plain text via service account authentication (RS256 signing implemented with Web Crypto `SubtleCrypto`), accepting a Doc ID or a Google Docs/Drive URL. Registered only when the `GOOGLE_SERVICE_ACCOUNT_KEY` Workers secret is configured; the target document must be shared with the service account email as a viewer.

## [0.2.0] - 2026-07-18

### Added

- `create_ticket` tool: registers a ticket into the ticket management system (`.tickets/` in the GitHub ticket repository) via `@anytime-markdown/tickets-core` (GitHub Contents API, `sha` optimistic locking, auto-numbered IDs, frontmatter validation). The tool is registered only when `TICKETS_GITHUB_TOKEN` / `TICKETS_REPO` (and optional `TICKETS_BRANCH`, default `main`) are configured.
- Deploy workflow now provisions the `TICKETS_*` Workers secrets from GitHub Secrets/Variables, and deletes stale Workers secrets when they are unset so the GitHub side stays the single source of truth.

### Fixed

- `create_ticket` failed with `Illegal invocation` on Cloudflare Workers: `tickets-core` stored a bare `fetch` reference as the default `fetchFn` and invoked it through an object property, tripping workerd's `this` brand check. Default and injected fetch functions are now always wrapped.

## [0.1.0] - 2026-06-27

### Added

- Public `GET /fetch` proxy endpoint for browser-side web page import: fetches a URL server-side and returns `{ html, finalUrl, contentType }` with CORS. SSRF defenses block private / loopback / link-local / metadata IPs (including IPv4-mapped IPv6), re-validate each redirect hop, and enforce scheme / content-type / size / timeout limits. CORS origin allowlist is configurable via `WEB_IMPORT_ALLOW_ORIGIN` (defaults to `*` when unset).

## [0.0.8] - 2026-06-20

### Added

- Added `get_report` tool to retrieve report body content from S3.

### Security

- Bumped `hono` from 4.12.20 to 4.12.26 to address multiple CVEs (CORS wildcard bypass, JWT scheme confusion, Cookie injection, serve-static path traversal, and others).

## [0.0.7] - 2026-05-27

### Changed

- SonarCloud S1874 deprecated API migration and mechanical safe fixes.

## [0.0.6] - 2026-05-20

### Changed

- Expanded `server.ts` tool handler unit-test coverage

### Security

- Bumped `hono` and `ws` to patch moderate CVEs

## [0.0.5] - 2026-05-02

### Changed

- Updated Jest coverage configuration to use shared `jest.config.base.js`

## [0.0.4] - 2026-04-12

### Fixed

- Fix `.gitignore` pattern that inadvertently excluded `trail-core/src/c4/coverage/` source files from version control

## [0.0.3] - 2026-04-12

### Changed

- Added `json-summary` to jest `coverageReporters` for E2E coverage integration

## [0.0.2] - 2026-03-28

### Added

- Initial release of MCP CMS Remote server (Cloudflare Workers)
