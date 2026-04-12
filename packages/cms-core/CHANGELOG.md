# Changelog

All notable changes to the "cms-core" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.3] - 2026-04-12

### Fixed

- Fix `.gitignore` pattern that inadvertently excluded `trail-core/src/c4/coverage/` source files from version control

## [0.1.2] - 2026-04-12

### Changed

- Added `json-summary` to jest `coverageReporters` for E2E coverage integration

## [0.1.1] - 2026-04-04

### Added

- Patent service for S3 patent file operations

### Fixed

- Add date format validation in listPatentFiles

## [0.1.0] - 2026-03-29

### Added
- `mcp-cms-remote` package: Cloudflare Workers entry point with API key auth and Streamable HTTP
- Remote MCP server definition with content-based tool interfaces
- Unit tests for remote MCP server

## [0.0.1] - 2026-03-27

Initial release.

### Added

- S3 client configuration (`createCmsConfig`, `createS3Client`) with environment variable support
- Docs service: `listDocs`, `uploadDoc`, `deleteDoc` for S3 document management
- Report service: `listReportKeys`, `uploadReport` for S3 report management
- File name validation with path traversal and special character protection
- Allowed file type enforcement (`.md`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`)
- Unit tests for docs and report services
