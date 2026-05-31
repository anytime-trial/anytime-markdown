/**
 * footnoteExtension.tsx coverage2 tests
 * Targets uncovered lines: 21-25 (FootnoteRefView component), 88-91 (InputRule handler)
 * Focus: FootnoteRefView rendering via NodeView, InputRule direct handler test
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// Mock for getPrimaryMain
jest.mock("../constants/colors", () => ({
  getPrimaryMain: (isDark: boolean) => isDark ? "#90caf9" : "#1976d2",
}));

// We need to test the FootnoteRefView component directly
// Since it's not exported, we test it through the extension's NodeView

jest.mock("@tiptap/react", () => ({
  ...jest.requireActual("@tiptap/react"),
  NodeViewWrapper: ({ children, as, style }: any) => <span data-testid="node-view-wrapper" style={style}>{children}</span>,
  ReactNodeViewRenderer: jest.fn((Component: any) => {
    // Store the component for direct testing
    (global as any).__FootnoteRefView = Component;
    return () => ({});
  }),
}));

import { FootnoteRef } from "../extensions/footnoteExtension";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

const theme = createTheme();

describe("FootnoteRef Extension coverage2", () => {
  // --- Lines 21-25: FootnoteRefView rendering ---
  describe("FootnoteRefView component", () => {
    it("renders footnote reference with noteId", () => {
      // Initialize the extension to trigger ReactNodeViewRenderer call
      const editor = new Editor({
        extensions: [StarterKit, FootnoteRef],
        content: "",
      });

      const FootnoteRefView = (global as any).__FootnoteRefView;
      expect(FootnoteRefView).toBeTruthy();

      render(
        <ThemeProvider theme={theme}>
          <FootnoteRefView
            node={{ attrs: { noteId: "42" } }}
            selected={false}
            editor={editor}
            getPos={() => 0}
            updateAttributes={jest.fn()}
            deleteNode={jest.fn()}
            decorations={[]}
            extension={null}
            HTMLAttributes={{}}
          />
        </ThemeProvider>,
      );

      expect(screen.getByText("[42]")).toBeTruthy();
      editor.destroy();
    });

    it("renders with selected state", () => {
      const editor = new Editor({
        extensions: [StarterKit, FootnoteRef],
        content: "",
      });

      const FootnoteRefView = (global as any).__FootnoteRefView;

      render(
        <ThemeProvider theme={theme}>
          <FootnoteRefView
            node={{ attrs: { noteId: "note1" } }}
            selected={true}
            editor={editor}
            getPos={() => 0}
            updateAttributes={jest.fn()}
            deleteNode={jest.fn()}
            decorations={[]}
            extension={null}
            HTMLAttributes={{}}
          />
        </ThemeProvider>,
      );

      expect(screen.getByText("[note1]")).toBeTruthy();
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
