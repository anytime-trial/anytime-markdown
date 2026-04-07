# Changelog

All notable changes to the "trail-core" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-04-07

### Added

- `--format c4` option for CLI output

## [0.2.0] - 2026-04-05

### Added

- CLI --help option, format validation, and parseArgs export

### Changed

- Index TrailNodes by Map for O(1) lookup in EdgeExtractor

### Security

- Prevent ReDoS in matchGlob pattern handling

## [0.1.0] - 2026-04-04

### Added

- trailToC4 L2-L4 conversion and MDA CLI command
- --format mermaid CLI option with granularity and direction
- toMermaid transform with module and symbol granularity

### Changed

- Simplify toMermaid to trailToC4 + c4ToMermaid pipeline
- Cache sourceFiles and add diagnostics to EdgeExtractor
- Remove unused code

### Fixed

- Use filePath for Mermaid node labels instead of internal id

## [0.0.1] - 2026-04-04

Initial release. Static analysis engine for TypeScript project architecture visualization.

### Added

- ProjectAnalyzer for TypeScript project scanning with configurable filters
- SymbolExtractor for extracting classes, functions, interfaces, and type aliases
- EdgeExtractor for detecting import dependencies between symbols
- FilterConfig for include/exclude path patterns and symbol type filtering
- Mermaid diagram output (toMermaid transform)
- C4 model output (toC4 transform)
- Cytoscape.js graph output (toCytoscape transform)
- Trail stylesheet for consistent graph styling
- Custom trail definitions for user-defined analysis scopes
- C4 model types (Person, System, Container, Component, Relationship)
- CLI tool (`trail`) for command-line analysis
