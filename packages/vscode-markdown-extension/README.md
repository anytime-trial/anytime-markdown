# Anytime Markdown Editor

![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/anytime-trial.anytime-markdown?label=VS%20Marketplace&logo=visual-studio-code)![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)

**Rich preview of AI-generated Markdown while you code — all inside VS Code.**

AI assistants write specs, designs, and notes in Markdown, but reviewing plain text is hard to read and switching between tools breaks your flow.

Anytime Markdown gives you a WYSIWYG editor with rich rendering, plus **collaborative editing with AI** to prevent file conflicts.


![](images/markdown-editor-screen.png)


## 1. What You Can Do

- **Rich Markdown editing** — render tables, Mermaid, PlantUML, KaTeX, JSXGraph, and Plotly inline
- **Auto-lock while AI is editing** — prevent conflicts when Claude Code is writing to a file
- **Switch between 3 modes with one click** — WYSIWYG, Source, Review
- **Broken link warnings** — wave underlines for invalid file links and anchors
- **Status bar** — cursor position, character count, line count, line ending, and encoding
- **Diff view** — compare two versions side by side
- **Section number insertion and removal**

> **Tip:** To share screenshots with Claude Code, use the **Note** panel in [Anytime Trail](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-trail).


## 2. Getting Started

Right-click a `.md` / `.markdown` file and choose **"Open with Anytime Markdown"** to open it in the editor.

Available from both the Explorer context menu and the editor title bar context menu.


## 3. Auto-Lock While AI Is Editing (Claude Code Collaborative Editing)

While Claude Code is editing a file, the editor becomes read-only to prevent conflicts.\
When editing finishes, the lock is released and the content is updated automatically.

- **Zero config** — auto-enabled when Claude Code is installed
- **Handles rapid edits** — lock is released 3 seconds after the last edit
- **Crash safe** — auto-unlocks after 30 seconds if Claude Code stops responding


## 4. Editor Modes

| Mode | What it does |
| --- | --- |
| **WYSIWYG** | Visual editing with formatting, diagrams, and tables |
| **Source** | Edit raw Markdown directly |
| **Review** | Read-only. Great for reviewing AI output |

Switch with the mode menu in the toolbar.


## 5. Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Ctrl+Shift+V` / `Cmd+Shift+V` | Paste as Markdown |


## 6. Settings

| Setting | Default | Description |
| --- | --- | --- |
| `anytimeMarkdown.fontSize` | `0` | Font size (px). 0 = VS Code default |
| `anytimeMarkdown.editorMaxWidth` | `0` | Max editor width (px). 0 = no limit |
| `anytimeMarkdown.language` | `auto` | Editor UI language (auto / en / ja) |
| `anytimeMarkdown.themeMode` | `auto` | Color mode (auto / light / dark) |
| `anytimeMarkdown.themePreset` | `handwritten` | Theme style (handwritten / professional) |


## 7. License

MIT
