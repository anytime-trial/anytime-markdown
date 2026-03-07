## Basic Operations

The editor supports three modes and various file operations.

![Basic Operations](/help/basic-ops.png)

Switch modes using the toggle button group on the right side of the toolbar.

| Icon | Mode | Description |
| :--: | ---- | ----------- |
| ![Review](/help/icons/view.png) | Review mode | Read-only browsing mode. Text editing and block manipulation are disabled. Comments can still be added via the bubble menu. Double-click on diagrams, tables, or images to view them in fullscreen. |
| ![Edit](/help/icons/wysiwyg.png) | Edit mode | Edit with rich-text formatting and real-time preview. |
| ![Source](/help/icons/source.png) | Source mode | Edit raw Markdown directly. The Image, Horizontal Rule, Table, Code Block, and Diagram insert buttons are also available, inserting the corresponding Markdown syntax at the end of the text. |

Switch between Normal Mode and Compare Mode using the toggle button group on the right side of the toolbar.

| Icon | Mode | Description |
| :--: | ---- | ----------- |
| ![Normal](/help/icons/normal-mode.png) | Normal Mode | Standard editing mode. |
| ![Compare](/help/icons/compare-mode.png) | Compare Mode | The editor splits into two panes with differences highlighted. The secondary (right) pane accepts direct text input or Markdown file upload. |

### File Operations

File operations are available from the toolbar.

| Icon | Action | Shortcut | Description |
| :--: | ------ | -------- | ----------- |
| ![New](/help/icons/create-new.png) | New | | Clear the current content and create a new document. |
| ![Open](/help/icons/open-file.png) | Open | Ctrl+O | Open a Markdown file (.md) from your device. |
| ![Save](/help/icons/save.png) | Save | Ctrl+S | Overwrite the currently opened file. |
| ![Save As](/help/icons/save-as.png) | Save As | Ctrl+Shift+S | Save the document as a new Markdown file (.md). |
| ![Export PDF](/help/icons/export-pdf.png) | Export as PDF | | Export the document as a PDF file. |

| Icon | Action | Description |
| :--: | ------ | ----------- |
| ![Outline](/help/icons/outline.png) | Outline Toggle | Toggle the outline panel visibility from the toolbar. |

### Other

- More menu: Access Help Page, Editor Settings, and Version Info from the "⋮" button at the right end of the toolbar.
- Auto-save: Content is automatically saved to your browser's local storage.

## Text Decoration

Select text to show the bubble menu for applying formatting. Keyboard shortcuts are also available.

| Icon | Decoration | Shortcut | Description |
| :--: | ---------- | -------- | ----------- |
| ![Bold](/help/icons/bold.png) | Bold | Ctrl+B | Make selected text **bold**. |
| ![Italic](/help/icons/italic.png) | Italic | Ctrl+I | Make selected text *italic*. |
| ![Underline](/help/icons/underline.png) | Underline | Ctrl+U | Add underline to selected text. |
| ![Strikethrough](/help/icons/strikethrough.png) | Strikethrough | Ctrl+Shift+X | Add ~~strikethrough~~ to selected text. |
| ![Highlight](/help/icons/highlight.png) | Highlight | Ctrl+Shift+H | Highlight selected text. |
| ![Inline Code](/help/icons/inline-code.png) | Inline Code | Ctrl+E | Display selected text as `code`. |
| ![Link](/help/icons/link.png) | Link | Ctrl+K | Add a link to selected text. |

## Block Elements

Insert block-level elements via the toolbar or keyboard shortcuts.

| Icon | Element | Shortcut | Description |
| :--: | ------- | -------- | ----------- |
| ![Image](/help/icons/image.png) | Image | Ctrl+Alt+I | Insert an image by specifying a URL. |
| ![Horizontal Rule](/help/icons/horizontal-rule.png) | Horizontal Rule | Ctrl+Alt+R | Insert a divider line. |
| ![Table](/help/icons/table.png) | Table | Ctrl+Alt+T | Insert a 3×3 table. |
| ![Code Block](/help/icons/code-block.png) | Code Block | Ctrl+Alt+C | Insert a fenced code block with syntax highlighting. |
| ![Diagram](/help/icons/diagram.png) | Diagram | Ctrl+Alt+D | Insert a Mermaid or PlantUML diagram. |
| ![HTML](/help/icons/html-block.png) | HTML | Ctrl+Alt+H | Insert an HTML preview block. |
| ![Template](/help/icons/template.png) | Template | Ctrl+Alt+P | Insert a predefined template. |

### Code Block

Insert a fenced code block with `Ctrl+Alt+C` or the toolbar.

- Syntax highlighting is supported for approximately 37 languages, including TypeScript, JavaScript, Python, Java, Go, Rust, C/C++, SQL, Bash, HTML, CSS, and more.
- The language is auto-detected, or you can specify it by selecting from the language label in the toolbar.
- The toolbar provides fold/unfold, fullscreen editing, code copy, and delete actions.

