import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import Text from "@tiptap/extension-text";
import type { Node as PMNode } from "@tiptap/pm/model";

import { createTiptapSheetAdapter } from "../spreadsheet/TiptapSheetAdapter";

function makeEditor(initialHtml?: string): Editor {
  return new Editor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content:
      initialHtml ??
      "<table><tr><th>h1</th><th>h2</th></tr><tr><td>a</td><td>b</td></tr></table>",
  });
}

/** 最初の table ノードの位置を返す */
function findTablePos(editor: Editor): number {
  let pos = -1;
  editor.state.doc.descendants((node, p) => {
    if (pos >= 0) return false;
    if (node.type.name === "table") {
      pos = p;
      return false;
    }
  });
  return pos;
}

function getTable(editor: Editor): { node: PMNode; pos: number } | null {
  const pos = findTablePos(editor);
  if (pos < 0) return null;
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "table") return null;
  return { node, pos };
}

describe("TiptapSheetAdapter", () => {
  it("getSnapshot が tiptap table からスナップショットを取得する", () => {
    const editor = makeEditor();
    const adapter = createTiptapSheetAdapter(editor, () => getTable(editor));
    const snap = adapter.getSnapshot();
    expect(snap.range).toEqual({ rows: 2, cols: 2 });
    expect(snap.cells[0]).toEqual(["h1", "h2"]);
    expect(snap.cells[1]).toEqual(["a", "b"]);
    editor.destroy();
  });

  it("setCell で tiptap ドキュメントが更新される", () => {
    const editor = makeEditor();
    const adapter = createTiptapSheetAdapter(editor, () => getTable(editor));
    adapter.setCell(1, 0, "updated");
    const snap = adapter.getSnapshot();
    expect(snap.cells[1][0]).toBe("updated");
    editor.destroy();
  });

  it("replaceAll で表構造が再構築される", () => {
    const editor = makeEditor();
    const adapter = createTiptapSheetAdapter(editor, () => getTable(editor));
    adapter.replaceAll({
      cells: [
        ["H1", "H2", "H3"],
        ["1", "2", "3"],
        ["4", "5", "6"],
      ],
      alignments: [
        [null, null, null],
        [null, null, null],
        [null, null, null],
      ],
      range: { rows: 3, cols: 3 },
    });
    const snap = adapter.getSnapshot();
    expect(snap.range).toEqual({ rows: 3, cols: 3 });
    expect(snap.cells[2]).toEqual(["4", "5", "6"]);
    editor.destroy();
  });

  it("subscribe が table 変更で通知する", () => {
    const editor = makeEditor();
    const adapter = createTiptapSheetAdapter(editor, () => getTable(editor));
    const calls: number[] = [];
    const unsubscribe = adapter.subscribe(() => {
      calls.push(calls.length);
    });
    adapter.setCell(0, 0, "changed");
    expect(calls.length).toBeGreaterThanOrEqual(1);
    unsubscribe();
    editor.destroy();
  });

  it("readOnly: true のとき setCell / replaceAll は no-op", () => {
    const editor = makeEditor();
    const adapter = createTiptapSheetAdapter(editor, () => getTable(editor), {
      readOnly: true,
    });
    const before = adapter.getSnapshot();
    adapter.setCell(0, 0, "SHOULD_NOT_APPLY");
    adapter.replaceAll({
      cells: [["X"]],
      alignments: [[null]],
      range: { rows: 1, cols: 1 },
    });
    const after = adapter.getSnapshot();
    expect(after).toEqual(before);
    editor.destroy();
  });

  it("readOnly プロパティが初期化オプションと一致する", () => {
    const editor = makeEditor();
    const ro = createTiptapSheetAdapter(editor, () => getTable(editor), {
      readOnly: true,
    });
    const rw = createTiptapSheetAdapter(editor, () => getTable(editor));
    expect(ro.readOnly).toBe(true);
    expect(rw.readOnly).toBe(false);
    editor.destroy();
  });

  it("getSnapshot は変更がない限り同じ参照を返す（useSyncExternalStore 要件）", () => {
    const editor = makeEditor();
    const adapter = createTiptapSheetAdapter(editor, () => getTable(editor));
    const a = adapter.getSnapshot();
    const b = adapter.getSnapshot();
    // Object.is で比較される useSyncExternalStore のため、同じ参照でなければ無限ループになる
    expect(Object.is(a, b)).toBe(true);
    editor.destroy();
  });

  it("setCell 後は新しい参照を返し、以降は再び安定する", () => {
    const editor = makeEditor();
    const adapter = createTiptapSheetAdapter(editor, () => getTable(editor));
    const a = adapter.getSnapshot();
    adapter.setCell(1, 0, "changed");
    const b = adapter.getSnapshot();
    const c = adapter.getSnapshot();
    expect(Object.is(a, b)).toBe(false);
    expect(Object.is(b, c)).toBe(true);
    editor.destroy();
  });

  it("複数の subscribe listener が独立して通知される", () => {
    const editor = makeEditor();
    const adapter = createTiptapSheetAdapter(editor, () => getTable(editor));
    const calls1: number[] = [];
    const calls2: number[] = [];
    const unsub1 = adapter.subscribe(() => { calls1.push(1); });
    const unsub2 = adapter.subscribe(() => { calls2.push(1); });
    adapter.setCell(0, 0, "x");
    expect(calls1.length).toBeGreaterThanOrEqual(1);
    expect(calls2.length).toBeGreaterThanOrEqual(1);
    unsub1();
    unsub2();
    editor.destroy();
  });
});
