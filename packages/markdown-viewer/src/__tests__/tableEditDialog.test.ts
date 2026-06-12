/**
 * components-vanilla/TableEditDialog（表の全画面スプレッドシート編集）のリグレッションテスト。
 *
 * G4 で React TableDialogHost が削除されテーブルの編集ボタンが no-op になった回帰
 * （2026-06-11 報告）の再発防止。vanilla 化された spreadsheet-viewer の
 * mountSpreadsheetGrid + 復元した TiptapSheetAdapter で全画面編集が成立することを検証する。
 */

import { createSpreadsheetT } from "@anytime-markdown/spreadsheet-viewer";

import { openTableEditDialog } from "../components-vanilla/TableEditDialog";
import { createTiptapSheetAdapter } from "../spreadsheet/TiptapSheetAdapter";
import { createTestEditor } from "../testUtils/createTestEditor";

const t = (key: string): string => key;
const svT = createSpreadsheetT("Spreadsheet", "en");

const TABLE_HTML = `<table>
  <tr><th>h1</th><th>h2</th></tr>
  <tr><td>a</td><td>b</td></tr>
</table>`;

function makeTableEditor() {
  return createTestEditor({ content: TABLE_HTML, withTable: true });
}

function findTablePos(editor: ReturnType<typeof createTestEditor>): number {
  let pos = -1;
  editor.state.doc.descendants((node, p) => {
    if (pos < 0 && node.type.name === "table") pos = p;
    return pos < 0;
  });
  return pos;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TiptapSheetAdapter", () => {
  it("table ノードからスナップショットを抽出し replaceAll で書き戻せる", () => {
    const editor = makeTableEditor();
    const pos = findTablePos(editor);
    expect(pos).toBeGreaterThanOrEqual(0);

    const adapter = createTiptapSheetAdapter(editor, () => {
      const node = editor.state.doc.nodeAt(pos);
      return node?.type.name === "table" ? { node, pos } : null;
    });

    const snap = adapter.getSnapshot();
    expect(snap.range).toEqual({ rows: 2, cols: 2 });
    expect(snap.cells).toEqual([
      ["h1", "h2"],
      ["a", "b"],
    ]);

    adapter.replaceAll({
      cells: [
        ["h1", "h2"],
        ["EDITED", "b"],
      ],
      alignments: [
        [null, null],
        [null, null],
      ],
      range: { rows: 2, cols: 2 },
    });
    expect(adapter.getSnapshot().cells[1][0]).toBe("EDITED");
    editor.destroy();
  });
});

describe("openTableEditDialog", () => {
  it("全画面ダイアログ + スプレッドシートグリッドを開き、閉じると onClosed が呼ばれる", () => {
    const editor = makeTableEditor();
    const pos = findTablePos(editor);
    const onClosed = jest.fn();

    const handle = openTableEditDialog({ editor, pos, isDark: false, t, locale: "en", onClosed });

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("tableLabel");
    // spreadsheet grid（canvas + 適用ボタン）が中に mount されている
    expect(dialog.querySelector(".sv-root")).toBeTruthy();
    expect(dialog.querySelector("canvas")).toBeTruthy();
    const applyBtn = [...dialog.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(svT("spreadsheetApply")),
    );
    expect(applyBtn).toBeTruthy();

    handle.destroy();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(onClosed).toHaveBeenCalledTimes(1);
    editor.destroy();
  });

  it("適用でグリッド内容が editor の table へ反映されダイアログが閉じる", () => {
    const editor = makeTableEditor();
    const pos = findTablePos(editor);
    const onClosed = jest.fn();
    openTableEditDialog({ editor, pos, isDark: false, t, locale: "en", onClosed });

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const applyBtn = [...dialog.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(svT("spreadsheetApply")),
    ) as HTMLButtonElement;
    applyBtn.click();

    // dirty なしの適用 → そのまま閉じる
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    // 表の内容は維持される（無変更適用）
    let tableText = "";
    editor.state.doc.descendants((node) => {
      if (node.type.name === "table") tableText = node.textContent;
      return !tableText;
    });
    expect(tableText).toContain("h1");
    editor.destroy();
  });
});
