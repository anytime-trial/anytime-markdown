# Anytime Graph

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)

[日本語](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-graph-extension/README.ja.md) | [English](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-graph-extension/README.md)

**See what gets talked about together — as a diagram, inside VS Code.**

Interview notes, review comments, and free-text survey answers hide their structure: a flat list never shows which words keep appearing together. Moving the text into an external analysis tool works, but every revision costs another round trip.

Anytime Graph edits co-occurrence networks (`*.cooc.json`) in a VS Code custom editor, so you can **let an AI generate the network and then refine it by hand** without leaving the editor.

[**Try the online editor**](https://www.anytime-trial.com/cooccurrence)


## 1. Features

- **Visual co-occurrence editing** — circle size = frequency, line = co-occurrence strength, color = cluster
- **Term editing from a panel** — search, add, rename, set frequency, assign a cluster, delete
- **Filters that keep only what matters** — thin the view by minimum frequency, minimum strength, or top-N links
- **Force layout runs in a Worker** — the UI stays responsive on large networks, and you can abort mid-run
- **Positions cached in the file** — reopening keeps the same arrangement; it recomputes only when the content changes
- **PNG export** — drop the diagram straight into a document
- **Sidebar list** — browse and open every `*.cooc.json` in the workspace


## 2. Getting Started

1. Open **Anytime Graph** from the activity bar
2. Click **+** in the **Co-occurrence Networks** view title bar (`Anytime Graph: New Network`)
3. Enter a file name (defaults to `untitled.cooc.json`)
4. An empty network is created and opened in the custom editor

Existing `*.cooc.json` files open in the custom editor straight from the explorer.\
New files are created directly under the first workspace folder (names containing a path separator are rejected).


## 3. Editing Terms and Co-occurrences

Terms are edited from the **Words** panel on the right. Clicking a term in the diagram selects it in the list as well.

| Action | Effect |
| --- | --- |
| **Add** | Add a new term with a label and frequency |
| **Rename** | Change the term label |
| **Set frequency** | Drives circle size (area is proportional to frequency) |
| **Set cluster** | Drives circle color; unassigned terms show as "no cluster" |
| **Delete** | Removes the term together with its co-occurrences |

**There is no GUI yet for adding co-occurrences (the lines between terms) or changing their strength.** Build networks with links via "6. Generating from an AI (MCP)" below, or edit the file directly.


## 4. Filtering and Display

Large networks become unreadable. Use the **Filters** panel on the left to thin the view.

- **Minimum frequency** — hide terms below the threshold
- **Minimum strength** — hide weak co-occurrence lines
- **Top links** — keep only the N strongest co-occurrences
- Filters change **the view only**; the file content is untouched
- Hidden terms are marked as hidden from the diagram by the current filter in the list

The toolbar offers **Fit** (fit the whole diagram on screen), **PNG** (export), **Save**, and **Show/Hide panels**.\
Display language and color theme follow your VS Code settings.


## 5. Layout

Positions come from a force layout (repulsion, attraction, and gravity toward the origin). It runs in a Web Worker, so the editor stays usable while it computes, and the toolbar **Abort** stops it.

- Results are cached as coordinates under `layout` in the `*.cooc.json` file
- The cache is validated against a content hash and an algorithm version, so it recomputes **only when terms or co-occurrences change**
- Isolated terms with no co-occurrences are pulled toward the origin instead of drifting off-canvas


## 6. Generating from an AI (MCP)

**The MCP server (mcp-graph) ships with the extension — nothing extra to install.** It writes a co-occurrence network straight out of a text analysis. Endpoints are given as **term labels**, so there is no need to count indices.

| Tool | Purpose |
| --- | --- |
| `write_cooccurrence` | Write a `*.cooc.json` file (`replace` overwrites, `append` keeps existing terms and links) |
| `read_cooccurrence` | Read an existing `*.cooc.json` with term-label endpoints |

Wiring happens automatically.

- **VS Code (Copilot / Chat)** — the extension provides the server; no configuration needed
- **Claude Code** — on activation the extension adds `mcp-graph` to the workspace `.mcp.json`. An existing entry of the same name is never overwritten (so a hand-tuned setup survives). To rebuild the entry, run `Anytime Graph: Register MCP Server in .mcp.json` from the command palette

The intended split is: generate the file with the MCP tools, then open it here and refine frequencies and clusters by hand.


## 7. File Format

Co-occurrence networks are stored as `*.cooc.json` — plain JSON, friendly to version control.

```json
{
  "meta": { "schemaVersion": 1, "generatedAt": "2026-07-22T00:00:00.000Z", "origin": "manual" },
  "spec": {
    "title": "Interview analysis",
    "subject": 0,
    "nodes": [{ "label": "deadline", "frequency": 12 }],
    "links": [[0, 1, 0.8]],
    "clusters": [{ "label": "constraints", "members": [0, 1] }]
  }
}
```

- `links` are `[term index, term index, strength]`. **A term's index in `nodes` is its identity**, so reordering `nodes` or deleting from the middle by hand changes what existing `links` point at
- The term named by `subject` is emphasized with a thicker outline
- `layout` is only a position cache and can be omitted when writing the file by hand


## 8. Commands

| Command | Action |
| --- | --- |
| `Anytime Graph: New Network` | Create an empty `*.cooc.json` and open it in the editor |
| `Anytime Graph: Refresh Networks` | Reload the co-occurrence network list in the sidebar |
| `Anytime Graph: Register MCP Server in .mcp.json` | Create or update the `mcp-graph` entry in `.mcp.json` (overwrites an existing one) |


## 9. License

[MIT](https://github.com/anytime-trial/anytime-markdown/blob/master/LICENSE)
