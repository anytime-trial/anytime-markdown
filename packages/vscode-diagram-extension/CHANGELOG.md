# Change Log

## [0.3.0] - 2026-09-22

### Added

- The viewer registers a Custom Element, `<anytime-diagram-viewer>`, so a host outside this monorepo can embed a diagram from plain HTML. Registration lives only in `element.ts`; `index.ts` still exports the class and types without side effects, because the four existing consumers use the mount API and must not have `customElements.define` run on import.
- The element supplies its own theme. `DIAGRAM_STYLES` reads host tokens (`--am-color-*` → `--vscode-*`), and on a bare HTML host neither is present, so `theme="dark"` used to leave the diagram light. The element now applies seven tokens to itself for the mode it is given.
- `elementAnnex`: a host can attach its own list of items to an element, and the viewer does not interpret the item ids. `onSelect` exposes the existing internal node-selection callback, so a host can react to what the reader picked without reaching inside the canvas.
- A distributable bundle (ESM 251KB / IIFE 260KB) built with esbuild, plus `scripts/export-viewer-dist/build-diagram-viewer.sh` to write it out. The build verifies registration in its own output: `customElements.define` failing still produces a successful esbuild run, and a bundle that loads and does nothing is indistinguishable from a working one.

### Fixed

- Opening an annex group no longer fires `element-select`. A card's click handler forwards everything that is not a button/input/select, and only the item buttons stopped propagation, so expanding the `<summary>` also told the host the element had been picked.
- Changing one attribute no longer silently reverts `editable` / `compact` supplied through `options`. `mount` gave options priority over attributes but `liveUpdate` read attributes only, so a host that enabled editing through options lost it by changing `locale`.
- Theme tokens are no longer written inline, which always overrode a host's own `--am-color-*`. The element's keys moved to `--diagram-host-*` and the lookup chain is now `--am-color-*` → `--vscode-*` → `--diagram-host-*` → ink-wash default, matching what the spec and the code comments already claimed.
- `value` now rejects JSON that parses but is not a document. `null`, `0` and `"図"` all parsed, set `document = null` and tore the viewer down to a blank frame with nothing logged — "keep the current diagram on failure" only held for syntax errors.
- There is now a path that fires `onSelect(null)`. Clearing a selection, replacing the document, or removing the last selected element told the host nothing, so a host that had panned to the selected element could not return.
- Rebuilding the viewer emits `draft-change`. `destroy` skipped the callback, leaving a host's "unsaved" marker set with no draft behind it.

## [0.2.0] - 2026-09-22

### Added

- Connectors between two elements that line up vertically (or horizontally) now bow clockwise instead of collapsing onto the axis, so picking "curve" visibly changes the line. The bow applies only to connectors with an arrow on one end, because without a direction a reader cannot tell clockwise from counter-clockwise and the line just looks like a detour. Depth is 0.3x the distance between the endpoints, floored at 0.25x and capped at 0.5x the card's cross-axis size.
- The viewer gained an `alwaysEditing` mode (default off, so this extension and web-app look unchanged): it opens in editing state, hides the view/edit toggle and the in-canvas save button, and exposes `handle.save()` so a host can trigger a save from its own chrome.

### Changed

- The toolbar row now floats inside the canvas frame at the top left, and the minimap moved to the top right.
- The genealogy edit dialog opens already in editing state with a single "Apply" action in the header, instead of starting read-only behind a pencil toggle with two competing save buttons.

### Fixed

- Diagrams containing a hand-drawn connector can now be saved from the `*.diagram.json` custom editor. The webview sent screen-shaped anchors (`{ kind: 'element' }` pairs) straight into `validateDiagramDocument`, which reads the file shape, so any diagram with one manual connector was always rejected, and the rejection only came back as `saveFailed` to the webview without reaching the extension log or the file. The boundary is now the serialized file text: the webview sends a string, the extension parses it and validates as before.
- The same rejection in the markdown genealogy fence was fixed at its root: the serialize-and-reread step is now held in one place in `diagram-core` (`validateDiagramDraft`), which the fence, `mcp-diagram` and web-app all go through.
- A bowed connector is no longer clipped at the edge of the canvas. Without a cap on the bow depth, control points on the top row or leftmost column wrapped into negative coordinates and the outer `<svg>` `overflow: hidden` cut off the belly of the curve.
- The midpoint of a bowed connector now sits on the line. It is the drag handle, the label anchor and the attachment point for other connectors, so leaving it at the middle of the chord left it floating at least 36px away with other lines growing out of thin air.
- Saving is now gated inside `save()` rather than only on the in-canvas button's `disabled`. Under `alwaysEditing` that button is hidden, so there was no gate at all and a double click let the second save slip past the in-flight guard, silently reverting cards moved during the save.
- After a save the baseline is the validated document the host actually wrote, not the pre-validation draft, so an applied diagram no longer falls back to "unsaved".
- The `+` / `-` controls hidden behind a card are moved beside the card instead of being removed, cards inside the frame no longer forward gap clicks to the canvas, and the gap band no longer steals presses from connectors so a connector can be selected.
- The minimap no longer grows tall on a wide diagram.

## [0.1.0] - 2026-09-21

- First release. Custom editor for `*.diagram.json`, automatic genealogy layout, grid-snapped manual
  placement, multi-select moves, row/column insertion and removal, card resizing, a workspace-wide
  diagram list, and the bundled `mcp-diagram` MCP server.
- Ported from the genealogy editor in the anytime-travel project; the React implementation was
  rewritten as vanilla DOM to match the other Anytime viewers.
