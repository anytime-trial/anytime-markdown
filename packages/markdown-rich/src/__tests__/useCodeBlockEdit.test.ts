/**
 * applyCodeBlockText の pure seam テスト。
 * 旧 React 経路の useCodeBlockEdit hook は G4 で削除済み。
 */

import { applyCodeBlockText } from "../components/codeblock/useCodeBlockEdit";

function mockEditor() {
  const replaceWith = jest.fn();
  const del = jest.fn();
  const editor = {
    schema: { text: (s: string) => ({ text: s }) },
    chain: () => ({
      command: (fn: (ctx: { tr: { replaceWith: typeof replaceWith; delete: typeof del } }) => boolean) => {
        fn({ tr: { replaceWith, delete: del } });
        return { run: jest.fn() };
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { editor, replaceWith, del };
}

describe("applyCodeBlockText", () => {
  it("非空は from..to を text へ replaceWith する", () => {
    const { editor, replaceWith } = mockEditor();
    applyCodeBlockText(editor, 5, 3, "xyz");
    // from = 6, to = 9
    expect(replaceWith).toHaveBeenCalledWith(6, 9, { text: "xyz" });
  });

  it("空文字は範囲削除する", () => {
    const { editor, del } = mockEditor();
    applyCodeBlockText(editor, 5, 3, "");
    expect(del).toHaveBeenCalledWith(6, 9);
  });
});
