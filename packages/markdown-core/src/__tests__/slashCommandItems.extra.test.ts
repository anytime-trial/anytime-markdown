/**
 * slashCommandItems の追加カバレッジテスト
 *
 * 既存テストでカバーされていない行を対象:
 * - insertTemplate (lines 50-64)
 * - footnote action (lines 240-243)
 * - admonition command callbacks (lines 254-313)
 * - comment action (lines 332-337)
 * - screenshot action (lines 367-370)
 * - frontmatter action (existing frontmatter branch, lines 383-384)
 * - template actions (lines 412-447)
 * - filterSlashItems edge cases
 */

// テンプレートの .md ファイルインポートをモック
jest.mock("../constants/templates/apiSpec.md", () => "---\ntitle: api\n---\n# API Spec", { virtual: true });
jest.mock("../constants/templates/basicDesign.md", () => "---\ntitle: design\n---\n# Basic Design", { virtual: true });
jest.mock("../constants/templates/markdownAll.ja.md", () => "# Markdown All JA", { virtual: true });
jest.mock("../constants/templates/markdownAll.en.md", () => "# Markdown All EN", { virtual: true });
jest.mock("../constants/templates/welcome.md", () => "# Welcome JA", { virtual: true });
jest.mock("../constants/templates/welcome-en.md", () => "# Welcome EN", { virtual: true });

const mockExtractHeadings = jest.fn().mockReturnValue([]);
const mockGetEditorStorage = jest.fn().mockReturnValue({
  commentDialog: { open: null },
});

jest.mock("../types", () => ({
  extractHeadings: (...args: unknown[]) => mockExtractHeadings(...args),
  getEditorStorage: (...args: unknown[]) => mockGetEditorStorage(...args),
}));

const mockPreprocessMarkdown = jest.fn().mockImplementation((content: string) => ({
  body: content,
  frontmatter: {},
}));

jest.mock("../utils/frontmatterHelpers", () => ({
  preprocessMarkdown: (...args: unknown[]) => mockPreprocessMarkdown(...args),
}));

const mockSanitizeMarkdown = jest.fn().mockImplementation((md: string) => md);
const mockPreserveBlankLines = jest.fn().mockImplementation((md: string) => md);

jest.mock("../utils/sanitizeMarkdown", () => ({
  sanitizeMarkdown: (...args: unknown[]) => mockSanitizeMarkdown(...args),
  preserveBlankLines: (...args: unknown[]) => mockPreserveBlankLines(...args),
}));

const mockGenerateTocMarkdown = jest.fn().mockReturnValue("- [Heading](#heading)");

jest.mock("../utils/tocHelpers", () => ({
  generateTocMarkdown: (...args: unknown[]) => mockGenerateTocMarkdown(...args),
}));

import { slashCommandItems, filterSlashItems, type SlashCommandItem } from "../extensions/slashCommandItems";

function createMockEditor(overrides: Record<string, unknown> = {}) {
  const runFn = jest.fn();
  const commandFn = jest.fn().mockImplementation((fn: (args: { tr: unknown; state: unknown }) => boolean) => {
    // Actually invoke the command callback to cover admonition lines
    const mockTr = {
      setNodeAttribute: jest.fn(),
      selection: {
        $from: {
          depth: 2,
          before: jest.fn().mockReturnValue(5),
          node: jest.fn().mockImplementation((d: number) => ({
            type: { name: d === 1 ? "blockquote" : "paragraph" },
          })),
        },
      },
    };
    fn({ tr: mockTr, state: {} });
    return { run: runFn };
  });

  const chainObj: Record<string, jest.Mock> = {
    focus: jest.fn().mockReturnThis(),
    setHeading: jest.fn().mockReturnThis(),
    toggleBulletList: jest.fn().mockReturnThis(),
    toggleOrderedList: jest.fn().mockReturnThis(),
    toggleTaskList: jest.fn().mockReturnThis(),
    toggleBlockquote: jest.fn().mockReturnThis(),
    setBlockquote: jest.fn().mockReturnThis(),
    toggleCodeBlock: jest.fn().mockReturnThis(),
    setCodeBlock: jest.fn().mockReturnThis(),
    updateAttributes: jest.fn().mockReturnThis(),
    wrapIn: jest.fn().mockReturnThis(),
    lift: jest.fn().mockReturnThis(),
    insertTable: jest.fn().mockReturnThis(),
    setHorizontalRule: jest.fn().mockReturnThis(),
    insertContent: jest.fn().mockReturnThis(),
    setImage: jest.fn().mockReturnThis(),
    setTextSelection: jest.fn().mockReturnThis(),
    command: commandFn,
    run: runFn,
  };

  const docContent = { size: 100 };
  const mockDoc = {
    content: docContent,
    toJSON: jest.fn().mockReturnValue({ type: "doc", content: [] }),
    firstChild: overrides.firstChild ?? null,
    descendants: jest.fn(),
  };

  return {
    chain: jest.fn().mockReturnValue(chainObj),
    commands: {
      focus: jest.fn(),
      setContent: jest.fn(),
    },
    state: {
      doc: mockDoc,
      tr: { insert: jest.fn() },
      selection: { from: 5 },
      schema: {
        nodes: {
          footnoteRef: {
            create: jest.fn().mockReturnValue({
              toJSON: jest.fn().mockReturnValue({ type: "footnoteRef", attrs: { noteId: "1" } }),
            }),
          },
          codeBlock: {
            create: jest.fn().mockReturnValue({ type: "codeBlock" }),
          },
          paragraph: {
            create: jest.fn().mockReturnValue({ type: "paragraph" }),
          },
        },
        text: jest.fn().mockReturnValue({ type: "text" }),
      },
    },
    view: { dispatch: jest.fn() },
    schema: {
      nodes: {
        codeBlock: {
          create: jest.fn().mockReturnValue({ type: "codeBlock" }),
        },
      },
      text: jest.fn().mockReturnValue({ type: "text" }),
    },
    storage: {},
    extensionManager: { extensions: [] },
    isActive: jest.fn().mockReturnValue(false),
    _chain: chainObj,
    _run: runFn,
    _command: commandFn,
  } as any;
}

