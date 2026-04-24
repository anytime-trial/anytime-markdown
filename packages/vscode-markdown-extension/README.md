# Anytime Markdown Editor

![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/anytime-trial.anytime-markdown?label=VS%20Marketplace&logo=visual-studio-code)![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)

[日本語](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-markdown-extension/README.ja.md) | [English](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-markdown-extension/README.md)

**Rich preview of AI-generated Markdown while you code — all inside VS Code.**

AI assistants write specs, designs, and notes in Markdown, but reviewing plain text is hard to read and switching between tools breaks your flow.

Anytime Markdown gives you a WYSIWYG editor with rich rendering, plus **collaborative editing with AI** to prevent file conflicts.


**[Try the Online Editor](https://www.anytime-trial.com/markdown)**

![Anytime Markdown Editor screen](images/markdown-editor-screen.png)


## 1. What You Can Do

- **Rich Markdown editing** — render tables, Mermaid, PlantUML, and KaTeX inline
- **Auto-lock while AI is editing** — prevent conflicts when Claude Code is writing to a file
- **AI change highlight in gutter** — visually mark edited blocks in the gutter when Claude Code modifies the file
- **Switch between 3 modes with one click** — WYSIWYG, Source, Review


## 2. Getting Started

Right-click a `.md` / `.markdown` file and choose **"Open with Anytime Markdown"** to open it in the editor.

Available from both the Explorer context menu and the editor title bar context menu.


## 3. Auto-Lock While AI Is Editing (Claude Code Collaborative Editing)

While Claude Code is editing a file, the editor becomes read-only to prevent conflicts.\
When editing finishes, the lock is released and the content is updated automatically.

- **[Anytime Trail](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-trail) required** — Trail registers the Claude Code hooks; this extension reads the status to control locking
- **Handles rapid edits** — lock is released 3 seconds after the last edit
- **Crash safe** — auto-unlocks after 30 seconds if Claude Code stops responding


## 4. AI Change Highlight Review

When Claude Code edits a file and the editor auto-reloads, changed and added blocks are marked in the gutter on the left side of the editor.\
See at a glance what was rewritten, then press `Escape` to clear the markers.

- **Added / changed blocks** — change marker shown in gutter
- **Deleted sections** — deletion indicator shown at the position of removal
- **Only active when auto-reload is enabled**


## 5. Editor Modes

| Mode | What it does |
| --- | --- |
| **WYSIWYG** | Visual editing with formatting, diagrams, and tables |
| **Source** | Edit raw Markdown directly |
| **Review** | Read-only. Great for reviewing AI output |

Switch with the mode menu in the toolbar.


## 6. Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Ctrl+Shift+V` / `Cmd+Shift+V` | Paste as Markdown |


## 7. Settings

| Setting | Default | Description |
| --- | --- | --- |
| `anytimeMarkdown.fontSize` | `0` | Font size (px). 0 = VS Code default |
| `anytimeMarkdown.editorMaxWidth` | `0` | Max editor width (px). 0 = no limit |
| `anytimeMarkdown.language` | `auto` | Editor UI language (auto / en / ja) |
| `anytimeMarkdown.themeMode` | `auto` | Color mode (auto / light / dark) |
| `anytimeMarkdown.themePreset` | `handwritten` | Theme style (handwritten / professional) |
| `anytimeMarkdown.storagePath` | `""` | Storage path for intermediate files (empty = VS Code storage area) |


## 8. License

MIT
