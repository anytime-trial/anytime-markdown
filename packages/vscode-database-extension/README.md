# Anytime Database

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)

[日本語](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-database-extension/README.ja.md) | [English](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-database-extension/README.md)

**Browse and query SQLite databases without leaving VS Code.**

Anytime Database opens `.db` / `.sqlite` / `.sqlite3` / `.db3` files in a Custom Editor with a paginated table grid, a per-tab SQL editor, and an interactive ER diagram. It also pairs with the [Anytime Trail](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-trail) extension to expose your local Trail database and remote Supabase / PostgreSQL backends from the Activity Bar.


## 1. SQLite Custom Editor

**What you can do today:**

- Open any `.db` / `.sqlite` / `.sqlite3` / `.db3` file directly from the Explorer
- Switch between read-write and read-only modes via `anytimeDatabase.openMode`
- In read-write mode, edits run inside a `BEGIN IMMEDIATE` transaction and are committed only on `Ctrl+S`. Discard changes via the standard VS Code revert flow
- Per-platform native binary (`better-sqlite3`) is bundled inside each VSIX (linux/darwin/win32 × x64/arm64) — no external setup required

**How to use:** Right-click a `.db` / `.sqlite` file in the Explorer → **Open With…** → select **Anytime Database**, or simply double-click the file when this is the default editor.


## 2. Table Browsing & SQL Editor

**What you can do today:**

- Browse tables and views from the left **TableTree** with the database file name shown at the root
- Open multiple tables / queries in tabs simultaneously
- Paginate table data (25 / 50 / 100 rows per page; default 50). Pagination is hidden for ad-hoc query tabs
- Switch a table tab between **Data** and **Schema** views without losing state
- Run arbitrary SQL in the per-tab folding **SQL Editor**
  - Top-level `LIMIT` is auto-injected (default 1000 rows; configurable via `anytimeDatabase.query.maxRows`) when the query has none
  - Status bar shows last query rows and execution time, or the error message
  - Mutation SQL (`INSERT` / `UPDATE` / `DELETE` / DDL) is rejected in read-only mode
- Double-click a column header in the result grid to insert the column name into the SQL editor at the cursor
- Copy a range of cells with `Ctrl+C` to get TSV on the clipboard


## 3. ER Diagram

**What you can do today:**

- Right-click the database root in TableTree → **Show ER Diagram** to open an ERD tab
- Foreign keys are inferred from `PRAGMA foreign_key_list` (composite FKs supported) and rendered as orthogonal edges
- Hierarchical layout via [`graph-core`](https://github.com/anytime-trial/anytime-markdown/tree/master/packages/graph-core) keeps related tables close
- Pan / zoom with mouse drag and wheel; minimap shows the full graph at all times
- Click a table to dim unrelated cards and emphasize directly connected tables
- Edges route around obstacles to reduce overlap, with anchor diamonds drawn on the exact column row each FK references


## 4. Activity Bar (Database Panel)

The **Anytime Database** Activity Bar panel surfaces the local Trail SQLite database (`trail.db` from the Anytime Trail extension) and any configured remote backend.

**What you can do today:**

- Inspect the Trail SQLite status, last-imported timestamp, and gzip backup generations
- Add a Supabase or PostgreSQL row when configured by Anytime Trail, with status / last-synced / sync action
- Trigger **Sync to Supabase** / **Reconnect Supabase** from the row's inline actions

> [!NOTE]
> The Activity Bar panel is primarily a status surface for Anytime Trail's data integration. The Custom Editor (Section 1) is the standalone feature for browsing arbitrary SQLite files.


## 5. Configuration

| Key | Default | Description |
| --- | --- | --- |
| `anytimeDatabase.openMode` | `readwrite` | How to open SQLite files. `readwrite` allows write SQL with dirty/save UX. `readonly` opens with `OPEN_READONLY` and rejects mutations |
| `anytimeDatabase.query.maxRows` | `1000` | Maximum number of rows displayed for SQL Run results. Larger results are truncated with a warning banner |
| `anytimeDatabase.query.warnThresholdMs` | `5000` | Show a warning when a query takes longer than this number of milliseconds |


## 6. Commands

| Command | Title |
| --- | --- |
| `anytime-database.syncToSupabase` | Sync (visible on Supabase row inline actions) |
| `anytime-database.reconnectSupabase` | Reconnect (visible on Supabase row inline actions) |


## 7. Per-Platform Distribution

`anytime-database` ships native code (`better-sqlite3`) and is published as six per-platform VSIX files:

| Platform | Architecture |
| --- | --- |
| Linux | x64, arm64 |
| macOS | x64, arm64 |
| Windows | x64, arm64 |

VS Code Marketplace automatically downloads the right VSIX for your machine. There is no fallback `universal` build.


## 8. Localization

Tree-item labels in the Activity Bar panel are localized via the VS Code l10n bundle (`l10n/bundle.l10n.json` + `l10n/bundle.l10n.ja.json`). When VS Code's display language is set to Japanese, status / backup labels switch to 日本語 automatically.


## 9. License

[MIT](https://github.com/anytime-trial/anytime-markdown/blob/master/LICENSE)
