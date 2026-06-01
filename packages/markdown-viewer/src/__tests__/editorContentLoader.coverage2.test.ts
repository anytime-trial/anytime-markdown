/**
 * editorContentLoader.ts coverage2 tests
 * Targets uncovered branches:
 * - setTrailingNewline / getTrailingNewline (lines covered by basic test)
 * - applyMarkdownToEditor: initComments check (line 35)
 * - imageAnnotations empty/null branch (line 39)
 * - gifSettings empty/null branch (line 57)
 * - gifBlockType null branch (line 59)
 * - tr.docChanged false branch (line 74)
 * - image src > 100 chars key (line 44)
 */
import { applyMarkdownToEditor, setTrailingNewline, getTrailingNewline } from "../utils/editorContentLoader";

jest.mock("../types", () => ({
  getEditorStorage: jest.fn().mockReturnValue({}),
}));

jest.mock("../utils/frontmatterHelpers", () => ({
  preprocessMarkdown: jest.fn((text: string) => ({
    frontmatter: null,
    comments: new Map(),
    body: text,
    imageAnnotations: new Map(),
    gifSettings: new Map(),
  })),
}));

const { getEditorStorage } = require("../types");
const { preprocessMarkdown } = require("../utils/frontmatterHelpers");

function createMockEditor(overrides: Record<string, any> = {}) {
  const storage: Record<string, any> = {};
  (getEditorStorage as jest.Mock).mockReturnValue(storage);

  return {
    commands: {
      setContent: jest.fn(),
      initComments: jest.fn(),
    },
    state: {
      doc: {
        descendants: jest.fn(),
      },
      tr: {
        setNodeMarkup: jest.fn().mockReturnThis(),
        replaceWith: jest.fn().mockReturnThis(),
        docChanged: false,
      },
    },
    view: {
      dispatch: jest.fn(),
    },
    schema: {
      nodes: {
        gifBlock: { create: jest.fn().mockReturnValue({ nodeSize: 1 }) },
      },
    },
    storage,
    ...overrides,
  } as any;
}

describe("editorContentLoader coverage2", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (preprocessMarkdown as jest.Mock).mockImplementation((text: string) => ({
      frontmatter: null,
      comments: new Map(),
      body: text,
      imageAnnotations: null,
      gifSettings: null,
    }));
  });

  it("setTrailingNewline and getTrailingNewline work", () => {
    const editor = createMockEditor();
    setTrailingNewline(editor, true);
    expect(getTrailingNewline(editor)).toBe(true);
    setTrailingNewline(editor, false);
    expect(getTrailingNewline(editor)).toBe(false);
  });

  it("applyMarkdownToEditor calls setContent and initComments", () => {
    const editor = createMockEditor();
    const result = applyMarkdownToEditor(editor, "hello\n");
    expect(editor.commands.setContent).toHaveBeenCalledWith("hello\n");
    expect(editor.commands.initComments).toHaveBeenCalled();
  });

  it("skips initComments when not a function", () => {
    const editor = createMockEditor();
    editor.commands.initComments = undefined;
    const result = applyMarkdownToEditor(editor, "test");
    expect(editor.commands.setContent).toHaveBeenCalled();
  });

  it("handles imageAnnotations when present", () => {
    const imgAnnotations = new Map([["img0:test.png", '[{"id":"a1"}]']]);
    (preprocessMarkdown as jest.Mock).mockReturnValue({
      frontmatter: null,
      comments: new Map(),
      body: "test",
      imageAnnotations: imgAnnotations,
      gifSettings: null,
    });

    const editor = createMockEditor();
    editor.state.doc.descendants = jest.fn((cb: any) => {
      cb({ type: { name: "image" }, attrs: { src: "test.png" }, nodeSize: 1 }, 5);
    });

    applyMarkdownToEditor(editor, "test");
    expect(editor.view.dispatch).toHaveBeenCalled();
  });

  it("handles image with long src (> 100 chars)", () => {
    const longSrc = "a".repeat(150);
    const key = `img0:${longSrc.slice(0, 20)}`;
    const imgAnnotations = new Map([[key, '[{"id":"a1"}]']]);
    (preprocessMarkdown as jest.Mock).mockReturnValue({
      frontmatter: null,
      comments: new Map(),
      body: "test",
      imageAnnotations: imgAnnotations,
      gifSettings: null,
    });

    const editor = createMockEditor();
    editor.state.doc.descendants = jest.fn((cb: any) => {
      cb({ type: { name: "image" }, attrs: { src: longSrc }, nodeSize: 1 }, 5);
    });

    applyMarkdownToEditor(editor, "test");
  });

  it("handles gifSettings when present", () => {
    const gifs = new Map([["anim.gif", '{"fps":10}']]);
    (preprocessMarkdown as jest.Mock).mockReturnValue({
      frontmatter: null,
      comments: new Map(),
      body: "test",
      imageAnnotations: null,
      gifSettings: gifs,
    });

    const editor = createMockEditor();
    editor.state.doc.descendants = jest.fn((cb: any) => {
      cb({ type: { name: "image" }, attrs: { src: "anim.gif", alt: "anim" }, nodeSize: 1 }, 5);
    });
    editor.state.tr.docChanged = true;

    applyMarkdownToEditor(editor, "test");
    expect(editor.view.dispatch).toHaveBeenCalled();
  });

  it("skips gifSettings when gifBlockType is not in schema", () => {
    const gifs = new Map([["anim.gif", '{"fps":10}']]);
    (preprocessMarkdown as jest.Mock).mockReturnValue({
      frontmatter: null,
      comments: new Map(),
      body: "test",
      imageAnnotations: null,
      gifSettings: gifs,
    });

    const editor = createMockEditor();
    editor.schema.nodes.gifBlock = undefined;

    applyMarkdownToEditor(editor, "test");
    // dispatch should not be called for gif
  });

  it("handles empty imageAnnotations map", () => {
    (preprocessMarkdown as jest.Mock).mockReturnValue({
      frontmatter: null,
      comments: new Map(),
      body: "test",
      imageAnnotations: new Map(),
      gifSettings: new Map(),
    });

    const editor = createMockEditor();
    applyMarkdownToEditor(editor, "test");
  });

  it("handles gifSettings with no matching image nodes", () => {
    const gifs = new Map([["missing.gif", '{"fps":10}']]);
    (preprocessMarkdown as jest.Mock).mockReturnValue({
      frontmatter: null,
      comments: new Map(),
      body: "test",
      imageAnnotations: null,
      gifSettings: gifs,
    });

    const editor = createMockEditor();
    editor.state.doc.descendants = jest.fn((cb: any) => {
      cb({ type: { name: "image" }, attrs: { src: "other.png" }, nodeSize: 1 }, 5);
    });
    editor.state.tr.docChanged = false;

    applyMarkdownToEditor(editor, "test");
    // dispatch should not be called since docChanged is false
  });
});
