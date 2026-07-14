# Change Log

All notable changes to the "Anytime Agent" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [1.5.0] - 2026-07-14

### Added

- Concurrent-session collision guard (airspace). A session claims the worktree and branch it works on, and a Claude Code hook denies edits coming from a second live session on the same branch. Claims live under `.git/anytime/` (shared across worktrees, no daemon or DB), liveness is observed from `/proc`, and `ANYTIME_AIRSPACE=off` is the documented escape hatch for deliberate concurrent work.
- Worktree ownership view. Shows which session owns which worktree and branch, so a second session can move to an isolated worktree instead of colliding.
- Git activity timeline view. Git operations (commit, merge, rebase, branch create/delete, reset, force push) are recorded with the session that caused them via a `reference-transaction` hook and shown as a TreeView grouped by session.
- Non-destructive snapshots of uncommitted work. A timer records the working tree (tracked and untracked) into a git ref namespace without touching the index or the user's edits, plus a command to restore a snapshot. Configurable through `anytimeAgent.workSnapshot.*`.

### Fixed

- Claude usage percentage no longer disappears silently when `/api/oauth/usage` answers 429. The value is cached and shared across extension hosts, with backoff and a degraded display instead of a blank.
- Timestamps in the git timeline are rendered in the local timezone. The Extension Host runs with `TZ=UTC` on WSL, so `Date`'s local getters were returning UTC values.
- Bundled skills now actually update. `installStaticSkillDir` used to preserve any deployed file whose content differed from the bundle, so a changed `SKILL.md` never reached a workspace that already had the skill (`anytime-cross-review` shipped pointing at a `references/` path that no longer existed). Deployment is now gated on `skills/manifest.json` versions recorded in `.claude/skills/.anytime-agent-skills.json`: a higher bundled version overwrites, an unchanged version still preserves local edits, and a workspace with no recorded version is healed once.

## [1.4.0] - 2026-07-13

### Added

- `anytime-dev-cycle` guidance in workspace `CLAUDE.md`: on activation the extension upserts a managed marker block that makes the skill the default for development instructions (idempotent; only the marked block is rewritten). Opt out with `anytimeAgent.claudeMdGuidance`.
- `anytime-dev-cycle` preflight (`preflight.cjs`): checks required prerequisites (git/develop, docs repo, skill integrity) and optional delegation runtimes (codex CLI, ollama profile, agent-core), plus pre-work scan (incomplete plans, git status). Runs mandatorily on first use via a `.anytime/dev-cycle-preflight.json` marker and on skill updates; `--check` runs the diagnosis alone.

### Changed

- Folded the former `anytime-agent-rotation` and `anytime-delegation` skills into `anytime-dev-cycle`; old skill names are cleaned up through the bundled-skill migration aliases.
- Moved the per-purpose subagent model table (haiku / sonnet / opus / fable) out of the global `CLAUDE.md` and into `anytime-dev-cycle` §3.1, so model and effort tiering travels with the skill.

### Security

- Fixed a ReDoS in the transcript env-line redaction of `agent-core` (CodeQL).
- Stopped passing user-controlled input as a log format string in `agent-core`.

## [1.3.0] - 2026-07-12

### Added

- The AGENT mapping view now shows the Claude Code usage rate (%) per account, sourced from the `/api/oauth/usage` endpoint (the rate is not available in local files). Unknown limit kinds are logged as warnings instead of being silently dropped.
- The Codex group now shows Usage (%) and Today alongside the Claude group.
- Bundled four more skills: `anytime-delegation` (delegating work to Codex CLI / local ollama), `anytime-dev-cycle`, `anytime-impl-test-design`, and `anytime-proposal`. They are installed into `.claude/skills/` automatically, so they are no longer global-only.

### Changed

- Merged `codex-delegation` and `anytime-ollama-delegation` into a single `anytime-delegation` skill, which now covers picking the delegation target, the six-point delegation contract, and the abstain path.

### Fixed

- The usage display no longer disappears entirely when the `limits` payload cannot be interpreted; it now falls back instead of failing closed.
- Codex rollout files without `rate_limits` no longer re-read up to 1 MB of tail on every scan.

### Security

- Sanitize tokens in the outer catch of the usage fetch as well, so a failure path cannot leak them into logs.

## [1.2.0] - 2026-07-12

### Added

- The AGENT mapping view now groups sessions into a workspace hierarchy, so sessions from multiple workspaces no longer appear in a single flat list. Hover tooltips show the same resolved workspace path as the group heading.
- Bundled the `anytime-ollama-delegation` skill for delegating tasks to a local ollama. It measures the machine's usable VRAM and each model's capabilities, then decides what may be delegated based on the pass/fail of empirical smoke tests. Swapping models automatically re-derives the verdicts, and results are written out as a report.

### Changed

- Updated the bundled `anytime-cross-review` skill to reference the renamed `anytime-trail-review` finding format.
- Bundled-skill `.cjs` tests are now covered by jest (previously `roots` only included `src`, so `codex-review.test.cjs` never ran).

## [1.1.1] - 2026-07-11

### Fixed

- agent-status hooks now resolve the workspace by walking up from the hook's working directory instead of absolute paths baked into `settings.json`, fixing status routing when multiple workspaces are open; the reported branch is now based on the hook's cwd (worktree-aware).

### Changed

- Updated the bundled `anytime-cross-review` skill to reference the renamed `anytime-review` finding format.

## [1.1.0] - 2026-07-11

### Added

- Bundled the `anytime-cross-review` skill and install it into `.claude/skills/` automatically. Because the skill orchestrates a cross review between different agents (Claude / Codex), its distribution moved from the Anytime Trail extension to this extension.

## [1.0.1] - 2026-07-02

### Added

- Agent delegation contract: an abstention exit (`taskStatus` / `abstainReason`, additive optional) so a delegated subagent can decline a task, with matching handling in the `anytime-agent-rotation` skill.

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
