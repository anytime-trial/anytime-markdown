/**
 * markdownSerializer.ts - カバレッジテスト (lines 22-25, 31-34, 46, 54-63)
 * embedImageAnnotations, embedGifSettings paths
 */
import { getMarkdownFromEditor } from "../utils/markdownSerializer";

// Mock dependencies
jest.mock("../extensions/commentExtension", () => ({
  commentDataPluginKey: {
    getState: jest.fn().mockReturnValue(undefined),
  },
}));

jest.mock("../types", () => ({
  getMarkdownStorage: (editor: any) => ({
    getMarkdown: () => editor._md || "",
  }),
}));

jest.mock("../utils/commentHelpers", () => ({
  appendCommentData: jest.fn().mockImplementation((md: string) => md),
}));

jest.mock("../utils/editorContentLoader", () => ({
  getTrailingNewline: jest.fn().mockReturnValue(false),
}));

jest.mock("../utils/mathHelpers", () => ({
  postprocessMathBlock: (md: string) => md,
}));

jest.mock("../utils/sanitizeMarkdown", () => ({
  normalizeCodeSpanDelimitersInLine: (line: string) => line,
  restoreBlankLines: (md: string) => md,
}));

function createEditor(md: string, nodes: any[] = []) {
  return {
    _md: md,
    state: {
      doc: {
        descendants: (cb: Function) => {
          for (const n of nodes) cb(n);
        },
      },
    },
  } as any;
}

describe("markdownSerializer coverage", () => {
  it("embedImageAnnotations adds annotation block for images with annotations", () => {
    const editor = createEditor("![img](pic.png)", [
      {
        type: { name: "image" },
        attrs: {
          src: "pic.png",
          annotations: '{"rects":[]}',
        },
      },
    ]);

    const result = getMarkdownFromEditor(editor);
    expect(result).toContain("<!-- image-comments");
    expect(result).toContain('img0:pic.png={"rects":[]}');
  });

  it("embedImageAnnotations uses truncated key for long src (Base64)", () => {
    const longSrc = "data:image/png;base64," + "A".repeat(200);
    const editor = createEditor(`![img](${longSrc})`, [
      {
        type: { name: "image" },
        attrs: {
          src: longSrc,
          annotations: '{"circles":[]}',
        },
      },
    ]);

    const result = getMarkdownFromEditor(editor);
    expect(result).toContain("<!-- image-comments");
    expect(result).toContain("img0:data:image/png;base6");
  });

  it("embedImageAnnotations skips images without annotations", () => {
    const editor = createEditor("![img](pic.png)", [
      {
        type: { name: "image" },
        attrs: { src: "pic.png", annotations: null },
      },
    ]);

    const result = getMarkdownFromEditor(editor);
    expect(result).not.toContain("<!-- image-comments");
  });

  it("embedGifSettings adds settings comment after gif image", () => {
    const editor = createEditor('![gif](anim.gif)', [
      {
        type: { name: "gifBlock" },
        attrs: {
          src: "anim.gif",
          alt: "gif",
          gifSettings: '{"speed":1}',
        },
      },
    ]);

    const result = getMarkdownFromEditor(editor);
    expect(result).toContain('<!-- gif-settings: {"speed":1} -->');
  });

  it("embedGifSettings skips gif without settings", () => {
    const editor = createEditor('![gif](anim.gif)', [
      {
        type: { name: "gifBlock" },
        attrs: { src: "anim.gif", alt: "gif", gifSettings: null },
      },
    ]);

    const result = getMarkdownFromEditor(editor);
    expect(result).not.toContain("gif-settings");
  });

  it("returns md unchanged when doc has no images or gifs", () => {
    const editor = createEditor("# Hello World", [
      { type: { name: "paragraph" }, attrs: {} },
    ]);

    const result = getMarkdownFromEditor(editor);
    expect(result).toBe("# Hello World");
  });

  it("returns empty string for null/undefined state", () => {
    const editor = {
      _md: "",
      state: { doc: null },
    } as any;

    // embedImageAnnotations checks editor.state?.doc
    const result = getMarkdownFromEditor(editor);
    expect(result).toBe("");
  });
});
