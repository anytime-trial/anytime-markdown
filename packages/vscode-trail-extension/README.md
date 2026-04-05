# Anytime Trail

![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/anytime-trial.anytime-trail?label=VS%20Marketplace&logo=visual-studio-code)![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)

**See your architecture while you code.**

Analyze TypeScript projects to auto-generate C4 architecture diagrams and DSM (Dependency Structure Matrix).\
A live browser viewer reflects code changes in real time.


## C4 Architecture Diagrams & DSM

One command visualizes your entire TypeScript project structure at four levels of detail.

| Level | What you see |
| --- | --- |
| L1 System Context | The system and its external relationships |
| L2 Container | Apps, APIs, databases, and other building blocks |
| L3 Component | Dependencies between packages and modules |
| L4 Code | Every file-level dependency |

![C4 Mermaid diagram example](images/c4-mermaid.png)

**Live Viewer** (`http://localhost:19840`)

- Three-pane layout: C4 graph, DSM matrix, and element tree
- Drill down with L1 through L4 level switching
- Cluster related modules in the DSM
- Circular dependencies highlighted in red
- Re-analysis and imports in VS Code are reflected instantly (WebSocket)

**Import / Export**

- Import Mermaid C4 diagrams (`.mmd`)
- Export as JSON or Mermaid format


## Git Management

All your daily Git operations in one sidebar.

- **Repository** -- Open folders / clone / switch branches.\
  Drag-and-drop file tree
- **Changes** -- Stage / unstage / discard / commit / push inline.\
  Badge shows change count at a glance
- **Graph** -- ASCII commit graph with branch flow overview
- **Timeline** -- Per-file commit history and diff comparison

> Pair with [Anytime Markdown](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-markdown) for rich Markdown diff views.


## Setup


### 1. Enable the C4 data server

Add to your VS Code `settings.json`:

```json
{
  "anytimeTrail.server.enabled": true
}
```


### 2. Reload VS Code

`Ctrl+Shift+P` -> `Developer: Reload Window`\
Look for `C4 Server: :19840` in the status bar to confirm it is running.


### 3. Run analysis

`Ctrl+Shift+P` -> `Anytime Trail: Analyze C4`

A browser tab opens automatically showing your project's architecture.\
Subsequent analyses update the existing tab in real time -- no new tabs are opened.

> To import a Mermaid C4 file instead, use `Anytime Trail: Import C4`.


## Viewer Controls

| Control | Description |
| --- | --- |
| L1 -- L4 | Switch C4 detail level |
| Fit | Fit the graph to screen |
| Cluster | Group DSM by dependency clusters |
| C4 / DSM / Tree | Toggle each pane |
| Drag | Pan the viewport |
| Scroll wheel | Zoom in / out |


## Configuration

| Key | Default | Description |
| --- | --- | --- |
| `anytimeTrail.server.enabled` | `false` | Enable / disable the C4 data server |
| `anytimeTrail.server.port` | `19840` | Data server port number |
| `anytimeTrail.c4.modelPath` | `.vscode/c4-model.json` | Path to save C4 model |
| `anytimeTrail.c4.analyzeExcludePatterns` | `[".worktrees", ...]` | Directory patterns to exclude from analysis |


## License

[MIT](https://github.com/anytime-trial/anytime-markdown/blob/master/LICENSE)
