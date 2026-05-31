/**
 * editorContentLoader.ts - 追加カバレッジテスト
 *
 * applyMarkdownToEditor の各ブランチ（画像アノテーション復元、GIF設定復元等）を検証する。
 */

import { applyMarkdownToEditor } from "../utils/editorContentLoader";

const mockSetContent = jest.fn();
const mockInitComments = jest.fn();

jest.mock("../types", () => ({
  getEditorStorage: jest.fn().mockReturnValue({}),
}));

const mockPreprocessMarkdown = jest.fn();
jest.mock("../utils/frontmatterHelpers", () => ({
  preprocessMarkdown: (...args: unknown[]) => mockPreprocessMarkdown(...args),
}));

function createMockEditor(overrides?: Record<string, unknown>) {
  const nodes: Array<{ type: string; attrs: Record<string, unknown>; nodeSize: number; pos: number }> = [];
  return {
    commands: {
      setContent: mockSetContent,
      initComments: mockInitComments,
    },
    state: {
      doc: {
        descendants: jest.fn((cb: (node: unknown, pos: number) => void) => {
          for (const n of nodes) {
            cb(
              {
                type: { name: n.type },
                attrs: n.attrs,
                nodeSize: n.nodeSize,
              },
              n.pos,
            );
          }
        }),
      },
    },
    view: {
      dispatch: jest.fn(),
    },
    schema: {
      nodes: {},
    },
    _nodes: nodes,
    ...overrides,
  } as any;
}

beforeEach(() => {
  mockSetContent.mockReset();
  mockInitComments.mockReset();
  mockPreprocessMarkdown.mockReset();
});

