# Anytime Diagram

A genealogy diagram editor for VS Code. Open a `*.diagram.json` file and the chart is drawn from the
families it declares; drag people onto the grid to adjust the layout and save it back into the same file.

## What it does

- **Automatic layout.** Generations become columns, derived from the parent/child links. You only
  record families; the people are derived from them.
- **Manual placement.** In edit mode, people snap to grid cells — only the shaded cells accept a
  person, so a card can never land on top of another one.
- **Multi-select.** Shift/Ctrl-click (or the ☐ handle) selects several people; they then move together
  by the same number of cells, or not at all if one of them cannot fit.
- **Rows and columns.** The ＋ icons along the top and left insert an empty column or row; a −
  appears on lines with nobody in them.
- **Box size.** Drag the right edge, bottom edge or corner of the top-left card to resize every card.
- **MCP server.** The bundled `mcp-diagram` server exposes `read_diagram`, `write_diagram` and
  `set_diagram_layout` so an agent can build and rearrange charts.

## File format

One file holds the whole chart: `title`, `lead`, `note`, `legend`, the group axes, the families, the
per-person annotations, and the layout overrides. Placements are stored as **grid cell numbers**, not
pixels, so changing the card size never knocks a hand-placed person off the grid.

```json
{
  "version": 1,
  "title": "Example",
  "lead": "",
  "note": "",
  "legend": "Solid lines are parentage.",
  "groups": [],
  "families": [
    { "parents": ["A", "B"], "children": ["C"], "kind": "birth", "groups": {} }
  ],
  "annotations": {},
  "layout": { "placements": { "C": { "column": 2, "row": 1 } } }
}
```

`kind` is one of `birth` (solid), `creation` (dotted) or `oath` (dashed). What each one means in your
chart is up to the `legend` sentence.

## Editing the people

The custom editor changes the **layout only**. Add or remove people and families by editing the JSON
in a text editor, or through the `write_diagram` MCP tool.

## License

MIT
