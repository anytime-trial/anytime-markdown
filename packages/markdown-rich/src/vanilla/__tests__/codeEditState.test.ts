/**
 * createCodeEditState のユニットテスト
 */

jest.mock("@anytime-markdown/markdown-viewer", () => ({
  ...jest.requireActual("@anytime-markdown/markdown-viewer"),
  useTextareaSearch: () => ({ reset: jest.fn() }),
}));

import { createCodeEditState } from "../codeEditState";

function makeNode(text: string) {
  return { textContent: text, content: { size: text.length } } as unknown as import("@anytime-markdown/markdown-pm/model").Node;
}

function makeEditor() {
  const replaceWith = jest.fn();
  const del = jest.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = {
    schema: { text: (s: string) => ({ text: s }) },
    chain: () => ({
      command: (fn: (ctx: { tr: { replaceWith: typeof replaceWith; delete: typeof del } }) => boolean) => {
        fn({ tr: { replaceWith, delete: del } });
        return { run: jest.fn() };
      },
    }),
  } as unknown as import("@anytime-markdown/markdown-core").Editor;
  return { editor, replaceWith, del };
}

describe("createCodeEditState", () => {
  it("onOpen でノードのテキストを fsCode に設定する", () => {
    const { editor } = makeEditor();
    const node = makeNode("abc");
    const state = createCodeEditState({ editor, pos: 5, node, onClose: jest.fn() });
    state.onOpen();
    expect(state.getFsCode()).toBe("abc");
    expect(state.isFsDirty()).toBe(false);
  });

  it("onFsTextChange で fsCode が更新され dirty になる", () => {
    const { editor } = makeEditor();
    const node = makeNode("abc");
    const state = createCodeEditState({ editor, pos: 5, node, onClose: jest.fn() });
    state.onOpen();
    state.onFsTextChange("xyz");
    expect(state.getFsCode()).toBe("xyz");
    expect(state.isFsDirty()).toBe(true);
  });

  it("onFsTextChange で元のコードに戻したとき dirty が false になる", () => {
    const { editor } = makeEditor();
    const node = makeNode("abc");
    const state = createCodeEditState({ editor, pos: 5, node, onClose: jest.fn() });
    state.onOpen();
    state.onFsTextChange("xyz");
    state.onFsTextChange("abc");
    expect(state.isFsDirty()).toBe(false);
  });

  it("onApply で editor へ反映し onClose を呼ぶ", () => {
    const { editor, replaceWith } = makeEditor();
    const node = makeNode("abc");
    const onClose = jest.fn();
    const state = createCodeEditState({ editor, pos: 5, node, onClose });
    state.onOpen();
    state.onFsTextChange("xyz");
    state.onApply();
    expect(replaceWith).toHaveBeenCalledWith(6, 9, { text: "xyz" });
    expect(onClose).toHaveBeenCalledWith(false);
    expect(state.isFsDirty()).toBe(false);
  });

  it("dirty 時の tryCloseEdit は discardOpen を true にする", () => {
    const { editor } = makeEditor();
    const node = makeNode("abc");
    const onClose = jest.fn();
    const state = createCodeEditState({ editor, pos: 5, node, onClose });
    state.onOpen();
    state.onFsTextChange("xyz");
    state.tryCloseEdit();
    expect(state.isDiscardOpen()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("非 dirty の tryCloseEdit は即閉じる", () => {
    const { editor } = makeEditor();
    const node = makeNode("abc");
    const onClose = jest.fn();
    const state = createCodeEditState({ editor, pos: 5, node, onClose });
    state.onOpen();
    state.tryCloseEdit();
    expect(onClose).toHaveBeenCalledWith(false);
    expect(state.isDiscardOpen()).toBe(false);
  });

  it("handleDiscardConfirm で discardOpen が閉じられ onClose が呼ばれる", () => {
    const { editor } = makeEditor();
    const node = makeNode("abc");
    const onClose = jest.fn();
    const state = createCodeEditState({ editor, pos: 5, node, onClose });
    state.onOpen();
    state.onFsTextChange("xyz");
    state.tryCloseEdit();
    state.handleDiscardConfirm();
    expect(state.isDiscardOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("subscribe で状態変化を購読できる", () => {
    const { editor } = makeEditor();
    const node = makeNode("abc");
    const state = createCodeEditState({ editor, pos: 5, node, onClose: jest.fn() });
    state.onOpen();
    const fn = jest.fn();
    const unsub = state.subscribe(fn);
    state.onFsTextChange("xyz");
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
    state.onFsTextChange("qwerty");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("update で opts を差し替えできる", () => {
    const { editor } = makeEditor();
    const node = makeNode("abc");
    const state = createCodeEditState({ editor, pos: 5, node, onClose: jest.fn() });
    const newNode = makeNode("def");
    state.update({ node: newNode, pos: 10 });
    state.onOpen();
    expect(state.getFsCode()).toBe("def");
  });
});
