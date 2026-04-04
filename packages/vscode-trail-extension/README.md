# Anytime Trail

![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/anytime-trial.anytime-trail?label=VS%20Marketplace&logo=visual-studio-code)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)

**Git repository management, C4 architecture diagrams, and project visualization for VS Code.**

Manage Git repositories, visualize commit history, and generate interactive C4 architecture diagrams from your TypeScript codebase — all from a dedicated sidebar panel.

## Features

### C4 Architecture Diagram

- **Import** — Load Mermaid C4 diagrams (`.mmd`, `.mermaid`, `.txt`) into an interactive canvas
- **Analyze** — Auto-generate C4 models from TypeScript projects by scanning `tsconfig.json`
- **Level toggle** — Switch between architecture levels (L2: Container, L3: Component, L4: Code) to control detail granularity
- **Interactive canvas** — Pan, zoom, click nodes to open source files, and highlight connected nodes
- **Export** — Save as JSON (C4 model + boundaries) or Mermaid format (module dependencies)
- **Git integration** — Select a commit in the Graph view to highlight changed files in the C4 diagram

### Git Management

- **Repository** — Open folders or clone repositories; browse files with drag-and-drop; switch branches; filter by Markdown files
- **Changes** — View staged / unstaged changes; stage, unstage, discard, commit, and push with inline actions; badge shows change count
- **Graph** — ASCII-art commit graph with local / remote indicators and branch/tag decorations
- **Timeline** — Per-file commit history; compare any commit with the working copy

When [Anytime Markdown](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-markdown) is installed, Markdown diffs open in its rich compare mode. Otherwise, the standard VS Code diff editor is used.

## Getting Started

1. Install the extension
2. Click the **Anytime Trail** icon in the Activity Bar
3. Open a folder or clone a repository from the **Repository** view
4. Run **Anytime Trail: Analyze C4** from the Command Palette to generate a C4 diagram from your TypeScript project

## License

[MIT](https://github.com/anytime-trial/anytime-markdown/blob/master/LICENSE)