describe("applyMarkdownToEditor", () => {
  it("基本的なマークダウンの適用", () => {
    mockPreprocessMarkdown.mockReturnValue({
      frontmatter: null,
      comments: new Map(),
      body: "# Hello",
      imageAnnotations: null,
      gifSettings: null,
    });

    const editor = createMockEditor();
    const result = applyMarkdownToEditor(editor, "# Hello\n");

    expect(mockSetContent).toHaveBeenCalledWith("# Hello");
    expect(mockInitComments).toHaveBeenCalled();
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe("# Hello");
  });

  it("末尾改行ありのテキストは trailingNewline=true に設定される", () => {
    mockPreprocessMarkdown.mockReturnValue({
      frontmatter: null,
      comments: new Map(),
      body: "text",
      imageAnnotations: null,
      gifSettings: null,
    });

    const storage: Record<string, unknown> = {};
    const { getEditorStorage } = require("../types");
    (getEditorStorage as jest.Mock).mockReturnValue(storage);

    const editor = createMockEditor();
    applyMarkdownToEditor(editor, "text\n");

    expect(storage.trailingNewline).toEqual({ value: true });
  });

  it("末尾改行なしのテキストは trailingNewline=false に設定される", () => {
    mockPreprocessMarkdown.mockReturnValue({
      frontmatter: null,
      comments: new Map(),
      body: "text",
      imageAnnotations: null,
      gifSettings: null,
    });

    const storage: Record<string, unknown> = {};
    const { getEditorStorage } = require("../types");
    (getEditorStorage as jest.Mock).mockReturnValue(storage);

    const editor = createMockEditor();
    applyMarkdownToEditor(editor, "text");

    expect(storage.trailingNewline).toEqual({ value: false });
  });

  it("frontmatter がある場合はそれを返す", () => {
    mockPreprocessMarkdown.mockReturnValue({
      frontmatter: "title: Hello",
      comments: new Map([["c1", { text: "comment" }]]),
      body: "content",
      imageAnnotations: null,
      gifSettings: null,
    });

    const editor = createMockEditor();
    const result = applyMarkdownToEditor(editor, "---\ntitle: Hello\n---\ncontent");

    expect(result.frontmatter).toBe("title: Hello");
    expect(result.comments.size).toBe(1);
  });

  it("imageAnnotations がある場合はノードに設定する", () => {
    const annotations = [{ x: 10, y: 20 }];
    const imageAnnotations = new Map([["img0:test.png", annotations]]);
    mockPreprocessMarkdown.mockReturnValue({
      frontmatter: null,
      comments: new Map(),
      body: "![](test.png)",
      imageAnnotations,
      gifSettings: null,
    });

    const dispatch = jest.fn();
    const trSetNodeMarkup = jest.fn();
    const editor = createMockEditor({
      state: {
        doc: {
          descendants: jest.fn((cb: (node: unknown, pos: number) => void) => {
            cb(
              {
                type: { name: "image" },
                attrs: { src: "test.png" },
                nodeSize: 1,
              },
              5,
            );
          }),
        },
      },
      view: { dispatch },
    });
    // Mock editor.state.tr
    Object.defineProperty(editor.state, "tr", {
      get: () => ({ setNodeMarkup: trSetNodeMarkup }),
    });

    applyMarkdownToEditor(editor, "![](test.png)");

    expect(trSetNodeMarkup).toHaveBeenCalledWith(5, undefined, {
      src: "test.png",
      annotations,
    });
    expect(dispatch).toHaveBeenCalled();
  });

  it("imageAnnotations が空の場合はスキップする", () => {
    mockPreprocessMarkdown.mockReturnValue({
      frontmatter: null,
      comments: new Map(),
      body: "text",
      imageAnnotations: new Map(),
      gifSettings: null,
    });

    const dispatch = jest.fn();
    const editor = createMockEditor({ view: { dispatch } });
    applyMarkdownToEditor(editor, "text");

    // dispatch should not be called for image annotations when map is empty
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("gifSettings がある場合は image を gifBlock に変換する", () => {
    const gifData = { fps: 10, duration: 3, width: 640 };
    const gifSettings = new Map([["test.gif", gifData]]);
    mockPreprocessMarkdown.mockReturnValue({
      frontmatter: null,
      comments: new Map(),
      body: "![](test.gif)",
      imageAnnotations: null,
      gifSettings,
    });

    const dispatch = jest.fn();
    const mockGifBlockCreate = jest.fn().mockReturnValue({ nodeSize: 1 });
    const replaceWith = jest.fn();
    const editor = createMockEditor({
      state: {
        doc: {
          descendants: jest.fn((cb: (node: unknown, pos: number) => void) => {
            cb(
              {
                type: { name: "image" },
                attrs: { src: "test.gif", alt: "gif" },
                nodeSize: 1,
              },
              3,
            );
          }),
        },
      },
      schema: {
        nodes: {
          gifBlock: { create: mockGifBlockCreate },
        },
      },
      view: { dispatch },
    });
    Object.defineProperty(editor.state, "tr", {
      get: () => ({
        replaceWith,
        docChanged: true,
      }),
    });

    applyMarkdownToEditor(editor, "![](test.gif)");

    expect(mockGifBlockCreate).toHaveBeenCalledWith({
      src: "test.gif",
      alt: "gif",
      gifSettings: gifData,
    });
    expect(replaceWith).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalled();
  });

  it("gifSettings があるが gifBlock タイプが schema に無い場合はスキップ", () => {
    const gifSettings = new Map([["test.gif", { fps: 10, duration: 3, width: 640 }]]);
    mockPreprocessMarkdown.mockReturnValue({
      frontmatter: null,
      comments: new Map(),
      body: "![](test.gif)",
      imageAnnotations: null,
      gifSettings,
    });

    const dispatch = jest.fn();
    const editor = createMockEditor({
      schema: { nodes: {} }, // no gifBlock type
      view: { dispatch },
    });

    applyMarkdownToEditor(editor, "![](test.gif)");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("gifSettings が空の場合はスキップ", () => {
    mockPreprocessMarkdown.mockReturnValue({
      frontmatter: null,
      comments: new Map(),
      body: "text",
      imageAnnotations: null,
      gifSettings: new Map(),
    });

    const dispatch = jest.fn();
    const editor = createMockEditor({ view: { dispatch } });
    applyMarkdownToEditor(editor, "text");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("initComments が関数でない場合はスキップ", () => {
    mockPreprocessMarkdown.mockReturnValue({
      frontmatter: null,
      comments: new Map(),
      body: "text",
      imageAnnotations: null,
      gifSettings: null,
    });

    const editor = createMockEditor({
      commands: {
        setContent: mockSetContent,
        // initComments is not defined
      },
    });
    // Should not throw
    applyMarkdownToEditor(editor, "text");
    expect(mockSetContent).toHaveBeenCalled();
  });

  it("gifSettings で docChanged が false の場合は dispatch しない", () => {
    const gifSettings = new Map([["test.gif", { fps: 10, duration: 3, width: 640 }]]);
    mockPreprocessMarkdown.mockReturnValue({
      frontmatter: null,
      comments: new Map(),
      body: "text",
      imageAnnotations: null,
      gifSettings,
    });

    const dispatch = jest.fn();
    const editor = createMockEditor({
      state: {
        doc: {
          descendants: jest.fn(), // no matching nodes
        },
      },
      schema: {
        nodes: {
          gifBlock: { create: jest.fn() },
        },
      },
      view: { dispatch },
    });
    Object.defineProperty(editor.state, "tr", {
      get: () => ({
        replaceWith: jest.fn(),
        docChanged: false,
      }),
    });

    applyMarkdownToEditor(editor, "text");
    expect(dispatch).not.toHaveBeenCalled();
  });
});
