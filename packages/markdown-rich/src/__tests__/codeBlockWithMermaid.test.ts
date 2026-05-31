/**
 * CodeBlockWithMermaid (codeBlockWithMermaid.ts) のテスト
 *
 * markdown-core の smallExtensions.extra.test.ts から分離 (B-3+B-4)。
 * codeBlockWithMermaid は markdown-rich へ物理移動したため、その拡張テストも rich へ移設する。
 */

// React / ReactNodeViewRenderer モック
jest.mock("@anytime-markdown/markdown-react", () => ({
  ReactNodeViewRenderer: jest.fn(() => jest.fn()),
}));

// lowlight モック（CodeBlockLowlight が依存）
jest.mock("lowlight", () => ({
  createLowlight: () => ({
    register: jest.fn(),
  }),
  common: {},
}));

// NodeView コンポーネントモック
jest.mock("../MermaidNodeView", () => ({ CodeBlockNodeView: () => null }));

import { CodeBlockWithMermaid } from "../codeBlockWithMermaid";
import {
  createMockSerializerState,
  getAttributes,
  getStorage,
} from "../../../markdown-viewer/src/testUtils/extensionTestHelpers";

describe("CodeBlockWithMermaid (codeBlockWithMermaid)", () => {
  it("has name 'codeBlock'", () => {
    expect(CodeBlockWithMermaid.name).toBe("codeBlock");
  });

  it("is draggable", () => {
    expect(CodeBlockWithMermaid.config.draggable).toBe(true);
  });

  it("adds collapsed attribute (default false)", () => {
    const attrs = getAttributes(CodeBlockWithMermaid);
    expect(attrs.collapsed).toEqual({ default: false, rendered: false });
  });

  it("adds codeCollapsed attribute (default true)", () => {
    const attrs = getAttributes(CodeBlockWithMermaid);
    expect(attrs.codeCollapsed).toEqual({ default: true, rendered: false });
  });

  it("adds width attribute (default null)", () => {
    const attrs = getAttributes(CodeBlockWithMermaid);
    expect(attrs.width).toEqual({ default: null, rendered: false });
  });

  it("defines addNodeView", () => {
    expect(CodeBlockWithMermaid.config.addNodeView).toBeDefined();
  });

  describe("markdown serializer", () => {
    it("serializes normal code block", () => {
      const storage = getStorage(CodeBlockWithMermaid);
      const state = createMockSerializerState();
      const node = {
        attrs: { language: "javascript" },
        textContent: 'console.log("hello");',
      };

      storage.markdown.serialize(state, node);
      const output = state.output;
      expect(output).toContain("```javascript");
      expect(output).toContain('console.log("hello");');
      expect(output).toContain("```");
    });

    it("serializes code block without language", () => {
      const storage = getStorage(CodeBlockWithMermaid);
      const state = createMockSerializerState();
      const node = {
        attrs: { language: "" },
        textContent: "plain text",
      };

      storage.markdown.serialize(state, node);
      const output = state.output;
      expect(output).toContain("```\n");
    });

    it("serializes code block with null language", () => {
      const storage = getStorage(CodeBlockWithMermaid);
      const state = createMockSerializerState();
      const node = {
        attrs: { language: null },
        textContent: "text",
      };

      storage.markdown.serialize(state, node);
      const output = state.output;
      expect(output).toContain("```\n");
    });

    it("serializes math block with $$ delimiters", () => {
      const storage = getStorage(CodeBlockWithMermaid);
      const state = createMockSerializerState();
      const node = {
        attrs: { language: "math" },
        textContent: "E = mc^2",
      };

      storage.markdown.serialize(state, node);
      const output = state.output;
      expect(output).toContain("$$");
      expect(output).toContain("E = mc^2");
      // Should NOT contain backticks
      expect(output).not.toContain("```");
    });

    it("parse exposes a setup hook for the embed fence renderer", () => {
      const storage = getStorage(CodeBlockWithMermaid);
      expect(typeof storage.markdown.parse.setup).toBe("function");
    });
  });
});
