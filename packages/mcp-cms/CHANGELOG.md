# Changelog

All notable changes to the "mcp-cms" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-07-22

### Added

- Added `read_google_doc` MCP tool: reads a Google Doc as plain text via service account authentication (RS256 signing implemented with `node:crypto`), accepting a Doc ID or a Google Docs/Drive URL. Registered only when `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` is configured; the target document must be shared with the service account email as a viewer.

## [0.1.7] - 2026-06-20

### Added

- Added `get_report` MCP tool to retrieve report body content from S3.

## [0.1.6] - 2026-05-27

### Changed

- SonarCloud S1874 deprecated API migration.

## [0.1.5] - 2026-05-04

### Fixed

- React component props wrapped in `Readonly` (Sonar S6759)
- Removed unnecessary type assertions (Sonar S4325)

## [0.1.4] - 2026-05-02

### Changed

- Update cms-core dependency to 0.1.4

## [0.1.3] - 2026-04-12

### Changed

- Update cms-core dependency to 0.1.3

## [0.1.1] - 2026-04-04

### Changed

- Update cms-core dependency to 0.1.1

## [0.1.0] - 2026-03-29

### Added
- CI pipeline integration for cms-core and mcp-cms unit tests
- Deploy workflow for mcp-cms-remote

## [0.0.1] - 2026-03-27

Initial release.

### Added

- MCP server (`anytime-markdown-cms`) with stdio transport
- `upload_report` tool: upload a local Markdown file to S3 reports prefix
- `list_reports` tool: list all report files in S3 reports prefix
- `upload_doc` tool: upload a local file (Markdown or image) to S3 docs prefix with optional subfolder
- `list_docs` tool: list all document files in S3 docs prefix
- `delete_doc` tool: delete a document from S3 docs prefix
- dotenv support for environment variable configuration
