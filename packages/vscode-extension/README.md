# Anytime Markdown Editor

![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/kiytaka-ueda.anytime-markdown?label=VS%20Marketplace&logo=visual-studio-code)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)

**Review AI-generated docs while you code — all inside VS Code.**

AI assistants are great at writing specs, designs, and notes in Markdown. But reviewing them in plain text is painful, and switching between your editor and a Git GUI breaks your flow.

Anytime Markdown gives you a rich WYSIWYG editor with built-in Git support, so you can **open a docs repository right next to your code** and keep everything in one window.

## 1. What You Can Do

- **Open multiple doc repos** in the sidebar alongside your source code
- **Review AI output** with live-rendered tables, diagrams (Mermaid / PlantUML), and math
- **Compare versions** side-by-side with diff highlighting (semantic section-based diff available)
- **Annotate images** with shapes and comments directly in the editor
- **Edit images** with crop, resize, ruler, and grid tools
- **Commit and push** docs without leaving VS Code
- **Track history** with a visual Git graph and per-file timeline
- **Validate links** with diagnostics for broken file/anchor references

## 2. How It Works

1. AI generates a Markdown document
2. Open the docs repo in the **Markdown Docs** panel
3. Review in **WYSIWYG** or **Review** mode
4. Compare with previous versions
5. Edit, commit, push — done

## 3. Editor Modes

| Mode | What it does |
| --- | --- |
| **WYSIWYG** | Visual editing with formatting, diagrams, and tables |
| **Source** | Edit raw Markdown directly |
| **Review** | Read-only. Great for reviewing AI output |

Switch with the toolbar toggles or `Ctrl+Alt+S` (`Cmd+Alt+S` on Mac).

## 4. Sidebar Panels

- **Markdown Docs** — file tree with multi-repo support, branch switching, Markdown filter
- **Changes** — stage, unstage, discard, commit, push (per repo)
- **Graph** — visual commit log (blue = local, red = remote)
- **Timeline** — file history, click to compare

## 5. Slash Commands

Type `/` to insert: headings, lists, tables, code blocks, Mermaid / PlantUML diagrams, math (KaTeX), HTML, TOC, footnotes, admonitions, comments, and more.

## 6. Settings

| Setting | Default | Description |
| --- | --- | --- |
| `anytimeMarkdown.fontSize` | `0` | Font size (px). 0 = VS Code default |
| `anytimeMarkdown.editorMaxWidth` | `0` | Max editor width (px). 0 = no limit |

## 7. Getting Started

`.md` / `.markdown` files open with Anytime Markdown automatically. To use the standard text editor instead, right-click a file and choose **"Open With..."** &gt; **"Text Editor"**.

Requires VS Code 1.109.0 or later.

## 8. License

MIT
