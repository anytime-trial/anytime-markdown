# Changelog

All notable changes to the "c4-kernel" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-04-05

### Added

- DSM type definitions and adjacency matrix builder from C4 model
- DSM matrix builder from TrailGraph source analysis
- DSM diff detection between design and implementation
- Tarjan SCC cycle detection for DSM
- Reverse Cuthill-McKee clustering for DSM
- Sort DSM component nodes by boundaryId for group borders

### Fixed

- Exclude container/containerDb from component-level DSM
- Add metadata.c4Id to frame nodes for selection matching
- Extract shared C4 viewer components to graph-core

## [0.1.0] - 2026-04-04

### Added

- c4ToMermaid serializer for C4Model to Mermaid C4 text
- Code element type to parseMermaidC4
- buildLevelView for C4 level filtering shared with web-app
- extractBoundaries moved to c4-kernel and deduplicated

### Fixed

- Propagate groupId for nested boundary frames in Phase 2

## [0.0.1] - 2026-04-04

Initial release. C4 architecture model parser and graph document converter.

### Added

- Mermaid C4 diagram parser (C4Context, C4Container, C4Component, C4Dynamic, C4Deployment)
- Transform C4 model to GraphDocument for graph-core rendering
- C4 element types: Person, System, SystemDb, SystemQueue, Container, ContainerDb, ContainerQueue, Component
- C4 relationship parsing with labels and technology annotations
- Boundary support (System_Boundary, Container_Boundary, Boundary, Enterprise_Boundary)
