# Anytime Trail

![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/anytime-trial.anytime-trail?label=VS%20Marketplace&logo=visual-studio-code)![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)

**See your architecture while you code.**

Analyze TypeScript projects to auto-generate C4 architecture diagrams and DSM (Dependency Structure Matrix).\
Visualize Claude Code session logs to analyze your AI-assisted work history.


## C4 Architecture Diagrams & DSM

One command visualizes your entire TypeScript project structure at four levels of detail.

| Level | What you see |
| --- | --- |
| L1 System Context | The system and its external relationships |
| L2 Container | Apps, APIs, databases, and other building blocks |
| L3 Component | Dependencies between packages and modules |
| L4 Code | Every file-level dependency |

![C4 Mermaid diagram example](images/c4-mermaid.png)

**Live Viewer** (`http://localhost:19841`)

- Three-pane layout: C4 graph, DSM matrix, and element tree
- Drill down with L1 through L4 level switching
- Cluster related modules in the DSM
- Circular dependencies highlighted in red
- Re-analysis and imports in VS Code are reflected instantly (WebSocket)
- **F-C Map**: Feature-Component matrix view (toggle inside the DSM pane)
- **Deleted elements**: Elements removed by re-analysis are flagged as deleted and shown with strikethrough
- **Document links**: Markdown files with `c4Scope` frontmatter are indexed and linked to C4 elements in the viewer

**Import / Export**

- Import Mermaid C4 diagrams (`.mmd`)
- Export as JSON or Mermaid format


## Trail Viewer — Claude Code Session Analysis

Opens a browser viewer at `http://localhost:19841` to analyze Claude Code session logs.

**Import**

JSONL logs written by Claude Code to `~/.claude/` are imported into a local SQLite database.\
Run the import manually from the **Dashboard** panel in the sidebar.

**Viewer features**

- Session list with filtering by branch, model, and date
- Analytics tab: cost estimation, tool usage stats, and commit statistics
- Prompts tab: Claude Code skills and `settings.json` content

**Remote sync**

Sync the local SQLite data to Supabase or PostgreSQL.


## AI Memory

The **Memory** panel in the sidebar lists Claude Code memory files for the current project.\
Click any entry to open and edit it in Anytime Markdown.

> Reads from `~/.claude/projects/<project>/memory/`.\
> Hidden when Claude Code is not installed.


## Coverage Integration

Set `anytimeTrail.coverage.path` to point to a `coverage-final.json` file to automatically detect changes and push coverage data into the C4 viewer.

- Coverage snapshots are saved per change (configurable limit via `coverage.historyLimit`)
- Run coverage tests directly from the L4 node in the C4 tree


## Claude Code Integration

Claude Code skills are automatically installed to `~/.claude/skills/` when the extension activates.\
They are removed automatically on uninstall.

**`/anytime-fcmap`**

Generates or updates the Feature-Component Map (`featureMatrix`) from source code analysis.

- **Full generation**: Analyze the C4 model via `trail-core` CLI and generate the entire featureMatrix
- **Incremental update**: Re-analyze only files changed since the last revision for efficient updates


## Setup


### 1. Enable the C4 data server

### 2. Run analysis

`Ctrl+Shift+P` → `Anytime Trail: Analyze C4`

A browser tab opens automatically showing your project's architecture.\
Subsequent analyses update the existing tab in real time — no new tabs are opened.

> To import a Mermaid C4 file instead, use `Anytime Trail: Import C4`.

### 3. Open the Trail Viewer

Click the Trail icon in the **Dashboard** sidebar panel, or run the `Anytime Trail: Open Trail Viewer` command.\
The browser opens at `http://localhost:19841`.

To import JSONL logs, click the inline button on the SQLite row in the Dashboard panel.


## Configuration

| Key | Default | Description |
| --- | --- | --- |
| `anytimeTrail.trailServer.port` | `19841` | Server port number |
| `anytimeTrail.c4.modelPath` | `.vscode/c4-model.json` | Path to save the C4 model |
| `anytimeTrail.c4.analyzeExcludePatterns` | `[".worktrees", ...]` | Directory patterns to exclude from analysis |
| `anytimeTrail.docsPath` | `""` | Absolute path to the documentation directory for C4 document links |
| `anytimeTrail.coverage.path` | `""` | Path to `coverage-final.json` (relative to workspace root) |
| `anytimeTrail.coverage.historyLimit` | `50` | Maximum number of coverage history snapshots to keep |
| `anytimeTrail.test.e2eCommand` | `cd packages/web-app && npm run e2e` | Command to run E2E tests |
| `anytimeTrail.test.coverageCommand` | `npx jest --coverage --maxWorkers=1` | Command to run tests with coverage |
| `anytimeTrail.remote.provider` | `none` | Remote DB provider (`none` / `supabase` / `postgres`) |
| `anytimeTrail.remote.supabaseUrl` | `""` | Supabase project URL |
| `anytimeTrail.remote.supabaseAnonKey` | `""` | Supabase anon key |
| `anytimeTrail.remote.postgresUrl` | `""` | PostgreSQL connection string |


## License

[MIT](https://github.com/anytime-trial/anytime-markdown/blob/master/LICENSE)
