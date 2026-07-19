# Anytime Agent

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)

[日本語](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-agent-extension/README.ja.md) | [English](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-agent-extension/README.md)

**See all your Claude Code sessions at a glance — all inside VS Code.**

When you run several Claude Code sessions across worktrees and branches, it is hard to tell which session is doing what and which one has grown too large.

Anytime Agent adds an Activity Bar panel that surfaces every Claude Code session, hands off a bloated session to a fresh one with its context preserved, and shares visual context with AI through AI Notes.


## 1. What You Can Do

- **Agent Mapping** — list every Claude Code / Codex session as a recency-sorted view with branch / worktree / commit details on hover
- **Session handoff** — move a context-heavy session to a brand-new session while keeping a compressed summary of the work
- **Git activity tracking** — record the git operations the AI performed, filter down to destructive ones, and pull recovery commands
- **Worktree ownership** — list which session is using which worktree to prevent collisions between concurrent work
- **Work snapshots** — periodically and non-destructively back up uncommitted work to `refs/anytime/snapshots/`
- **AI Note** — share images, tables, and notes with AI tools so they can act on visual context
- **Ollama integration** — start a local LLM from the sidebar


## 2. Getting Started

Open the **Anytime Agent** icon in the Activity Bar. The panel hosts five views: **AI Note**, **Agent Mapping**, **Git Activity**, **Worktree Ownership**, and **Ollama**.

On activation, the extension registers Claude Code hooks in `~/.claude/settings.json` and places scripts under `~/.claude/scripts/`. These hooks report session activity — edits, Bash execution, commits, and token consumption — to the extension's bundled agent-status worker, which each view reads. No other extension is required.

**Hooks registered automatically:**

