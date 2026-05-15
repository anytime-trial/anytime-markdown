# Anytime Trail

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)

[日本語](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-trail-extension/README.ja.md) | [English](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-trail-extension/README.md)

**A control system that safely watches over Claude Code.**

In an era where multiple AI agents work concurrently on the same codebase, Anytime Trail prevents file editing conflicts, design drift, runaway costs, and opaque decision-making.\
This document introduces the **currently available features** by functional area, against the broader vision.

[**Try the Online Viewer**](https://www.anytime-trial.com/trail)


## 1. Behavior Visibility (Trail Viewer)

**Vision:** Maintain a complete record of every agent's actions, decisions, costs, and quality outcomes — so you can review and audit at any time.

**What you can do today:**

- Import Claude Code JSONL logs into SQLite and visualize sessions, prompts, tool calls, and commits chronologically
- Quantify your team's development process with the four DORA metrics (deployment frequency, lead time, prompt success rate, change failure rate)
- Monitor token budget consumption in real time on the tab bar
- Analyze from multiple angles via the three tabs: Sessions, Analytics, and Prompts
- Sync local SQLite to Supabase / PostgreSQL for multi-developer data integration

**How to use:** Click **Open Trail Viewer** in the **Dashboard** sidebar panel (or run `Anytime Trail: Open Trail Viewer`) to open the browser viewer at `http://localhost:19841`.


## 2. Structure Visibility (C4 Architecture Diagrams & DSM)

**Vision:** Before the AI makes changes that drift from design intent, let it see where the edit lands in the overall project and what it affects.

**What you can do today:**

- Auto-generate C4 architecture diagrams and DSM (Dependency Structure Matrix) from TypeScript projects
- Drill down across four levels, from L1 (system context) to L4 (file dependencies)
- Highlight circular dependencies in red and show deleted elements with strikethrough
- Display files currently being edited by Claude Code on the C4 graph in real time
- Express domain boundaries and service categories with manual grouping (ManualGroups)
- Survey large graphs with the minimap
- Visualize feature-to-implementation mapping with the F-C Map (Feature-Component matrix)
- Link design documents to C4 elements via the `c4Scope` frontmatter in Markdown files

**How to use:** `Ctrl+Shift+P` → `C4: Analyze Code` to launch the browser viewer.


## 3. Quality Visibility (Coverage Integration)

**Vision:** Surface untested or quality-degraded areas on the structure map and prompt the AI to fix them.

**What you can do today:**

- Overlay `coverage-final.json` data on the C4 diagram to spot under-tested modules at a glance
- Auto-detect file changes and refresh coverage
- Save coverage history as snapshots to track changes over time
- Run coverage tests directly from the right-click menu on L4 nodes in the C4 tree

**How to use:** Set the path to `coverage-final.json` in `anytimeTrail.coverage.path`.


## 4. Visual Communication (Note Panel)

**Vision:** Establish a two-way channel between AI and human, exchanging visual context, handoff materials, and instructions that text alone cannot convey.

**What you can do today:**

- Manage multi-page notes and hand UI screenshots, design mocks, and diagrams directly to Claude Code
- Use as handoff material across sessions
- Have the AI read images and execute the task via the `/anytime-note` skill

**How to use:** Click `+` in the **Note** sidebar → open the note in Anytime Markdown and paste an image → instruct Claude Code with `/anytime-note ...`.


## 5. Claude Code Integration (Skills & Hooks)

When the extension activates, it automatically registers Claude Code skills and hooks under `~/.claude/`.\
Without any manual setup, session info, edit state, commit history, and token consumption flow into Trail.

**Auto-registered hooks (`~/.claude/settings.json`):**

| Event | Script | Purpose |
| --- | --- | --- |
| `PreToolUse` / `PostToolUse` | Writes `claude-code-status.json` | Records the file being edited (used by the Markdown extension's editor lock and the C4 graph activity overlay) |
| `PostToolUse` | `commit-tracker.sh` | Detects git commits after Bash tool execution and records them in the Trail DB |
| `Stop` | `trail-token-budget.sh` | Aggregates token consumption at session end for budget monitoring |
| `UserPromptSubmit` | `session-guard.sh` | Warns when session duration or turn count exceeds the threshold |

**Auto-generated skills (`~/.claude/skills/`):**

| Skill | Purpose |
| --- | --- |
| `/anytime-note` | Reads notes from the Note panel (`anytime-note-N.md`) and executes the requested task. Auto-generated on first note creation |

> Hook scripts are placed in `~/.claude/scripts/`.\
> Registration is skipped when Claude Code is not installed (i.e., `~/.claude/` is absent).


## 6. Repository Analysis Procedure

This section walks through the end-to-end procedure for analyzing the C4 architecture diagram and code graph of the workspace currently open in VS Code, then categorizing each community with an AI-generated summary.

**Prerequisites**

- The target must be a TypeScript project that contains `tsconfig.json`
- For Step 2, Claude Code itself and the `/anytime-reverse-engineer` skill must be installed

**Steps**

1. **Run code analysis**
   - Open the command palette and execute `Anytime Trail: Analyze Code`.
   - If multiple `tsconfig.json` files exist under the target repository, choose one in the QuickPick (selecting the project root analyzes every package below).
2. **Generate community summaries with AI (categorization)**
   - In Claude Code, run the `/anytime-reverse-engineer` skill.
   - Each community is automatically given a human-readable name and summary by AI.
3. **Verify results in Trail Viewer**
   - From the command palette, run `Anytime Trail: Open Trail Viewer` to open Trail Viewer at `http://localhost:19841`.
   - The C4 model is rendered on the C4 tab. Selecting an element shows the name and summary of its community on the panel.

> [!IMPORTANT]
> The AI summarization in Step 2 sends data to an external API (Anthropic). Before using on confidential repositories, confirm that transmitting code structure information such as file paths and module names externally is acceptable.


## 7. Configuration

### 7.1 Workspace

| Key | Default | Description |
| --- | --- | --- |
| `anytimeTrail.workspace.path` | `""` | Absolute path of the workspace to analyze. Used by both Code Graph and C4 Model analysis. When empty, the workspace currently open in VS Code is used |
| `anytimeTrail.workspace.docsPath` | `""` | Absolute path to the documentation directory for C4 document links. When set, Markdown files with `c4Scope` frontmatter are indexed and shown in the C4 viewer |


### 7.2 Viewer

| Key | Default | Description |
| --- | --- | --- |
| `anytimeTrail.viewer.port` | `19841` | Port number for the Trail Viewer server |


### 7.3 Database

| Key | Default | Description |
| --- | --- | --- |
| `anytimeTrail.database.storagePath` | `""` | Directory where `trail.db` is stored. Absolute path or relative to workspace root. Defaults to `.vscode/` when empty |
| `anytimeTrail.database.backupGenerations` | `1` | Number of gzip-compressed backup generations to keep for `trail.db`. Each generation is stored as `.bak.N.gz` next to the database file (range: 1–10) |


### 7.4 Claude Code Integration

| Key | Default | Description |
| --- | --- | --- |
| `anytimeTrail.claudeStatus.directory` | `.anytime/trail/agent-status` | Directory where `claude-code-status.json` is stored. Absolute path or relative to workspace root. |


### 7.5 Token Budget

| Key | Default | Description |
| --- | --- | --- |
| `anytimeTrail.budget.dailyLimitTokens` | `null` | Daily token limit. Disabled when `null` |
| `anytimeTrail.budget.sessionLimitTokens` | `null` | Per-session token limit. Disabled when `null` |
| `anytimeTrail.budget.alertThresholdPct` | `80` | Warning threshold against the limit (%, range 1–100) |


## 8. License

[MIT](https://github.com/anytime-trial/anytime-markdown/blob/master/LICENSE)
