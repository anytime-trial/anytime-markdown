# Changelog

All notable changes to the "cms-core" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.0.1] - 2026-03-27

Initial release.

### Added

- S3 client configuration (`createCmsConfig`, `createS3Client`) with environment variable support
- Docs service: `listDocs`, `uploadDoc`, `deleteDoc` for S3 document management
- Report service: `listReportKeys`, `uploadReport` for S3 report management
- File name validation with path traversal and special character protection
- Allowed file type enforcement (`.md`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`)
- Unit tests for docs and report services