### Table

Insert and edit tables using the toolbar and in-table controls.

![Table](/help/table.png)

Floating table toolbar:

| Icon | Action | Description |
| :--: | ------ | ----------- |
| ![Add Column](/help/icons/add-column.png) | Add Column | Add a new column to the right of the current column. |
| ![Remove Column](/help/icons/remove-column.png) | Remove Column | Delete the current column. |
| ![Add Row](/help/icons/add-row.png) | Add Row | Add a new row below the current row. |
| ![Remove Row](/help/icons/remove-row.png) | Remove Row | Delete the current row. |
| ![Align Left](/help/icons/align-left.png) | Align Left | Align cell text to the left. |
| ![Align Center](/help/icons/align-center.png) | Align Center | Center cell text. |
| ![Align Right](/help/icons/align-right.png) | Align Right | Align cell text to the right. |
| ![Move Row Up](/help/icons/move-row-up.png) | Move Row Up | Move the current row up. |
| ![Move Row Down](/help/icons/move-row-down.png) | Move Row Down | Move the current row down. |
| ![Move Col Left](/help/icons/move-col-left.png) | Move Col Left | Move the current column to the left. |
| ![Move Col Right](/help/icons/move-col-right.png) | Move Col Right | Move the current column to the right. |
| ![Fullscreen](/help/icons/fullscreen.png) | Fullscreen | Edit the table in fullscreen mode. |

- Navigate cells with Tab (next cell) and Shift+Tab (previous cell).

### Diagrams (Mermaid)

Create diagrams using Mermaid syntax in a code block.

![Diagrams - Mermaid](/help/mermaid.png)

- Supported diagram types: Flowchart, Sequence, Class, ER, State Machine, Gantt, Mindmap, Git Graph, and more.

Floating toolbar:

| Icon | Action | Description |
| :--: | ------ | ----------- |
| ![Fold](/help/icons/fold.png) | Fold/Unfold | Collapse or expand the diagram view. |
| ![Fullscreen](/help/icons/fullscreen.png) | Fullscreen | View and edit the diagram in fullscreen mode. |
| ![Sample](/help/icons/sample.png) | Insert Sample | Insert a predefined diagram sample. Opens a popover to choose from available samples. |
| ![Copy](/help/icons/copy.png) | Copy Code | Copy the diagram source code to the clipboard. |
| ![Capture](/help/icons/capture.png) | Capture | Export the rendered diagram as a PNG image. |
| ![Delete](/help/icons/delete.png) | Delete | Delete the diagram block. |

- Zoom, pan, and code editing are available in fullscreen mode.

### Diagrams (PlantUML)

Create diagrams using PlantUML syntax in a code block.

![Diagrams - PlantUML](/help/plantuml.png)

- Supported diagram types: Sequence, Class, Use Case, Activity, State, Component, Deployment, ER, and more.
- PlantUML diagrams are rendered via an external server (plantuml.com). You will be asked for consent before sending diagram code.

The floating toolbar provides the same icons and actions as Mermaid diagrams.

### HTML Preview

Insert and preview HTML content directly within the editor.

![HTML Preview](/help/html.png)

- Write raw HTML in the code editor and see a live preview rendered below.
- Useful for embedding forms, styled components, and custom layouts that standard Markdown does not support.

Floating toolbar:

| Icon | Action | Description |
| :--: | ------ | ----------- |
| ![Fold](/help/icons/fold.png) | Fold/Unfold | Collapse or expand the HTML preview. |
| ![Fullscreen](/help/icons/fullscreen.png) | Fullscreen | Edit HTML in fullscreen mode. |
| ![Sample](/help/icons/sample.png) | Insert Sample | Insert a predefined HTML sample (form, table, card, etc.). |
| ![Copy](/help/icons/copy.png) | Copy Code | Copy the HTML source code to the clipboard. |
| ![Delete](/help/icons/delete.png) | Delete | Delete the HTML block. |

### Admonitions

Admonitions (callout blocks) highlight important information with colored borders and backgrounds.

- Use slash commands (`/note`, `/tip`, `/important`, `/warning`, `/caution`) to insert an admonition.
- In source mode, use GitHub-compatible syntax: `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`.

| Type | Color | Description |
| ---- | ----- | ----------- |
| Note | Blue | General information or reference. |
| Tip | Green | Helpful advice or best practices. |
| Important | Purple | Key information that should not be missed. |
| Warning | Yellow | Potential issues to be aware of. |
| Caution | Red | Critical warnings about dangerous actions. |

### Footnotes

Insert footnote references in your document.

- Use the `/footnote` slash command to insert a footnote reference.
- In source mode, use `[^id]` syntax for references and `[^id]: content` for definitions.

### Math Equations (KaTeX)

Write mathematical expressions using KaTeX syntax.

- Use the `/math` slash command to insert a math block.
- Write inline math by wrapping expressions with `$...$` (e.g. `$E = mc^2$`).

