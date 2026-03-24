/**
 * MergeEditorsContext のユニットテスト
 *
 * モジュールレベルのストアとコードブロック検索関数を検証する。
 */

import {
  setMergeEditors,
  getMergeEditors,
  findCounterpartCode,
  getCodeBlockIndex,
  findCodeBlockByIndex,
  findCounterpartCodePos,
} from "../contexts/MergeEditorsContext";

function createMockEditor(blocks: { language: string; text: string }[]) {
  return {
    state: {
      doc: {
        descendants: (callback: (node: unknown, pos: number) => void) => {
          let pos = 0;
          for (const block of blocks) {
            callback(
              {
                type: { name: "codeBlock" },
                attrs: { language: block.language },
                textContent: block.text,
                content: { size: block.text.length },
              },
              pos,
            );
            pos += block.text.length + 10;
          }
        },
      },
    },
    schema: {},
  } as never;
}

describe("MergeEditorsContext store", () => {
  afterEach(() => {
    setMergeEditors(null);
  });

  it("setMergeEditors / getMergeEditors", () => {
    expect(getMergeEditors()).toBeNull();

    const value = { rightEditor: null, leftEditor: null };
    setMergeEditors(value);
    expect(getMergeEditors()).toBe(value);

    setMergeEditors(null);
    expect(getMergeEditors()).toBeNull();
  });
});

describe("getCodeBlockIndex", () => {
  it("指定言語・コードのインデックスを返す", () => {
    const editor = createMockEditor([
      { language: "mermaid", text: "graph TD" },
      { language: "javascript", text: "const x = 1" },
      { language: "mermaid", text: "graph LR" },
    ]);

    expect(getCodeBlockIndex(editor, "mermaid", "graph TD")).toBe(0);
    expect(getCodeBlockIndex(editor, "mermaid", "graph LR")).toBe(1);
    expect(getCodeBlockIndex(editor, "javascript", "const x = 1")).toBe(0);
  });

  it("見つからない場合は -1 を返す", () => {
    const editor = createMockEditor([
      { language: "mermaid", text: "graph TD" },
    ]);

    expect(getCodeBlockIndex(editor, "mermaid", "not found")).toBe(-1);
    expect(getCodeBlockIndex(editor, "plantuml", "graph TD")).toBe(-1);
  });
});

describe("findCodeBlockByIndex", () => {
  it("インデックスで指定したブロックの位置とサイズを返す", () => {
    const editor = createMockEditor([
      { language: "mermaid", text: "graph TD" },
      { language: "mermaid", text: "graph LR" },
    ]);

    const result = findCodeBlockByIndex(editor, "mermaid", 0);
    expect(result).toEqual({ pos: 0, size: 8 }); // "graph TD".length

    const result2 = findCodeBlockByIndex(editor, "mermaid", 1);
    expect(result2).not.toBeNull();
    expect(result2!.size).toBe(8); // "graph LR".length
  });

  it("インデックスが範囲外の場合は null を返す", () => {
    const editor = createMockEditor([
      { language: "mermaid", text: "graph TD" },
    ]);

    expect(findCodeBlockByIndex(editor, "mermaid", 5)).toBeNull();
  });
});

describe("findCounterpartCode", () => {
  it("対応するコードブロックのコードを返す", () => {
    const thisEditor = createMockEditor([
      { language: "mermaid", text: "graph TD" },
      { language: "mermaid", text: "graph LR" },
    ]);
    const otherEditor = createMockEditor([
      { language: "mermaid", text: "graph TD; A-->B" },
      { language: "mermaid", text: "graph LR; C-->D" },
    ]);

    expect(findCounterpartCode(thisEditor, otherEditor, "mermaid", "graph TD")).toBe("graph TD; A-->B");
    expect(findCounterpartCode(thisEditor, otherEditor, "mermaid", "graph LR")).toBe("graph LR; C-->D");
  });

  it("otherEditor が null の場合は null を返す", () => {
    const thisEditor = createMockEditor([{ language: "mermaid", text: "graph TD" }]);
    expect(findCounterpartCode(thisEditor, null, "mermaid", "graph TD")).toBeNull();
  });

  it("thisCode が見つからない場合は null を返す", () => {
    const thisEditor = createMockEditor([{ language: "mermaid", text: "graph TD" }]);
    const otherEditor = createMockEditor([{ language: "mermaid", text: "other" }]);
    expect(findCounterpartCode(thisEditor, otherEditor, "mermaid", "not found")).toBeNull();
  });
});

describe("findCounterpartCodePos", () => {
  it("対応するブロックの位置とサイズを返す", () => {
    const thisEditor = createMockEditor([{ language: "mermaid", text: "graph TD" }]);
    const otherEditor = createMockEditor([{ language: "mermaid", text: "other code" }]);

    const result = findCounterpartCodePos(thisEditor, otherEditor, "mermaid", "graph TD");
    expect(result).not.toBeNull();
    expect(result!.pos).toBe(0);
  });

  it("otherEditor が null の場合は null を返す", () => {
    const thisEditor = createMockEditor([{ language: "mermaid", text: "graph TD" }]);
    expect(findCounterpartCodePos(thisEditor, null, "mermaid", "graph TD")).toBeNull();
  });
});
