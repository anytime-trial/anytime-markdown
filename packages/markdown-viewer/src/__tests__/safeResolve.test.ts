/**
 * safeResolve / safeNodeAt のユニットテスト。
 *
 * doc.resolve(pos) / doc.nodeAt(pos) が範囲外 pos で throw する挙動を握りつぶしつつ、
 * コンテキスト（タグ・pos）を warn ログへ残すことを検証する（silent catch 禁止規約対応）。
 */
import { Editor } from "@anytime-markdown/markdown-core";
import StarterKit from "@anytime-markdown/markdown-starter-kit";

import { resetSafeResolveWarnState, safeNodeAt, safeResolve } from "../utils/safeResolve";

function createEditor(md = "Hello world"): Editor {
  return new Editor({ extensions: [StarterKit], content: md });
}

describe("safeResolve / safeNodeAt", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    resetSafeResolveWarnState();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe("safeResolve", () => {
    it("正常な pos は ResolvedPos を返し warn しない", () => {
      const editor = createEditor();
      const $pos = safeResolve(editor.state.doc, 1, "test:resolve-normal");
      expect($pos).not.toBeNull();
      expect($pos?.pos).toBe(1);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("範囲外 pos は null を返し、タグと pos を含めて warn する", () => {
      const editor = createEditor();
      const outOfRange = editor.state.doc.content.size + 1000;
      const result = safeResolve(editor.state.doc, outOfRange, "test:resolve-oor");
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [message, error] = warnSpy.mock.calls[0];
      expect(message).toContain("test:resolve-oor");
      expect(message).toContain(String(outOfRange));
      expect(error).toBeInstanceOf(Error);
    });

    it("同一タグの2回目以降は warn を抑制する（ログスパム防止）", () => {
      const editor = createEditor();
      const outOfRange = editor.state.doc.content.size + 1000;
      safeResolve(editor.state.doc, outOfRange, "test:resolve-repeat");
      safeResolve(editor.state.doc, outOfRange, "test:resolve-repeat");
      safeResolve(editor.state.doc, outOfRange, "test:resolve-repeat");
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("異なるタグはそれぞれ独立して warn される", () => {
      const editor = createEditor();
      const outOfRange = editor.state.doc.content.size + 1000;
      safeResolve(editor.state.doc, outOfRange, "test:resolve-tagA");
      safeResolve(editor.state.doc, outOfRange, "test:resolve-tagB");
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("safeNodeAt", () => {
    it("正常な pos はノードを返し warn しない", () => {
      const editor = createEditor();
      const node = safeNodeAt(editor.state.doc, 0, "test:nodeAt-normal");
      expect(warnSpy).not.toHaveBeenCalled();
      expect(node).not.toBeNull();
    });

    it("範囲外 pos は null を返し、タグと pos を含めて warn する", () => {
      const editor = createEditor();
      const outOfRange = editor.state.doc.content.size + 1000;
      const result = safeNodeAt(editor.state.doc, outOfRange, "test:nodeAt-oor");
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [message] = warnSpy.mock.calls[0];
      expect(message).toContain("test:nodeAt-oor");
      expect(message).toContain(String(outOfRange));
    });

    it("同一タグの2回目以降は warn を抑制する", () => {
      const editor = createEditor();
      const outOfRange = editor.state.doc.content.size + 1000;
      safeNodeAt(editor.state.doc, outOfRange, "test:nodeAt-repeat");
      safeNodeAt(editor.state.doc, outOfRange, "test:nodeAt-repeat");
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });
});
