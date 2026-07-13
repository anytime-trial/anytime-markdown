# Anytime Agent

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)

[日本語](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-agent-extension/README.ja.md) | [English](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-agent-extension/README.md)

**See all your Claude Code sessions at a glance — all inside VS Code.**

When you run several Claude Code sessions across worktrees and branches, it is hard to tell which session is doing what and which one has grown too large.

Anytime Agent adds an Activity Bar panel that surfaces every Claude Code session, hands off a bloated session to a fresh one with its context preserved, and shares visual context with AI through AI Notes.


## 1. What You Can Do

- **Agent Mapping** — list every Claude Code session as a flat, recency-sorted view with branch / worktree / commit details on hover
- **Session handoff** — move a context-heavy session to a brand-new session while keeping a compressed summary of the work
- **AI Note** — share images, tables, and notes with AI tools so they can act on visual context


## 2. Getting Started

Open the **Anytime Agent** icon in the Activity Bar. The panel hosts the **AI Note** and **Agent Mapping** views.

On activation, the extension registers Claude Code hooks in `~/.claude/settings.json`. These hooks report session activity — edits, branch, and commits — to the extension's bundled agent-status worker, which the Agent Mapping view reads. No other extension is required.

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


## 5. AI Note

Share visual information — images, tables, and free-form notes — with AI tools that cannot otherwise see your screen.

- **Multi-page notes** — add and delete note pages; each is opened in the Anytime Markdown editor
- **Workspace-local storage** — notes live under `.anytime/notes/` in your workspace
- **Bundled skill** — an `anytime-note` Claude Code skill is installed at `.claude/skills/` so the AI can read your notes on request


## 6. Bundled Skills

The extension installs Claude Code skills into your workspace `.claude/skills/` on activation:

| Skill | Purpose |
| --- | --- |
| `anytime-note` | Lets the AI read AI Note pages (images / tables / notes) and act on them |
| `anytime-cross-review` | Claude and Codex review the same diff independently and cross-check each other's findings |
| `anytime-dev-cycle` | Base development skill that combines the full development flow with subagent rotation and Codex / ollama delegation |
| `anytime-impl-test-design` | Decides which tests to write after implementing (wiring / mount / i18n coverage gaps) |
| `anytime-proposal` | Generates proposals (RFC / ADR / lightweight) with a thinking-method guide |


## 7. Settings

| Setting | Default | Description |
| --- | --- | --- |
| `anytimeAgent.contextWarnTokens` | `160000` | Show the ⚠️ handoff-hint badge when a session's context tokens exceed this value |
| `anytimeAgent.sessionRetentionDays` | `7` | Days of inactivity before an unused session is auto-deleted; also bounds which Codex sessions are listed |
| `anytimeAgent.showCodexSessions` | `true` | Show the read-only **Codex** session group in Agent Mapping |
| `anytimeAgent.budget.dailyLimitTokens` | `null` | Daily token limit. `null` disables it |
| `anytimeAgent.budget.sessionLimitTokens` | `null` | Per-session token limit. `null` disables it |
| `anytimeAgent.budget.alertThresholdPct` | `80` | Warning threshold (%) against the limit |


## 8. License

MIT
