/**
 * MergeEditorsContext - 追加カバレッジテスト
 *
 * findCounterpartTableHtml の各ブランチを検証する。
 */

const mockSerializeNode = jest.fn(() => document.createElement("div"));
const mockFromSchema = jest.fn(() => ({
  serializeNode: mockSerializeNode,
}));

jest.mock("prosemirror-model", () => ({
  DOMSerializer: {
    fromSchema: mockFromSchema,
  },
}));

jest.mock("@tiptap/pm/model", () => ({
  DOMSerializer: {
    fromSchema: mockFromSchema,
  },
}));

import {
  findCounterpartTableHtml,
  findCounterpartCode,
  findCounterpartCodePos,
  getCodeBlockIndex,
  findCodeBlockByIndex,
} from "../contexts/MergeEditorsContext";

function createMockEditorWithNodes(
  nodes: { type: string; attrs?: Record<string, unknown>; text?: string; nodeSize?: number; pos?: number }[],
) {
  return {
    state: {
      doc: {
        descendants: (callback: (node: unknown, pos: number) => void) => {
          let pos = 0;
          for (const n of nodes) {
            const nodeObj: any = {
              type: { name: n.type },
              attrs: n.attrs ?? {},
              textContent: n.text ?? "",
              content: { size: n.text?.length ?? 0 },
              nodeSize: n.nodeSize ?? (n.text?.length ?? 0) + 2,
            };
            callback(nodeObj, n.pos ?? pos);
            pos += nodeObj.nodeSize;
          }
        },
      },
    },
    schema: {
      nodes: {},
    },
  } as never;
}

describe("findCounterpartTableHtml", () => {
  it("otherEditor が null の場合は null を返す", () => {
    const thisEditor = createMockEditorWithNodes([
      { type: "table", pos: 0 },
    ]);
    expect(findCounterpartTableHtml(thisEditor, null, 0)).toBeNull();
  });

  it("thisPos に table がない場合は null を返す", () => {
    const thisEditor = createMockEditorWithNodes([
      { type: "paragraph", pos: 0 },
    ]);
    const otherEditor = createMockEditorWithNodes([
      { type: "table", pos: 0 },
    ]);
    expect(findCounterpartTableHtml(thisEditor, otherEditor, 0)).toBeNull();
  });

  it("thisPos にマッチするテーブルのインデックスが other に存在しない場合は null を返す", () => {
    const thisEditor = createMockEditorWithNodes([
      { type: "table", pos: 0 },
      { type: "table", pos: 10 },
    ]);
    const otherEditor = createMockEditorWithNodes([
      { type: "table", pos: 0 },
    ]);
    // thisPos=10 is the second table (index=1), but other only has 1 table
    expect(findCounterpartTableHtml(thisEditor, otherEditor, 10)).toBeNull();
  });

  it("対応するテーブルの HTML を返す", () => {
    const tableNode = document.createElement("table");
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.textContent = "Cell";
    td.setAttribute("style", "width: 100px");
    td.setAttribute("width", "100");
    tr.appendChild(td);
    tableNode.appendChild(tr);

    mockFromSchema.mockReturnValueOnce({
      serializeNode: jest.fn().mockReturnValue(tableNode.cloneNode(true)),
    });

    const thisEditor = createMockEditorWithNodes([
      { type: "table", pos: 0 },
    ]);
    const otherEditor = createMockEditorWithNodes([
      { type: "table", pos: 0 },
    ]);

    const result = findCounterpartTableHtml(thisEditor, otherEditor, 0);
    expect(result).not.toBeNull();
    expect(result).toContain("Cell");
    // style and width attributes should be removed
    expect(result).not.toContain("width: 100px");
  });
});

describe("findCounterpartCode - 追加ケース", () => {
  it("otherEditor に対応するインデックスがない場合は null を返す", () => {
    const thisEditor = createMockEditorWithNodes([
      { type: "codeBlock", attrs: { language: "mermaid" }, text: "graph TD" },
      { type: "codeBlock", attrs: { language: "mermaid" }, text: "graph LR" },
    ]);
    const otherEditor = createMockEditorWithNodes([
      { type: "codeBlock", attrs: { language: "mermaid" }, text: "other" },
    ]);
    // thisCode "graph LR" is at index 1, but other only has 1 block
    expect(findCounterpartCode(thisEditor, otherEditor, "mermaid", "graph LR")).toBeNull();
  });
});

describe("findCounterpartCodePos - 追加ケース", () => {
  it("thisCode が見つからない場合は null を返す", () => {
    const thisEditor = createMockEditorWithNodes([
      { type: "codeBlock", attrs: { language: "mermaid" }, text: "graph TD" },
    ]);
    const otherEditor = createMockEditorWithNodes([
      { type: "codeBlock", attrs: { language: "mermaid" }, text: "other" },
    ]);
    expect(findCounterpartCodePos(thisEditor, otherEditor, "mermaid", "not found")).toBeNull();
  });
});

describe("getCodeBlockIndex - 追加ケース", () => {
  it("複数の同一言語ブロックで最初のマッチのインデックスを返す", () => {
    const editor = createMockEditorWithNodes([
      { type: "codeBlock", attrs: { language: "js" }, text: "a" },
      { type: "codeBlock", attrs: { language: "js" }, text: "a" },
      { type: "codeBlock", attrs: { language: "js" }, text: "b" },
    ]);
    // Duplicate "a" - should return index 0 (first match)
    expect(getCodeBlockIndex(editor, "js", "a")).toBe(0);
  });
});

describe("findCodeBlockByIndex - 追加ケース", () => {
  it("異なる言語のブロックはカウントしない", () => {
    const editor = createMockEditorWithNodes([
      { type: "codeBlock", attrs: { language: "python" }, text: "pass" },
      { type: "codeBlock", attrs: { language: "js" }, text: "x" },
    ]);
    expect(findCodeBlockByIndex(editor, "js", 0)).not.toBeNull();
    expect(findCodeBlockByIndex(editor, "js", 1)).toBeNull();
  });
});
