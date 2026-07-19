# Anytime Markdown Editor

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)

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
- **Document search and Note Graph** — search across your entire documentation repository and visualize how documents connect to each other
- **History and commit comparison** — compare past commit content against the current version from the Timeline view


## 2. Getting Started

Right-click a `.md` / `.markdown` file and choose **"Open with Anytime Markdown"** to open it in the editor.

Available from both the Explorer context menu and the editor title bar context menu.


## 3. Auto-Lock While AI Is Editing (Claude Code Collaborative Editing)

While Claude Code is editing a file, the editor becomes read-only to prevent conflicts.\
When editing finishes, the lock is released and the content is updated automatically.

- **[Anytime Agent](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-agent) required** — the Agent extension registers the Claude Code hooks; this extension reads the status to control locking
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


## 6. Document Search and Note Graph

Set `anytimeMarkdown.docsRoot` to the root of your documentation repository to index the whole repository and search across it from the editor.

- **Full-text search** — the index is stored in `doc-core.db` and refreshed automatically every `anytimeMarkdown.docSearch.intervalMinutes` (default 30 minutes). Trigger a manual rebuild from the Command Palette: `Anytime Markdown: Rebuild Doc Search Index`
- **Note Graph** — builds a relationship graph between documents from the frontmatter `related`, `tags`, and `c4Scope` fields plus `.md` links in the body, shown in the side toolbar. Follow related documents to move between specs
- If `docsRoot` is empty, indexing is disabled and the Note Graph falls back to the git repository that the current document belongs to


## 7. History and Commit Comparison

Opening a Markdown file shows its commit history in the **Timeline** view of the **Anytime Markdown** sidebar.\
Right-click a commit and choose **Compare with this commit** to diff its content against the current content.

**Compare with Anytime** in the editor title bar opens a regular diff view rendered by Anytime Markdown.


## 8. Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Ctrl+Shift+V` / `Cmd+Shift+V` | Paste as Markdown |


## 9. Bundled Skills

On activation, the extension installs Claude Code skills into the workspace's `.claude/skills/`.\
To reinstall them, run `Anytime Markdown: Reinstall Markdown Skills (.claude/skills)` from the Command Palette.

| Skill | Purpose |
| --- | --- |
| `anytime-doc-authoring` | Writing guide defining what to write per document type (spec / tech / proposal, etc.) and how to maintain the index |
| `anytime-markdown-output` | Output conventions for syntax, frontmatter, and formatting |
| `anytime-markdown-check` | Post-output verification (semantic judgments that can't be auto-formatted) |
| `anytime-markdown-usage` | Low-token search, investigation, and editing workflow using `mcp-markdown` |
| `anytime-spec-lookup` | Procedure for following related links from the index to read only the specs you need |
| `anytime-mermaid` | Readability guidelines for Mermaid diagrams |


## 10. Settings

| Setting | Default | Description |
| --- | --- | --- |
| `anytimeMarkdown.fontSize` | `0` | Font size (px). 0 = VS Code default |
| `anytimeMarkdown.measure` | `standard` | Body text column width (line length) (focus / standard / wide / full) |
| `anytimeMarkdown.language` | `auto` | Editor UI language (auto / en / ja) |
| `anytimeMarkdown.themeMode` | `auto` | Color mode (auto / light / dark) |
| `anytimeMarkdown.themePreset` | `handwritten` | Theme style (handwritten / professional) |
| `anytimeMarkdown.docsRoot` | `""` | Root of the documentation repository (absolute path). Used by doc search indexing and the Note Graph panel (empty = indexing disabled, falls back to the git repository) |
| `anytimeMarkdown.docSearch.dbPath` | `""` | Path of the doc search database (doc-core.db) (empty = `<workspace>/.anytime/markdown/doc-core.db`) |
| `anytimeMarkdown.docSearch.intervalMinutes` | `30` | Auto re-index interval (minutes). 0 = disable periodic re-indexing |


## 11. License

MIT
