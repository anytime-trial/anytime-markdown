# Change Log

All notable changes to the "Anytime Agent" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [1.0.0] - 2026-06-27

### Changed

- Renamed the Stop hook script `trail-token-budget.sh` to `token-budget.sh`; the obsolete script and its stale hook entry are cleaned up on setup.
- The Agent mapping tree now lists sessions as a flat list sorted by recency (most recently active first), instead of grouping them under worktree/branch nodes. Each session's hover (tooltip) shows the last-used branch and worktree name. The worktree-level nodes and their `Open Worktree` / `Copy Worktree Path` commands were removed.
- Session age in the Agent mapping tree is now shown as `Xh Ymin ago` for ages of one hour or more (previously minutes only, e.g. `135 min ago`).
- Removed the per-session commit count (`committed(N)`) from the Agent mapping tree row. The commit count remains in the session hover (tooltip) and in the Today summary row.
- Removed the session title/last filename from the Agent mapping tree row. The session title is now shown only in the hover (tooltip) as **タイトル**; the last filename is no longer displayed in the tree.

### Added

- Session handoff: a **Hand off to a new session** command on the session tree carries a compressed, context-preserving handoff state (deterministic recall extraction) into a fresh Claude Code session via the agent-status worker `/handoff` endpoint, and a context-bloat handoff-recommendation badge flags sessions that have grown large.
- The Agent mapping tree now groups sessions by source under **Claude Code** and **Codex** headings. Codex (OpenAI CLI) sessions for the current workspace are surfaced by a read-only scan of the Codex rollout files (`~/.codex/sessions`); only sessions within the retention period whose working directory is inside the current workspace's worktrees are listed. Codex has no agent-status lifecycle hook, so only **last activity** and **context tokens** (⚠️ handoff-hint badge) are available — editing-lock, commit count, and session handoff are Claude-only. Toggle with `anytimeAgent.showCodexSessions` (default on). The **Today** summary is Claude-only and is now labeled accordingly.
- Periodic cleanup of unused sessions: the agent-status worker deletes sessions whose last activity is older than the retention period from the database, on startup and once per day. The retention period is configurable via `anytimeAgent.sessionRetentionDays` (default 7 days).

### Removed

- Removed the "Show Session Edits" display (the session tree right-click QuickPick and the tooltip **Edits:** list). Edit history was hard to interpret. The underlying `session_edits` recording is kept (handoff derives changed files from the transcript independently).

## [0.3.3] - 2026-06-24

### Changed

- Removed the `anytimeAgent.claudeStatus.directory` setting. Agent status is managed in the agent-status database, so the old `claude-code-status.json` file path is no longer used.
- Moved the `session-guard.sh` warning-dedup state file (`claude-session-guard.json`) from `.anytime/trail/state/` to `.anytime/agent/`, consolidating agent-owned state under the agent home directory.

## [0.3.2] - 2026-06-13

### Changed

- Switched the extension icon and activity-bar icon to the new camel branding.

## [0.3.1] - 2026-06-13

### Changed

- Upgraded to TypeScript 6.0.3 (monorepo-wide build toolchain update).

## [0.3.0] - 2026-06-03

### Added

- Spawn an agent-status worker and display per-agent commit information (committed count / last commit).
- Route Claude hooks and the status watcher through the agent-status worker (`vscode-common`).

### Agent Core (agent-core)

- Added a `node:sqlite` agent-status store with worker and client.
- Carry `committedCount` / `lastCommit` through the agent mapping; seed commits without a phantom `last_commit`.
- Partial-update edit semantics and a delete endpoint.

## [0.2.2] - 2026-05-24

### Changed

- `agent-core` now re-exports the Ollama throttle governor / decorator, making throttle control available to agent-side consumers

## [0.2.1] - 2026-05-20

### Security

- Replaced polynomial-redos trailing-slash regex in `claudeHookSetup` with an O(n) `charCodeAt` scan (CodeQL #818, `vscode-common`)

### Agent Core (agent-core / ollama-core)

- Fixed Ollama split-brain: health-check and ingest now resolve `baseUrl` via a unified `resolveOllamaBaseUrl` helper (priority: `OLLAMA_BASE_URL` env > explicit config > Dev Container auto-detect > localhost). Re-exported from `agent-core` for downstream consumers
- Fixed polynomial-redos in `OllamaChatProvider` / `OllamaEmbeddingProvider` trailing-slash handling — replaced `/\/+$/` regex with O(n) `charCodeAt` scan via `stringUtils.stripTrailingSlashes` (CodeQL #815/#816)

## [0.2.0] - 2026-05-17

### Added

- AI Note panel migrated from Anytime Trail. The `anytimeAgent.aiNote`
  view appears at the top of the Agent activity bar and exposes 7
  `anytime-agent.openAiNote*` commands. Notes are stored under the
  workspace `.anytime/notes/` and a templated `anytime-note` Claude Code
  skill is installed at `.claude/skills/anytime-note/SKILL.md` (paths
  unchanged from trail extension to preserve existing notes).
- Bundled MIT `LICENSE` file in the VSIX. `package.json` already declared `"license": "MIT"`, but the file itself was missing from the published extension

### Changed

- Documentation references to AI Note now point to this extension

## [0.1.0] - 2026-05-16

### Added

- Initial release. VS Code extension that surfaces Anytime agent state in the Activity Bar
- Activity Bar `Anytime Agent` panel with two views:
  - `anytimeAgent.mapping`: Agent ↔ worktree / session mapping with stale-filter toggle
  - `anytimeAgent.ollama`: Local Ollama runtime status with start command
- Commands:
  - `anytime-agent.mapping.refresh`
  - `anytime-agent.mapping.cleanupStale`
  - `anytime-agent.mapping.toggleStale`
  - `anytime-agent.mapping.openWorktree`
  - `anytime-agent.mapping.copyWorktreePath`
  - `anytime-agent.mapping.showSessionEdits`
  - `anytime-agent.mapping.copySessionId`
  - `anytime-agent.mapping.deleteStatusFile`
  - `anytime-agent.startOllama`
- Configuration:
  - `anytimeAgent.claudeStatus.directory` (default `.anytime/trail/agent-status`)
  - `anytimeAgent.budget.dailyLimitTokens`
  - `anytimeAgent.budget.sessionLimitTokens`
  - `anytimeAgent.budget.alertThresholdPct` (default 80)
- Agent mapping moved into the new `@anytime-markdown/agent-core` package (extracted from `trail-core`)
