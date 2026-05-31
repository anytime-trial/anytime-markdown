import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Extension } from "@tiptap/core";
import {
  tableCellModePlugin,
  tableCellModePluginKey,
  setNavigationMode,
  setEditingMode,
  exitTableMode,
} from "../../plugins/tableCellMode/tableCellModePlugin";
import { INITIAL_STATE } from "../../plugins/tableCellMode/tableCellModeTypes";
import type { TableCellModeState } from "../../plugins/tableCellMode/tableCellModeTypes";
import {
  CELL_NAV_SELECTED,
  CELL_EDITING,
} from "../../plugins/tableCellMode/tableCellModeStyles";

const TABLE_HTML = `
<table>
  <tr><th>A</th><th>B</th></tr>
  <tr><td>1</td><td>2</td></tr>
</table>
`;

const TableCellModeExtension = Extension.create({
  name: "tableCellModeExt",
  addProseMirrorPlugins() {
    return [tableCellModePlugin()];
  },
});

function createEditorWithPlugin(content: string): Editor {
  return new Editor({
    extensions: [StarterKit, TableKit, TableCellModeExtension],
    content,
  });
}

function getPluginState(editor: Editor): TableCellModeState {
  return tableCellModePluginKey.getState(editor.state) as TableCellModeState;
}

/** テーブルセル（td/th）の位置を収集する */
function findCellPositions(editor: Editor): number[] {
  const positions: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      positions.push(pos);
    }
  });
  return positions;
}

describe("tableCellModePlugin", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = createEditorWithPlugin(TABLE_HTML);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("初期状態は navigation モードで位置は null", () => {
    const state = getPluginState(editor);
    expect(state).toEqual(INITIAL_STATE);
    expect(state.mode).toBe("navigation");
    expect(state.selectedCellPos).toBeNull();
    expect(state.editingCellPos).toBeNull();
  });

  it("setNavigationMode でセル位置が設定される", () => {
    const cellPositions = findCellPositions(editor);
    expect(cellPositions.length).toBeGreaterThan(0);
    const cellPos = cellPositions[0];

    const { tr } = editor.state;
    const newTr = setNavigationMode(tr, cellPos);
    editor.view.dispatch(newTr);

    const state = getPluginState(editor);
    expect(state.mode).toBe("navigation");
    expect(state.selectedCellPos).toBe(cellPos);
    expect(state.editingCellPos).toBeNull();
  });

  it("setEditingMode で editing モードに遷移する", () => {
    const cellPositions = findCellPositions(editor);
    const cellPos = cellPositions[0];

    const { tr } = editor.state;
    const newTr = setEditingMode(tr, cellPos);
    editor.view.dispatch(newTr);

    const state = getPluginState(editor);
    expect(state.mode).toBe("editing");
    expect(state.editingCellPos).toBe(cellPos);
    expect(state.selectedCellPos).toBeNull();
  });

  it("exitTableMode で初期状態にリセットされる", () => {
    // まず editing モードに設定
    const cellPositions = findCellPositions(editor);
    const cellPos = cellPositions[0];

    let { tr } = editor.state;
    editor.view.dispatch(setEditingMode(tr, cellPos));

    // リセット
    tr = editor.state.tr;
    editor.view.dispatch(exitTableMode(tr));

    const state = getPluginState(editor);
    expect(state).toEqual(INITIAL_STATE);
  });

  it("navigation モードで selectedCellPos に Decoration が付与される", () => {
    const cellPositions = findCellPositions(editor);
    const cellPos = cellPositions[0];

    const { tr } = editor.state;
    editor.view.dispatch(setNavigationMode(tr, cellPos));

    // DOM 上で CSS クラスが付与されていることを確認
    const cellElements = editor.view.dom.querySelectorAll(
      `.${CELL_NAV_SELECTED}`,
    );
    expect(cellElements.length).toBe(1);
  });

  it("editing モードで editingCellPos に Decoration が付与される", () => {
    const cellPositions = findCellPositions(editor);
    const cellPos = cellPositions[0];

    const { tr } = editor.state;
    editor.view.dispatch(setEditingMode(tr, cellPos));

    const cellElements = editor.view.dom.querySelectorAll(`.${CELL_EDITING}`);
    expect(cellElements.length).toBe(1);
  });

  it("モード切替で前の Decoration が除去される", () => {
    const cellPositions = findCellPositions(editor);
    const cellPos0 = cellPositions[0];
    const cellPos1 = cellPositions[1];

    // navigation で cellPos0 を選択
    let { tr } = editor.state;
    editor.view.dispatch(setNavigationMode(tr, cellPos0));
    expect(
      editor.view.dom.querySelectorAll(`.${CELL_NAV_SELECTED}`).length,
    ).toBe(1);

    // 別のセルに navigation 切替
    tr = editor.state.tr;
    editor.view.dispatch(setNavigationMode(tr, cellPos1));
    expect(
      editor.view.dom.querySelectorAll(`.${CELL_NAV_SELECTED}`).length,
    ).toBe(1);

    // editing に切替 → nav_selected は消える
    tr = editor.state.tr;
    editor.view.dispatch(setEditingMode(tr, cellPos1));
    expect(
      editor.view.dom.querySelectorAll(`.${CELL_NAV_SELECTED}`).length,
    ).toBe(0);
    expect(
      editor.view.dom.querySelectorAll(`.${CELL_EDITING}`).length,
    ).toBe(1);

    // exitTableMode → 全 Decoration 消える
    tr = editor.state.tr;
    editor.view.dispatch(exitTableMode(tr));
    expect(
      editor.view.dom.querySelectorAll(`.${CELL_NAV_SELECTED}`).length,
    ).toBe(0);
    expect(
      editor.view.dom.querySelectorAll(`.${CELL_EDITING}`).length,
    ).toBe(0);
  });
});
