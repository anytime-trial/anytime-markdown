# Changelog

All notable changes to the "mcp-trail" package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.10.1] - 2026-05-08

### Added

- SQLite direct access for read tools (`get_c4_model`, `list_elements`, `list_groups`, `list_relationships`, `list_communities`) so MCP clients work without the Anytime Trail sidebar running
- Probe-based fallback for write tools: routes via TrailDataServer HTTP when alive, falls back to SQLite direct writes (WAL + exponential backoff retry) when not
- Environment variables `TRAIL_DB_PATH`, `TRAIL_WORKSPACE_PATH`, `MCP_TRAIL_FORCE_DIRECT` for CI / headless usage
- VS Code extension passes `TRAIL_WORKSPACE_PATH` to the bundled mcp-trail server for workspace-aware DB resolution

### Fixed

- Switched sql.js loader from `sql-asm.js` (asm.js, 16 MB heap) to `sql-wasm.js`/`sql-wasm.wasm` (WASM, up to 2 GB heap) to prevent OOM when saving large code graphs

### Changed

- Analyze tools (`analyze_current_code`, `analyze_release_code`, `analyze_all`, `get_analyze_status`) still require TrailDataServer; emit explicit error when unavailable
- Use `sql.js` WASM backend instead of `better-sqlite3` to remain compatible with the `vsce package --no-dependencies` distribution model

## [0.10.0] - 2026-05-04

### Added

- Community write tools (`upsert_community_mappings`, `upsert_community_summaries`) to avoid in-memory DB conflicts
- Analyze pipeline trigger tools and HTTP API endpoints

## [0.9.1] - 2026-05-02

### Changed

- Added to monorepo workspaces with Jest coverage configuration
