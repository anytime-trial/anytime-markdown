# Anytime Markdown Editor

![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/anytime-trial.anytime-markdown?label=VS%20Marketplace&logo=visual-studio-code)![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)

**Rich preview of AI-generated Markdown while you code — all inside VS Code.**

AI assistants write specs, designs, and notes in Markdown, but reviewing plain text is hard to read and switching between tools breaks your flow.

Anytime Markdown gives you a WYSIWYG editor with rich rendering, plus **collaborative editing with AI** to prevent file conflicts.


![](images/paste-20260328-141304.png)

## 1. What You Can Do

- **Rich Markdown editing** — render tables, Mermaid, PlantUML, and KaTeX inline
- **Paste a screenshot and tell AI "fix this"** — share images with AI via Agent Note
- **Auto-lock while AI is editing** — prevent conflicts when Claude Code is writing to a file
- **Switch between 3 modes with one click** — WYSIWYG, Source, Review


## 2. Getting Started

`.md` / `.markdown` files open with Anytime Markdown automatically.

To use the standard text editor, right-click a file and choose **"Open With..."** > **"Text Editor"**.


## 3. Share Screenshots with AI (Agent Note)

Paste images and screenshots into the editor, then share them with AI as visual context.

**How to use:**

1. Open a note from **Agent Note** in the sidebar
2. Paste screenshots or tables from your clipboard
3. Run `/anytime-note fix this bug` in Claude Code
4. AI reads the images in the note and performs the task

> When Claude Code is installed, the `/anytime-note` skill is auto-generated.


![](images/markdown-agent-note.gif)

## 4. Auto-Lock While AI Is Editing (Claude Code Collaborative Editing)

While Claude Code is editing a file, the editor becomes read-only to prevent conflicts.\
When editing finishes, the lock is released and the content is updated automatically.

- **Zero config** — auto-enabled when Claude Code is installed
- **Handles rapid edits** — lock is released 3 seconds after the last edit
- **Crash safe** — auto-unlocks after 30 seconds if Claude Code stops responding


## 5. Browse AI Logs and Memory (AI Log / AI Memory)

View Claude Code session information in the **Anytime Markdown** sidebar panel.

| Panel | Description |
| --- | --- |
| **AI Log** | Session execution logs in Markdown. Click to open in the editor |
| **AI Memory** | Per-project memory entries. Click to view or edit |

> These panels read from `~/.claude/projects/`.\
> They are hidden when Claude Code is not installed.


## 6. Editor Modes

| Mode | What it does |
| --- | --- |
| **WYSIWYG** | Visual editing with formatting, diagrams, and tables |
| **Source** | Edit raw Markdown directly |
| **Review** | Read-only. Great for reviewing AI output |

Switch with the toolbar toggles or `Ctrl+Alt+S` (`Cmd+Alt+S` on Mac).


## 7. Settings

| Setting | Default | Description |
| --- | --- | --- |
| `anytimeMarkdown.fontSize` | `0` | Font size (px). 0 = VS Code default |
| `anytimeMarkdown.editorMaxWidth` | `0` | Max editor width (px). 0 = no limit |
| `anytimeMarkdown.language` | `auto` | Editor UI language (auto / en / ja) |
| `anytimeMarkdown.themeMode` | `auto` | Color mode (auto / light / dark) |
| `anytimeMarkdown.themePreset` | `handwritten` | Theme style (handwritten / professional) |


## 8. License

MIT
