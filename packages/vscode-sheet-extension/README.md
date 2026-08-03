# Anytime Sheet

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)

[日本語](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-sheet-extension/README.ja.md) | [English](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-sheet-extension/README.md)

**Edit spreadsheets as spreadsheets — inside VS Code.**

Opening a `.csv` in a text editor turns a table into a wall of commas. Anytime Sheet registers a Custom Editor so `.sheet`, `.csv`, and `.tsv` files open as a grid you can actually work in, without leaving the editor or round-tripping through another application.

**[Try the online editor](https://www.anytime-trial.com/sheet)**


## 1. What You Can Do

- **Grid editing for `.sheet` / `.csv` / `.tsv`** — open any of them from the Explorer and edit cells directly
- **Multi-sheet workbooks** — `.sheet` files hold several sheets; add, rename, and delete them from the sheet tabs
- **Undo and redo** — up to 100 steps with `Ctrl+Z` / `Ctrl+Y`, including row and column resizes
- **Fill handle** — drag to fill numeric, trailing-digit, arithmetic, and cyclic series
- **Copy and paste** — works both inside the grid and against the system clipboard
- **Charts from a selection** — build a chart from a selected range; it is stored alongside the sheet


## 2. Getting Started

Open a `.sheet`, `.csv`, or `.tsv` file from the Explorer. It opens in the sheet editor by default.

To create a new workbook, run **Anytime Sheet: New Sheet** from the Command Palette.

For an existing `.csv` that you would rather read as text, right-click it and choose **Open With** → **Text Editor**.


## 3. File Formats

| Extension | Handling |
| --- | --- |
| `.sheet` | Workbook format. Holds multiple sheets and keeps the sheet structure across saves |
| `.csv` / `.tsv` | Single-sheet plain text. Saved back in the same delimited format |


## 4. Related Extensions

- [Anytime Markdown](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-markdown) — WYSIWYG Markdown editing. Markdown tables can be edited full-screen in the same grid ([syntax guide](https://www.anytime-trial.com/en/markdown/table))
- [Anytime Graph](https://www.anytime-trial.com/en/cooccurrence) — graph whiteboard editor
- [Anytime Trail](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-trail) — structure, quality, and behavior visualization


## 5. License

MIT