function findItem(id: string): SlashCommandItem {
  const item = slashCommandItems.find((i) => i.id === id);
  if (!item) throw new Error(`Item ${id} not found`);
  return item;
}

describe("slashCommandItems.extra", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("footnote action", () => {
    it("footnoteRef ノードを挿入する", () => {
      const editor = createMockEditor();
      findItem("footnote").action(editor);
      expect(editor.state.schema.nodes.footnoteRef.create).toHaveBeenCalled();
      expect(editor._chain.insertContent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "footnoteRef" }),
      );
      expect(editor._run).toHaveBeenCalled();
    });

    it("footnoteRef がスキーマにない場合は何もしない", () => {
      const editor = createMockEditor();
      editor.state.schema.nodes.footnoteRef = undefined;
      findItem("footnote").action(editor);
      expect(editor._chain.insertContent).not.toHaveBeenCalled();
    });
  });

  describe("admonition actions", () => {
    const admonitionTypes = [
      { id: "admonitionNote", type: "note" },
      { id: "admonitionTip", type: "tip" },
      { id: "admonitionImportant", type: "important" },
      { id: "admonitionWarning", type: "warning" },
      { id: "admonitionCaution", type: "caution" },
    ];

    for (const { id, type } of admonitionTypes) {
      it(`${id} が setBlockquote + admonitionType "${type}" を設定する`, () => {
        const editor = createMockEditor();
        findItem(id).action(editor);
        expect(editor._chain.setBlockquote).toHaveBeenCalled();
        expect(editor._command).toHaveBeenCalled();

        // command callback 内で setNodeAttribute が呼ばれたことを確認
        const commandCallback = editor._command.mock.calls[0][0];
        const mockTr = {
          setNodeAttribute: jest.fn(),
          selection: {
            $from: {
              depth: 2,
              before: jest.fn().mockReturnValue(10),
              node: jest.fn().mockImplementation((d: number) => ({
                type: { name: d === 1 ? "blockquote" : "paragraph" },
              })),
            },
          },
        };
        const result = commandCallback({ tr: mockTr, state: {} });
        expect(result).toBe(true);
        expect(mockTr.setNodeAttribute).toHaveBeenCalledWith(10, "admonitionType", type);
      });
    }
  });

  describe("comment action", () => {
    it("commentDialog.open を呼び出す", () => {
      const mockOpen = jest.fn();
      mockGetEditorStorage.mockReturnValue({
        commentDialog: { open: mockOpen },
      });
      const editor = createMockEditor();
      findItem("comment").action(editor);
      expect(mockOpen).toHaveBeenCalled();
    });

    it("openDialog が null の場合は何もしない", () => {
      mockGetEditorStorage.mockReturnValue({
        commentDialog: { open: null },
      });
      const editor = createMockEditor();
      expect(() => findItem("comment").action(editor)).not.toThrow();
    });
  });

  describe("screenshot action", () => {
    it("getDisplayMedia が利用可能な場合 CustomEvent をディスパッチする", () => {
      const dispatchSpy = jest.spyOn(globalThis, "dispatchEvent");
      Object.defineProperty(navigator, "mediaDevices", {
        value: { getDisplayMedia: jest.fn() },
        configurable: true,
      });
      const editor = createMockEditor();
      findItem("screenshot").action(editor);
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "open-screen-capture" }),
      );
      dispatchSpy.mockRestore();
    });

    it("navigator.mediaDevices がない場合は何もしない", () => {
      const dispatchSpy = jest.spyOn(globalThis, "dispatchEvent");
      Object.defineProperty(navigator, "mediaDevices", {
        value: undefined,
        configurable: true,
      });
      const editor = createMockEditor();
      findItem("screenshot").action(editor);
      const calls = dispatchSpy.mock.calls.filter(
        (c) => (c[0] as Event).type === "open-screen-capture",
      );
      expect(calls).toHaveLength(0);
      dispatchSpy.mockRestore();
    });
  });

  describe("frontmatter action", () => {
    it("既存フロントマターがある場合はフォーカスのみ", () => {
      const mockGet = jest.fn().mockReturnValue("title: existing");
      const mockSet = jest.fn();
      mockGetEditorStorage.mockReturnValue({
        frontmatter: { get: mockGet, set: mockSet },
      });
      const editor = createMockEditor();
      findItem("frontmatter").action(editor);
      expect(mockGet).toHaveBeenCalled();
      expect(mockSet).not.toHaveBeenCalled();
    });

    it("フロントマターがない場合は set を呼ぶ", () => {
      const mockGet = jest.fn().mockReturnValue(null);
      const mockSet = jest.fn();
      mockGetEditorStorage.mockReturnValue({
        frontmatter: { get: mockGet, set: mockSet },
      });
      const editor = createMockEditor({ firstChild: null });
      findItem("frontmatter").action(editor);
      expect(mockSet).toHaveBeenCalledWith("title: ");
    });

    it("storage.frontmatter がない場合は何もしない", () => {
      mockGetEditorStorage.mockReturnValue({});
      const editor = createMockEditor();
      expect(() => findItem("frontmatter").action(editor)).not.toThrow();
    });
  });

  describe("toc action", () => {
    it("見出しがない場合は insertContent を呼ばない", () => {
      mockGenerateTocMarkdown.mockReturnValue("");
      const editor = createMockEditor();
      findItem("toc").action(editor);
      expect(editor._chain.insertContent).not.toHaveBeenCalled();
    });

    it("見出しがある場合は TOC を挿入する", () => {
      mockGenerateTocMarkdown.mockReturnValue("- [H1](#h1)");
      const editor = createMockEditor();
      findItem("toc").action(editor);
      expect(editor._chain.insertContent).toHaveBeenCalledWith("- [H1](#h1)");
    });
  });

  describe("template actions", () => {
    beforeEach(() => {
      Object.defineProperty(document, "cookie", {
        writable: true,
        value: "",
      });
    });

    it("template-welcome がロケール ja でウェルカムテンプレートを挿入する", () => {
      document.cookie = "NEXT_LOCALE=ja";
      const editor = createMockEditor();
      findItem("template-welcome").action(editor);
      expect(mockPreprocessMarkdown).toHaveBeenCalledWith("# Welcome JA");
      expect(mockSanitizeMarkdown).toHaveBeenCalled();
      expect(mockPreserveBlankLines).toHaveBeenCalled();
      expect(editor.commands.setContent).toHaveBeenCalled();
    });

    it("template-welcome がロケール en で英語テンプレートを挿入する", () => {
      document.cookie = "NEXT_LOCALE=en";
      const editor = createMockEditor();
      findItem("template-welcome").action(editor);
      expect(mockPreprocessMarkdown).toHaveBeenCalledWith("# Welcome EN");
    });

    it("template-welcome がロケール未設定時に ja をデフォルトとする", () => {
      document.cookie = "";
      const editor = createMockEditor();
      findItem("template-welcome").action(editor);
      expect(mockPreprocessMarkdown).toHaveBeenCalledWith("# Welcome JA");
    });

    it("template-markdown-all がロケール ja で日本語テンプレートを挿入する", () => {
      document.cookie = "NEXT_LOCALE=ja";
      const editor = createMockEditor();
      findItem("template-markdown-all").action(editor);
      expect(mockPreprocessMarkdown).toHaveBeenCalledWith("# Markdown All JA");
    });

    it("template-markdown-all がロケール en で英語テンプレートを挿入する", () => {
      document.cookie = "NEXT_LOCALE=en";
      const editor = createMockEditor();
      findItem("template-markdown-all").action(editor);
      expect(mockPreprocessMarkdown).toHaveBeenCalledWith("# Markdown All EN");
    });

    it("template-basic-design がテンプレートを挿入する", () => {
      const editor = createMockEditor();
      findItem("template-basic-design").action(editor);
      expect(mockPreprocessMarkdown).toHaveBeenCalled();
      expect(editor.commands.setContent).toHaveBeenCalled();
    });

    it("template-api-spec がテンプレートを挿入する", () => {
      const editor = createMockEditor();
      findItem("template-api-spec").action(editor);
      expect(mockPreprocessMarkdown).toHaveBeenCalled();
      expect(editor.commands.setContent).toHaveBeenCalled();
    });

    it("insertTemplate が sanitizeMarkdown と preserveBlankLines を通す", () => {
      const editor = createMockEditor();
      findItem("template-basic-design").action(editor);
      expect(mockSanitizeMarkdown).toHaveBeenCalled();
      expect(mockPreserveBlankLines).toHaveBeenCalled();
    });

    it("insertTemplate がドキュメントを退避・復元・挿入する", () => {
      const editor = createMockEditor();
      findItem("template-api-spec").action(editor);
      // setContent is called twice: once for parsing, once for restore
      expect(editor.commands.setContent).toHaveBeenCalledTimes(2);
      expect(editor.view.dispatch).toHaveBeenCalled();
      expect(editor.commands.focus).toHaveBeenCalled();
    });
  });

  describe("image action", () => {
    it("ファイル選択ダイアログを開く", () => {
      const mockClick = jest.fn();
      const mockInput = {
        type: "",
        accept: "",
        onchange: null as (() => void) | null,
        files: null,
        click: mockClick,
      };
      jest.spyOn(document, "createElement").mockReturnValue(mockInput as unknown as HTMLElement);

      const editor = createMockEditor();
      findItem("image").action(editor);

      expect(mockInput.type).toBe("file");
      expect(mockInput.accept).toBe("image/*");
      expect(mockClick).toHaveBeenCalled();

      (document.createElement as jest.Mock).mockRestore();
    });

    it("ファイル未選択時は何もしない", () => {
      const mockInput = {
        type: "",
        accept: "",
        onchange: null as (() => void) | null,
        files: [],
        click: jest.fn(),
      };
      jest.spyOn(document, "createElement").mockReturnValue(mockInput as unknown as HTMLElement);

      const editor = createMockEditor();
      findItem("image").action(editor);

      mockInput.onchange!();
      expect(editor._chain.setImage).not.toHaveBeenCalled();

      (document.createElement as jest.Mock).mockRestore();
    });

    it("ファイル選択時に FileReader で画像を読み込む", () => {
      const mockFile = new File(["data"], "test.png", { type: "image/png" });
      const mockInput = {
        type: "",
        accept: "",
        onchange: null as (() => void) | null,
        files: [mockFile],
        click: jest.fn(),
      };
      jest.spyOn(document, "createElement").mockReturnValue(mockInput as unknown as HTMLElement);

      const mockReaderInstance = {
        onload: null as (() => void) | null,
        result: "data:image/png;base64,abc",
        readAsDataURL: jest.fn().mockImplementation(function (this: typeof mockReaderInstance) {
          setTimeout(() => this.onload?.(), 0);
        }),
      };
      jest.spyOn(globalThis, "FileReader").mockImplementation(
        () => mockReaderInstance as unknown as FileReader,
      );

      const editor = createMockEditor();
      findItem("image").action(editor);
      mockInput.onchange!();

      expect(mockReaderInstance.readAsDataURL).toHaveBeenCalledWith(mockFile);

      // Trigger onload
      mockReaderInstance.onload!();
      expect(editor._chain.setImage).toHaveBeenCalledWith({
        src: "data:image/png;base64,abc",
        alt: "test.png",
      });

      (document.createElement as jest.Mock).mockRestore();
      (globalThis.FileReader as unknown as jest.Mock).mockRestore();
    });
  });
});

describe("filterSlashItems extra", () => {
  const mockT = (key: string) => {
    const map: Record<string, string> = {
      slashH1: "Heading 1",
      slashMermaid: "Mermaid Diagram",
      slashTable: "Table",
    };
    return map[key] ?? key;
  };

  const items: SlashCommandItem[] = [
    { id: "heading1", labelKey: "slashH1", icon: null as any, keywords: ["h1", "heading", "TITLE"], action: jest.fn() },
    { id: "mermaid", labelKey: "slashMermaid", icon: null as any, keywords: ["mermaid", "diagram"], action: jest.fn() },
    { id: "table", labelKey: "slashTable", icon: null as any, keywords: ["table"], action: jest.fn() },
  ];

  it("キーワードの大小文字を区別しない", () => {
    const result = filterSlashItems(items, "title", mockT);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("heading1");
  });

  it("ラベルの部分一致で検索する", () => {
    const result = filterSlashItems(items, "Merm", mockT);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("mermaid");
  });

  it("キーワードとラベル両方にマッチするアイテムを返す", () => {
    const result = filterSlashItems(items, "diagram", mockT);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("mermaid");
  });
});
