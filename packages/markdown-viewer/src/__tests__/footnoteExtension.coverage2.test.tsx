/**
 * footnoteExtension.tsx coverage2 tests
 * Focus: native ProseMirror NodeView rendering, InputRule direct handler, parseHTML
 */

import { FootnoteRef } from "../extensions/footnoteExtension";
import { Editor } from "@anytime-markdown/markdown-core";
import StarterKit from "@anytime-markdown/markdown-starter-kit";

/** addNodeView を呼び出して native NodeView を生成するヘルパー */
function makeFootnoteNodeView(editor: Editor, noteId: string) {
  const renderer = (FootnoteRef.config as any).addNodeView.call({
    name: "footnoteRef",
    options: {},
    storage: {},
    editor,
    type: editor.schema.nodes.footnoteRef,
    parent: null,
  });
  return renderer({ node: { attrs: { noteId } }, editor });
}


describe("FootnoteRef Extension coverage2", () => {
  // --- native NodeView rendering ---
  describe("native FootnoteRef NodeView", () => {
    it("renders a span with the footnote reference text and data attribute", () => {
      const editor = new Editor({
        extensions: [StarterKit, FootnoteRef],
        content: "",
      });

      const view = makeFootnoteNodeView(editor, "42");
      const dom = view.dom as HTMLElement;
      expect(dom).toBeInstanceOf(HTMLElement);
      expect(dom.textContent).toBe("[42]");
      expect(dom.getAttribute("data-footnote-ref")).toBe("42");

      view.destroy?.();
      editor.destroy();
    });

    it("reflects the new noteId on update()", () => {
      const editor = new Editor({
        extensions: [StarterKit, FootnoteRef],
        content: "",
      });

      const view = makeFootnoteNodeView(editor, "note1");
      const handled = view.update?.(
        { type: { name: "footnoteRef" }, attrs: { noteId: "note2" } } as any,
        [],
        null as any,
      );

      expect(handled).toBe(true);
      expect((view.dom as HTMLElement).textContent).toBe("[note2]");

      view.destroy?.();
      editor.destroy();
    });

    it("toggles the selection outline via selectNode / deselectNode", () => {
      const editor = new Editor({
        extensions: [StarterKit, FootnoteRef],
        content: "",
      });

      const view = makeFootnoteNodeView(editor, "x");
      const dom = view.dom as HTMLElement;

      view.selectNode?.();
      expect(dom.style.outline).toContain("var(--am-color-primary-main)");
      view.deselectNode?.();
      expect(dom.style.outline).toBe("");

      view.destroy?.();
      editor.destroy();
    });

    it("sets the tooltip title from the footnote definition and opens its url on click", () => {
      const editor = new Editor({
        extensions: [StarterKit, FootnoteRef],
        content: "<p>[^1]: see https://example.com here</p>",
      });

      const view = makeFootnoteNodeView(editor, "1");
      const dom = view.dom as HTMLElement;

      dom.dispatchEvent(new Event("pointerenter"));
      expect(dom.title).toContain("https://example.com");
      expect(dom.style.cursor).toBe("pointer");

      const openSpy = jest
        .spyOn(window, "open")
        .mockImplementation(() => null);
      dom.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(openSpy).toHaveBeenCalledWith(
        "https://example.com",
        "_blank",
        "noopener,noreferrer",
      );

      openSpy.mockRestore();
      view.destroy?.();
      editor.destroy();
    });
  });

  // --- Lines 88-91: InputRule handler ---
  describe("InputRule handler direct test", () => {
    it("creates footnoteRef node from input rule pattern", () => {
      const editor = new Editor({
        extensions: [StarterKit, FootnoteRef],
        content: "<p></p>",
      });

      // Get the input rules
      const inputRules = (FootnoteRef.config as any).addInputRules.call({
        name: "footnoteRef",
        options: {},
        storage: {},
        editor,
        type: editor.schema.nodes.footnoteRef,
        parent: null,
      });

      expect(inputRules).toHaveLength(1);

      // Test the regex pattern
      const rule = inputRules[0];
      const regex = rule.find;
      expect(regex.test("[^note1]")).toBe(true);
      expect(regex.test("[^123]")).toBe(true);
      expect(regex.test("regular text")).toBe(false);

      editor.destroy();
    });

    it("InputRule handler does nothing when noteId is empty", () => {
      const editor = new Editor({
        extensions: [StarterKit, FootnoteRef],
        content: "<p></p>",
      });

      const inputRules = (FootnoteRef.config as any).addInputRules.call({
        name: "footnoteRef",
        options: {},
        storage: {},
        editor,
        type: editor.schema.nodes.footnoteRef,
        parent: null,
      });

      const rule = inputRules[0];
      // Simulate handler with empty noteId match
      const mockChain = { insertContentAt: jest.fn().mockReturnThis(), run: jest.fn() };
      const handler = rule.handler;
      handler({
        state: editor.state,
        range: { from: 0, to: 0 },
        match: ["[^]", ""],
        chain: () => mockChain,
      });
      // Should not insert anything when noteId is empty
      expect(mockChain.insertContentAt).not.toHaveBeenCalled();

      editor.destroy();
    });

    it("InputRule handler creates node when noteId is present", () => {
      const editor = new Editor({
        extensions: [StarterKit, FootnoteRef],
        content: "<p></p>",
      });

      const inputRules = (FootnoteRef.config as any).addInputRules.call({
        name: "footnoteRef",
        options: {},
        storage: {},
        editor,
        type: editor.schema.nodes.footnoteRef,
        parent: null,
      });

      const rule = inputRules[0];
      const mockChain = { insertContentAt: jest.fn().mockReturnThis(), run: jest.fn() };
      const handler = rule.handler;
      handler({
        state: editor.state,
        range: { from: 0, to: 5 },
        match: ["[^abc]", "abc"],
        chain: () => mockChain,
      });
      // Should insert content
      expect(mockChain.insertContentAt).toHaveBeenCalled();
      expect(mockChain.run).toHaveBeenCalled();

      editor.destroy();
    });
  });

  // --- parseHTML with DOM element ---
  describe("parseHTML with DOM element", () => {
    it("extracts noteId from data-footnote-ref attribute", () => {
      const editor = new Editor({
        extensions: [StarterKit, FootnoteRef],
        content: "",
      });

      const parseRules = editor.schema.nodes.footnoteRef.spec.parseDOM!;
      const getAttrs = parseRules[0].getAttrs!;

      // Create a mock DOM element
      const el = document.createElement("sup");
      el.dataset.footnoteRef = "test-note";
      const result = getAttrs(el as any);
      expect(result).toEqual({ noteId: "test-note" });

      editor.destroy();
    });

    it("defaults to empty string when data-footnote-ref is missing", () => {
      const editor = new Editor({
        extensions: [StarterKit, FootnoteRef],
        content: "",
      });

      const parseRules = editor.schema.nodes.footnoteRef.spec.parseDOM!;
      const getAttrs = parseRules[0].getAttrs!;

      const el = document.createElement("sup");
      // Don't set dataset.footnoteRef
      const result = getAttrs(el as any);
      expect(result).toEqual({ noteId: "" });

      editor.destroy();
    });
  });
});
