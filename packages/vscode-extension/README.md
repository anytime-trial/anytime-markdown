# Anytime Markdown Editor

A WYSIWYG Markdown editor extension for VS Code.\
Edit Markdown files with real-time preview powered by a Tiptap-based rich editor.

## Editor Modes

Switch modes via the pill-shaped toggles in the toolbar.

### Edit Mode (`Ctrl+Alt+S`)

| Mode | Description |
|---|---|
| **WYSIWYG** | Rich text editing with visual formatting and block insertion |
| **Source** | Edit raw Markdown text directly |
| **Review** | Read-only. Only comment insertion and checkbox toggling allowed |

### Compare Mode (`Ctrl+Alt+M`)

| Mode | Description |
|---|---|
| **Normal** | Single-panel editing |
| **Compare** | Side-by-side diff comparison and merge operations |

## Features

### Supported Markdown Elements

| Category | Elements |
|---|---|
| Text formatting | Bold, Italic, Underline, Strikethrough, Highlight, Inline code, Links |
| Headings | H1–H5 (collapsible, auto-numbered) |
| Lists | Bullet, Numbered, Task list (checkbox) |
| Blocks | Blockquote, Admonitions (NOTE / TIP / IMPORTANT / WARNING / CAUTION), Horizontal rule |
| Code blocks | Syntax highlighting (37 languages) |
| Tables | Add/remove rows & columns, cell alignment, row/column reorder, paste from Excel/Google Sheets |
| Diagrams | Mermaid (23 types), PlantUML (12 types) — with live preview |
| Math | Block math via KaTeX |
| HTML | Live preview with DOMPurify sanitization |
| Images | Relative path resolution, drag & drop, clipboard paste |
| Other | TOC, Footnotes, YAML front matter, Comments |

### Slash Commands

Type `/` in the editor to open the command menu.

| Command | Description |
|---|---|
| `/heading1`–`/heading3` | Headings H1–H3 |
| `/bulletList` | Bullet list |
| `/orderedList` | Numbered list |
| `/taskList` | Task list (checkbox) |
| `/blockquote` | Blockquote |
| `/codeBlock` | Code block |
| `/table` | Table (3×3) |
| `/horizontalRule` | Horizontal rule |
| `/mermaid` | Mermaid diagram |
| `/plantuml` | PlantUML diagram |
| `/math` | Math (KaTeX) |
| `/html` | HTML block |
| `/toc` | Table of contents (auto-generated) |
| `/date` | Today's date (YYYY-MM-DD) |
| `/footnote` | Footnote |
| `/note` `/tip` `/important` `/warning` `/caution` | Admonitions |
| `/comment` | Add comment |

### Compare (Merge) Mode

- Side-by-side diff comparison with block-level diff highlighting
- Line-level merge operations
- **Compare with Markdown Editor**: Load an external file into the right panel via explorer context menu
- **Git History**: View past versions in the right panel by selecting a commit

### Outline Panel

- Display heading list in the VS Code sidebar
- Click to scroll to the corresponding position

### Comment Panel

- Display document comments in the VS Code sidebar
- Resolve comments, filter by status (unresolved / resolved)

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+U` | Underline |
| `Ctrl+Shift+X` | Strikethrough |
| `Ctrl+Shift+H` | Highlight |
| `Ctrl+E` | Inline code |
| `Ctrl+K` | Insert/edit link |
| `Ctrl+Shift+M` | Add comment |
| `Ctrl+Shift+8` | Bullet list |
| `Ctrl+Shift+7` | Numbered list |
| `Ctrl+Shift+9` | Task list |
| `Ctrl+Alt+S` | Switch mode (Review / WYSIWYG / Source) |
| `Ctrl+Alt+M` | Toggle compare mode |
| `Ctrl+Alt+O` | Toggle outline |
| `Ctrl+S` | Save |

> On Mac, replace `Ctrl` with `Cmd`.

## Extension Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `anytimeMarkdown.fontSize` | number | `0` | Font size (px). 0 uses VS Code default |
| `anytimeMarkdown.editorMaxWidth` | number | `0` | Editor max width (px). 0 for no limit |

## Usage

`.md` / `.markdown` files open automatically with Anytime Markdown editor.

To open with the standard VS Code text editor, right-click the file → select **"Open With..."** → choose **"Text Editor"**.

## Requirements

- VS Code 1.109.0 or later

## Known Issues

- Drag & drop images are embedded as base64. Large images will increase the Markdown file size.
- Markdown round-trip through TipTap may reformat content on load. A notification is shown on first load.

## License

MIT License
