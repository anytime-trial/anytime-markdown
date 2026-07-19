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
- Monitor token budget consumption in real time on the tab bar (limits are configured via `anytimeAgent.budget.*` in the [Anytime Agent](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-agent) extension)
- Analyze from multiple angles via the three tabs: Sessions, Analytics, and Prompts
- Sync local SQLite to Supabase / PostgreSQL for multi-developer data integration

**How to use:** **Dashboard** sidebar panel → **Open Trail Viewer** (or run `Anytime Trail: Open Trail Viewer`) to open the browser viewer at `http://localhost:19841`.

> [!IMPORTANT]
> The Claude Code hooks that feed session info, edit state, commits, and token consumption into Trail are **registered by the Anytime Agent extension** (see Section 5). Using this section's features requires installing Anytime Agent alongside.


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

- Overlay coverage on the C4 diagram to spot under-tested modules at a glance
- Compare against coverage at release time to track changes

**How to use:** Run coverage-enabled tests in each package to generate `packages/<package-name>/coverage/coverage-summary.json` (for Jest: `--coverage --coverageReporters=json-summary`).\
This file is picked up automatically during analysis and reflected on the C4 diagram. No path configuration is required.


## 4. Visual Communication (moved to the Anytime Agent extension)

The Note panel and the `/anytime-note` integration moved to the
**Anytime Agent** VS Code extension (`anytime-trial.anytime-agent`).
Install it from the marketplace to keep using note-based workflows.
Existing notes under `.anytime/notes/` and the `.claude/skills/anytime-note/`
skill are reused as-is.


## 5. Claude Code Integration (Skills & Hooks)

When the extension activates, it places Trail's Claude Code skills into the workspace's `.claude/skills/`.

| Skill | Purpose |
| --- | --- |
| `anytime-reverse-codegraph` | Uses AI to assign names and summaries to code graph communities, and determines the role of each C4 element |
| `anytime-reverse-spec` | Generates a full set of basic design documents from the code graph, DB schema, external I/F, and screen definitions |
| `anytime-dev-retro` | Cross-analyzes Trail's three DBs to generate a development health report and improvement proposals |
| `anytime-trail-review` | Outputs review findings in a format memory-core can ingest |

> To reinstall the skills, run `Anytime Trail: Reinstall Skills` from the command palette.

> [!IMPORTANT]
> **This extension does not register Claude Code hooks (**`~/.claude/settings.json`**).**\
> The hooks that feed session info, edit state, commit history, and token consumption into Trail are
> placed and registered by the [Anytime Agent](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-agent)
> extension in `~/.claude/scripts/`. Install Anytime Agent alongside this extension if you want to use
> behavior visibility, commit tracking, and budget monitoring.


## 6. Repository Analysis Procedure

This section walks through the end-to-end procedure for analyzing the C4 architecture diagram and code graph of the workspace currently open in VS Code, then categorizing each community with an AI-generated summary.

**Prerequisites**

- The target must be a TypeScript project that contains `tsconfig.json`
- For Step 2, Claude Code itself and the `anytime-reverse-codegraph` skill must be installed (automatically placed when the extension activates, as described in Section 5)

**Steps**

1. **Run code analysis**
   - Open the command palette and execute `Anytime Trail: Analyze Code`.
   - If multiple `tsconfig.json` files exist under the target repository, choose one in the QuickPick (selecting the project root analyzes every package below).
2. **Generate community summaries with AI (categorization)**
   - In Claude Code, run the `/anytime-reverse-codegraph` skill.
   - Each community is automatically given a human-readable name and summary by AI.
3. **Verify results in Trail Viewer**
   - From the command palette, run `Anytime Trail: Open Trail Viewer` to open Trail Viewer at `http://localhost:19841`.
   - The C4 model is rendered on the C4 tab. Selecting an element shows the name and summary of its community on the panel.

> [!IMPORTANT]
> The AI summarization in Step 2 sends data to an external API (Anthropic). Before using on confidential repositories, confirm that transmitting code structure information such as file paths and module names externally is acceptable.


## 7. Main Commands

Run these from the command palette (`Ctrl+Shift+P`).

| Command | Purpose |
| --- | --- |
| `Anytime Trail: Analyze Code` | Analyze the current workspace to generate the C4 diagram and code graph |
| `Anytime Trail: Analyze Code (Pick Tsconfig)` | Choose which `tsconfig.json` to analyze via QuickPick |
| `Anytime Trail: Open Trail Viewer` | Open Trail Viewer in the browser |
| `Anytime Trail: Check Spec Alignment (Working Tree)` | Check whether design documents have kept up with working-tree changes |
| `Anytime Trail: Analyze All Data` | Run the AnalyzeAll pipeline (requires `analyzeAll.enabled`) |
| `Anytime Trail: Record Safe Point` / `Rollback to Safe Point` | Record HEAD as a safe point, and restore it via a recovery branch |
| `Anytime Trail: Kill Switch (Block Claude Tool Execution)` / `Release Kill Switch` | Emergency block or release of Claude's tool execution when it runs away |
| `Anytime Trail: Restore Knowledge Base Snapshot` | Restore the entire `trail.db` from a snapshot |
| `Anytime Trail: Rebuild Memory Index` | Rebuild the memory-core index |
| `Anytime Trail: Register MCP Server` | Write `mcp-trail` to `.mcp.json` |


## 8. Configuration

| Key | Default | Description |
| --- | --- | --- |
| `anytimeTrail.workspace.path` | `""` | Absolute path of the workspace to analyze. Used by both Code Graph and C4 Model analysis. When empty, the workspace currently open in VS Code is used |
| `anytimeTrail.viewer.port` | `19841` | Port number for the Trail Viewer server |
| `anytimeTrail.daemon.useExternalDaemon` | `false` | Use an externally-running trail-server daemon. Requires `npx anytime-trail-server start` to be running first |
| `anytimeTrail.analyzeAll.enabled` | `false` | Enable the AnalyzeAll pipeline (importAll + memory-core runOnce). When off, the Pipelines tree view is hidden and no automatic or manual runs are performed |
| `anytimeTrail.lep.configPath` | `""` | Alternate path to `lep.json`. When set, only this file is read (the standard `.anytime/trail/lep.json` search is skipped). Reload Window to apply |

> **About the DB storage location**: The storage location for `trail.db` and the other DBs is determined
> not by VS Code settings but by `database.storagePath` in `lep.json` (default `.anytime/trail/db`). In
> the default configuration, this resolves to `<workspace>/.anytime/trail/db/trail.db`.

> **About token budget limits**: `anytimeAgent.budget.dailyLimitTokens` and the other budget settings live
> in the [Anytime Agent](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-agent) extension.
> Trail Viewer only displays the aggregated results.


## 9. License

[MIT](https://github.com/anytime-trial/anytime-markdown/blob/master/LICENSE)