Floating toolbar:

| Icon | Action | Description |
| :--: | ------ | ----------- |
| ![Fold](/help/icons/fold.png) | Fold/Unfold | Collapse or expand the math preview. |
| ![Fullscreen](/help/icons/fullscreen.png) | Fullscreen | Edit the math expression in fullscreen mode. |
| ![Sample](/help/icons/sample.png) | Insert Sample | Insert a predefined math sample (Fraction, Sum, Integral, Matrix, Limit, Derivative, Cases). |
| ![Copy](/help/icons/copy.png) | Copy Code | Copy the KaTeX source to the clipboard. |
| ![Delete](/help/icons/delete.png) | Delete | Delete the math block. |

### Table of Contents

Automatically generate a table of contents from headings in the document.

- Use the `/toc` slash command or the TOC button on the toolbar.
- A Markdown link list is generated from all headings (H1–H6) in the document.

### Images

Insert images and import Markdown files by various methods.

- Insert an image by specifying a URL via the toolbar button.
- Drag and drop image files directly into the editor.
- Paste images from the clipboard (Ctrl+V / Cmd+V).
- Drag and drop a .md file into the editor to import its content.

## Slash Commands

Type `/` in the editor to open the slash command menu for quick insertion.

| Command | Description |
| ------- | ----------- |
| `/h1`, `/h2`, `/h3` | Insert a heading. |
| `/bulletList` | Insert a bullet list. |
| `/orderedList` | Insert a numbered list. |
| `/taskList` | Insert a task list (checkboxes). |
| `/blockquote` | Insert a blockquote. |
| `/codeBlock` | Insert a code block. |
| `/table` | Insert a 3×3 table. |
| `/horizontalRule` | Insert a horizontal rule. |
| `/mermaid` | Insert a Mermaid diagram. |
| `/plantuml` | Insert a PlantUML diagram. |
| `/math` | Insert a math equation block (KaTeX). |
| `/html` | Insert an HTML preview block. |
| `/toc` | Generate a table of contents from headings. |
| `/date` | Insert today's date (YYYY-MM-DD). |
| `/footnote` | Insert a footnote reference. |
| `/note` | Insert a note admonition. |
| `/tip` | Insert a tip admonition. |
| `/important` | Insert an important admonition. |
| `/warning` | Insert a warning admonition. |
| `/caution` | Insert a caution admonition. |
| `/comment` | Add a comment to the selected text. |

## Search & Replace

Find and replace text within the editor.

![Search & Replace](/help/search-replace.png)

- Open the search bar from the toolbar or with the keyboard shortcut (Ctrl+F).
- Open the replace bar with Ctrl+H.

| Icon | Option | Description |
| :--: | ------ | ----------- |
| ![Match Case](/help/icons/match-case.png) | Match Case | Search with case sensitivity. |
| ![Match Word](/help/icons/match-word.png) | Match Whole Word | Search for exact word matches only. |
| ![Regex](/help/icons/regex.png) | Regular Expression | Search using a regex pattern. |

- Search also works within fullscreen code editor and table views.

## Compare & Merge

Compare and merge two documents side by side.

- Switch between Normal Mode and Compare Mode using the toggle button group on the right side of the toolbar.
- In Compare Mode, the editor splits into two panes with differences highlighted.
- The secondary (right) pane accepts direct text input or Markdown file upload.
- You can merge differences from one side to the other.

## Outline

View the document structure and navigate between sections.

![Outline Panel](/help/outline.png)

| Icon | Action | Description |
| :--: | ------ | ----------- |
| ![Outline](/help/icons/outline.png) | Outline Toggle | Toggle the outline panel visibility from the toolbar. |

- Click a heading in the outline to jump to that position in the editor.
- Fold/unfold sections to collapse or expand content under headings.
- Reorder sections by drag-and-drop or up/down move buttons.
- Drag the panel border to resize the outline panel width.

## Comments

Add comments and annotations to the document.

- Select text and press Ctrl+Shift+M or use the `/comment` slash command to add a comment.
- Comments on selected text are highlighted with a yellow background.
- Point comments (without text selection) insert a marker at the cursor position.
- Open the comment panel from the toolbar to view, resolve, and manage comments.
- Filter comments by status: All, Unresolved, or Resolved.

## Editor Settings

Customize the editor appearance and behavior.

![Editor Settings](/help/settings.png)

- Adjustable settings: Line Height, Font Size, Table Width, Editor Min Width, Editor Background Color.
- Section numbers: Toggle the "Section numbers" switch to auto-number headings (e.g. 1, 1.1, 1.1.1).

### Encoding & Line Ending

Change the file encoding or line ending format from the status bar at the bottom of the editor.

- Click the encoding label (e.g. "UTF-8") in the status bar to choose from UTF-8 / Shift_JIS / EUC-JP. A confirmation dialog is shown before converting.
- Click the line ending label ("LF" or "CRLF") in the status bar to toggle between LF and CRLF.