| Event | Target | Purpose |
| --- | --- | --- |
| `SessionStart` | — | Suggests worktree isolation when another live session is on the same working tree |
| `PreToolUse` / `PostToolUse` | `Edit`, `Write` | Record the start/end of an edit (used by the Markdown extension's editor lock and the C4 graph activity display) |
| `PreToolUse` / `PostToolUse` | `Bash` | Record the running cwd so a worktree can be identified even while tests are running |
| `PreToolUse` | all tools | Blocks tool execution while the Kill Switch is engaged |
| `PostToolUse` | all tools | Detects loops (repeated identical operations) and warns |
| `PostToolUse` | `Bash` | `commit-tracker.sh` detects and records git commits |
| `UserPromptSubmit` | — | `session-guard.sh` (time/turn-count warnings), `handoff-inject.sh` (handoff injection), `user-feedback.sh` (records post-hoc correction instructions) |
| `Stop` | — | `token-budget.sh` (token consumption tally), `safe-point.sh` (safe-point recording), `flight-review.sh` (debrief tally) |

> Registration is skipped when Claude Code is not installed (i.e. `~/.claude/` is absent).

If no sessions appear:

- Make sure Claude Code is installed — hook registration is skipped when `~/.claude/` is absent.
- Sessions show up once Claude Code performs an action (edit, command, or commit) in the workspace.


## 3. Agent Mapping

Sessions are grouped under **Claude Code** and **Codex** headings, each sorted by most recent activity. The session row stays minimal; details are on the hover (tooltip).

- **Recency-sorted list** — the most recently active session is at the top of its group
- **Context warning badge** — sessions whose context tokens exceed `anytimeAgent.contextWarnTokens` (default 160,000) are flagged with ⚠️ as a handoff hint

Right-click a Claude session for **Hand Off to New Session**, **Copy Session ID**, or **Delete Status File**.

### Codex sessions (read-only)

Codex (OpenAI CLI) sessions for the current workspace are surfaced by scanning the Codex rollout files under `~/.codex/sessions`. Only sessions within the retention period whose working directory is inside the current workspace's worktrees are listed.

Codex has no agent-status lifecycle hook, so the view is **read-only** for Codex: only **last activity** and **context tokens** (⚠️ badge) are shown. Editing-lock, commit count, and session handoff are Claude-only; the right-click menu offers **Copy Session ID** only. The **Today** summary is Claude-only and is labeled *Today (Claude)*. Turn the group off with `anytimeAgent.showCodexSessions`.


## 4. Session Handoff

When a session grows too large, hand it off to a fresh session — the work so far is summarized and carried over, so you don't have to start from scratch.

Right-click the session and choose **Hand Off to New Session**:

- **One-click start** — launch a new `claude` session in a terminal with the handoff injected automatically
- **Clipboard fallback** — or copy the handoff document path and paste it at the start of a new session


## 5. Work Protection (Git Activity, Worktree Ownership, Snapshots)

This group of views prevents irreversible operations and helps you recover from them when multiple AI sessions touch the same repository.

### Git Activity

Shows the history of git operations the AI performed.

- **Destructive-only filter** — narrow down to `reset --hard`, `clean -f`, `branch -D`, and `push --force`-family operations
- **Filter by actor / period** — filter by who ran the operation and when
- **Copy recovery command** — copy a git command that recovers from the operation to the clipboard
- Records are retained for `anytimeAgent.gitActivityRetentionDays` (default 90 days)

### Worktree Ownership

Lists which session is currently using which worktree. Check whether another session is already on the same working tree before starting concurrent work. Worktree creation/switch commands can be copied from the context menu.

### Work Snapshots

Periodically backs up uncommitted work (including untracked files) to `refs/anytime/snapshots/`. This is a **non-destructive method that never touches the working tree** — unlike `git stash`, it does not pull your in-progress edits out from under you.

- Interval: `anytimeAgent.workSnapshotIntervalMinutes` (default 15 minutes; `0` disables it)
- Retention: `anytimeAgent.workSnapshotRetentionDays` (default 7 days)
- List and restore from the Command Palette via `Anytime Agent: Show Work Snapshots`


## 6. AI Note

Share visual information — images, tables, and free-form notes — with AI tools that cannot otherwise see your screen.

- **Multi-page notes** — add and delete note pages; each is opened in the Anytime Markdown editor
- **Workspace-local storage** — notes live under `.anytime/notes/` in your workspace
- **Bundled skill** — an `anytime-note` Claude Code skill is installed at `.claude/skills/` so the AI can read your notes on request


## 7. Bundled Skills

The extension installs Claude Code skills into your workspace `.claude/skills/` on activation:

| Skill | Purpose |
| --- | --- |
| `anytime-note` | Lets the AI read AI Note pages (images / tables / notes) and act on them |
| `anytime-dev-cycle` | Base development skill that combines the full development flow with subagent rotation and Codex / ollama delegation |
| `anytime-cross-review` | Claude and Codex review the same diff independently and cross-check each other's findings |
| `anytime-impl-test-design` | Decides which tests to write after implementing (wiring / mount / i18n coverage gaps) |
| `anytime-proposal` | Generates proposals (RFC / ADR / lightweight) with a thinking-method guide |
| `anytime-debrief` | Closes out a session with a structured debrief (progress / open items / concerns) |
| `anytime-dev-audit` | Diagnoses the PC environment and Claude Code configuration read-only and proposes an optimization plan |
| `anytime-build-webapp` | Scaffolds a new web app / full-stack MVP |
| `anytime-loop-start` / `anytime-loop-stop` | Starts/stops a loop that automatically executes `.tickets/` tickets one at a time |


## 8. Settings

### 8.1 Session Display

| Setting | Default | Description |
| --- | --- | --- |
| `anytimeAgent.contextWarnTokens` | `160000` | Show the ⚠️ handoff-hint badge when a session's context tokens exceed this value |
| `anytimeAgent.sessionRetentionDays` | `7` | Days of inactivity before an unused session is auto-deleted from the agent-status DB; also bounds which Codex sessions are listed |
| `anytimeAgent.showCodexSessions` | `true` | Show the read-only **Codex** session group in Agent Mapping |
| `anytimeAgent.showUsage` | `true` | Show subscription usage in the Claude Code group |
| `anytimeAgent.usageRefreshSeconds` | `600` | Refresh interval (seconds) for usage. Values below 300 seconds are clamped to 300. Uses a 10-minute shared cache to avoid rate limits |

### 8.2 Token Budget

| Setting | Default | Description |
| --- | --- | --- |
| `anytimeAgent.budget.dailyLimitTokens` | `null` | Daily token limit. `null` disables it |
| `anytimeAgent.budget.sessionLimitTokens` | `null` | Per-session token limit. `null` disables it |
| `anytimeAgent.budget.alertThresholdPct` | `80` | Warning threshold (%) against the limit |

### 8.3 Work Protection

| Setting | Default | Description |
| --- | --- | --- |
| `anytimeAgent.gitActivityRetentionDays` | `90` | Number of days to keep git activity records in the agent-status DB |
| `anytimeAgent.workSnapshotIntervalMinutes` | `15` | Interval (minutes) for backing up uncommitted work to `refs/anytime/snapshots/`. `0` disables it. Values between 1 and 4 are treated as 5 |
| `anytimeAgent.workSnapshotRetentionDays` | `7` | Number of days to keep snapshot refs |

### 8.4 Skill / Ticket Integration

| Setting | Default | Description |
| --- | --- | --- |
| `anytimeAgent.claudeMdGuidance` | `true` | On activation, upsert a managed block into the workspace `CLAUDE.md` that makes `anytime-dev-cycle` the base skill for development instructions. Only the marked block is rewritten; the rest of the file is untouched |
| `anytimeAgent.tickets.directory` | `""` | Location of the ticket repository used by `anytime-loop-start`. When unset, resolution falls back to `.tickets/` at the workspace root, then the `ANYTIME_TICKETS_DIR` environment variable |
| `anytimeAgent.tickets.workspace` | `""` | Workspace identifier used to scope automatic execution. When unset, the workspace root directory name is used, so this is usually not needed |


## 9. License

MIT
