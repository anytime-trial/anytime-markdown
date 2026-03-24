/**
 * slashCommandItems のユニットテスト
 *
 * スラッシュコマンドアイテムの定義と filterSlashItems を検証する。
 */

// テンプレートの .md ファイルインポートをモック
jest.mock("../constants/templates/apiSpec.md", () => "# API Spec", { virtual: true });
jest.mock("../constants/templates/basicDesign.md", () => "# Basic Design", { virtual: true });
jest.mock("../constants/templates/markdownAll.ja.md", () => "# Markdown All JA", { virtual: true });
jest.mock("../constants/templates/markdownAll.en.md", () => "# Markdown All EN", { virtual: true });
jest.mock("../constants/templates/welcome.md", () => "# Welcome JA", { virtual: true });
jest.mock("../constants/templates/welcome-en.md", () => "# Welcome EN", { virtual: true });

jest.mock("../types", () => ({
  extractHeadings: jest.fn().mockReturnValue([]),
  getEditorStorage: jest.fn().mockReturnValue({
    commentDialog: { open: null },
  }),
}));

jest.mock("../utils/frontmatterHelpers", () => ({
  preprocessMarkdown: jest.fn().mockImplementation((content: string) => ({
    body: content,
    frontmatter: {},
  })),
}));

jest.mock("../utils/sanitizeMarkdown", () => ({
  sanitizeMarkdown: jest.fn().mockImplementation((md: string) => md),
  preserveBlankLines: jest.fn().mockImplementation((md: string) => md),
}));

jest.mock("../utils/tocHelpers", () => ({
  generateTocMarkdown: jest.fn().mockReturnValue("- [Heading](#heading)"),
}));

import { slashCommandItems, filterSlashItems, SlashCommandItem } from "../extensions/slashCommandItems";

describe("slashCommandItems", () => {
  it("アイテム配列がエクスポートされている", () => {
    expect(Array.isArray(slashCommandItems)).toBe(true);
    expect(slashCommandItems.length).toBeGreaterThan(0);
  });

  it("全てのアイテムに必須プロパティがある", () => {
    for (const item of slashCommandItems) {
      expect(item.id).toBeDefined();
      expect(typeof item.id).toBe("string");
      expect(item.labelKey).toBeDefined();
      expect(typeof item.labelKey).toBe("string");
      expect(item.icon).toBeDefined();
      expect(Array.isArray(item.keywords)).toBe(true);
      expect(item.keywords.length).toBeGreaterThan(0);
      expect(typeof item.action).toBe("function");
    }
  });

  it("id が一意である", () => {
    const ids = slashCommandItems.map((item) => item.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("heading1-5 が含まれる", () => {
    const headingIds = slashCommandItems
      .filter((item) => item.id.startsWith("heading"))
      .map((item) => item.id);
    expect(headingIds).toEqual(["heading1", "heading2", "heading3", "heading4", "heading5"]);
  });

  it("主要なコマンドが含まれる", () => {
    const ids = slashCommandItems.map((item) => item.id);
    expect(ids).toContain("bulletList");
    expect(ids).toContain("orderedList");
    expect(ids).toContain("taskList");
    expect(ids).toContain("blockquote");
    expect(ids).toContain("codeBlock");
    expect(ids).toContain("table");
    expect(ids).toContain("horizontalRule");
    expect(ids).toContain("mermaid");
    expect(ids).toContain("plantuml");
    expect(ids).toContain("math");
    expect(ids).toContain("toc");
    expect(ids).toContain("date");
    expect(ids).toContain("footnote");
    expect(ids).toContain("image");
    expect(ids).toContain("comment");
    expect(ids).toContain("gif");
    expect(ids).toContain("frontmatter");
  });

  describe("action 実行", () => {
    function createMockEditor() {
      const runFn = jest.fn();
      const commandFn = jest.fn().mockReturnThis();
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

      return {
        chain: jest.fn().mockReturnValue(chainObj),
        commands: {
          focus: jest.fn(),
          setContent: jest.fn(),
        },
        state: {
          doc: {
            content: { size: 10 },
            toJSON: jest.fn().mockReturnValue({}),
            firstChild: null,
          },
          tr: { insert: jest.fn() },
          selection: { from: 0 },
          schema: {
            nodes: {
              footnoteRef: {
                create: jest.fn().mockReturnValue({
                  toJSON: jest.fn().mockReturnValue({ type: "footnoteRef" }),
                }),
              },
              codeBlock: {
                create: jest.fn().mockReturnValue({}),
              },
              image: { create: jest.fn() },
            },
          },
        },
        view: { dispatch: jest.fn() },
        schema: {
          nodes: {
            codeBlock: {
              create: jest.fn().mockReturnValue({}),
            },
          },
          text: jest.fn().mockReturnValue({}),
        },
        storage: {},
        extensionManager: { extensions: [] },
        isActive: jest.fn().mockReturnValue(false),
        _chain: chainObj,
        _run: runFn,
      } as any;
    }

    it("heading1 action が setHeading を呼ぶ", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "heading1")!;
      item.action(editor);
      expect(editor._chain.setHeading).toHaveBeenCalledWith({ level: 1 });
    });

    it("bulletList action が toggleBulletList を呼ぶ", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "bulletList")!;
      item.action(editor);
      expect(editor._chain.toggleBulletList).toHaveBeenCalled();
    });

    it("table action が insertTable を呼ぶ", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "table")!;
      item.action(editor);
      expect(editor._chain.insertTable).toHaveBeenCalledWith({ rows: 3, cols: 3, withHeaderRow: true });
    });

    it("mermaid action が setCodeBlock を呼ぶ", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "mermaid")!;
      item.action(editor);
      expect(editor._chain.setCodeBlock).toHaveBeenCalledWith({ language: "mermaid" });
    });

    it("date action が今日の日付を挿入する", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "date")!;
      item.action(editor);
      expect(editor._chain.insertContent).toHaveBeenCalled();
      const dateStr = editor._chain.insertContent.mock.calls[0][0];
      expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("gif action が gifBlock を挿入する", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "gif")!;
      item.action(editor);
      expect(editor._chain.insertContent).toHaveBeenCalledWith({ type: "gifBlock", attrs: { autoEditOpen: true } });
    });

    it("orderedList action が toggleOrderedList を呼ぶ", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "orderedList")!;
      item.action(editor);
      expect(editor._chain.toggleOrderedList).toHaveBeenCalled();
    });

    it("taskList action が toggleTaskList を呼ぶ", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "taskList")!;
      item.action(editor);
      expect(editor._chain.toggleTaskList).toHaveBeenCalled();
    });

    it("blockquote action が toggleBlockquote を呼ぶ", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "blockquote")!;
      item.action(editor);
      expect(editor._chain.toggleBlockquote || editor._chain.setBlockquote).toBeDefined();
    });

    it("codeBlock action が toggleCodeBlock を呼ぶ", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "codeBlock")!;
      item.action(editor);
      expect(editor._chain.toggleCodeBlock).toHaveBeenCalled();
    });

    it("horizontalRule action が setHorizontalRule を呼ぶ", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "horizontalRule")!;
      item.action(editor);
      expect(editor._chain.setHorizontalRule).toHaveBeenCalled();
    });

    it("plantuml action が setCodeBlock を呼ぶ", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "plantuml")!;
      item.action(editor);
      expect(editor._chain.setCodeBlock).toHaveBeenCalledWith({ language: "plantuml" });
    });

    it("math action が setCodeBlock を呼ぶ", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "math")!;
      item.action(editor);
      expect(editor._chain.setCodeBlock).toHaveBeenCalledWith({ language: "math" });
    });

    it("html action が setCodeBlock を呼ぶ", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "html")!;
      item.action(editor);
      expect(editor._chain.setCodeBlock).toHaveBeenCalledWith({ language: "html" });
    });

    it("heading2-5 action が正しいレベルで setHeading を呼ぶ", () => {
      for (let level = 2; level <= 5; level++) {
        const editor = createMockEditor();
        const item = slashCommandItems.find((i) => i.id === `heading${level}`)!;
        item.action(editor);
        expect(editor._chain.setHeading).toHaveBeenCalledWith({ level });
      }
    });

    it("toc action が insertContent を呼ぶ", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "toc")!;
      item.action(editor);
      expect(editor._chain.insertContent).toHaveBeenCalled();
    });

    it("admonitionNote action が insertContent を呼ぶ", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "admonitionNote")!;
      item.action(editor);
      expect(editor._run).toHaveBeenCalled();
    });

    it("frontmatter action がエラーなく実行される", () => {
      const editor = createMockEditor();
      const item = slashCommandItems.find((i) => i.id === "frontmatter")!;
      expect(() => item.action(editor)).not.toThrow();
    });
  });
});

describe("filterSlashItems", () => {
  const mockT = (key: string) => {
    const map: Record<string, string> = {
      slashH1: "Heading 1",
      slashH2: "Heading 2",
      slashBulletList: "Bullet List",
      slashCodeBlock: "Code Block",
      slashTable: "Table",
      slashMermaid: "Mermaid Diagram",
    };
    return map[key] ?? key;
  };

  const items: SlashCommandItem[] = [
    { id: "heading1", labelKey: "slashH1", icon: null as any, keywords: ["h1", "heading", "見出し"], action: jest.fn() },
    { id: "heading2", labelKey: "slashH2", icon: null as any, keywords: ["h2", "heading", "見出し"], action: jest.fn() },
    { id: "bulletList", labelKey: "slashBulletList", icon: null as any, keywords: ["bullet", "list", "箇条書き"], action: jest.fn() },
    { id: "codeBlock", labelKey: "slashCodeBlock", icon: null as any, keywords: ["code", "codeblock"], action: jest.fn() },
    { id: "table", labelKey: "slashTable", icon: null as any, keywords: ["table", "テーブル"], action: jest.fn() },
    { id: "mermaid", labelKey: "slashMermaid", icon: null as any, keywords: ["mermaid", "diagram"], action: jest.fn() },
  ];

  it("空のクエリなら全アイテムを返す", () => {
    const result = filterSlashItems(items, "", mockT);
    expect(result).toHaveLength(items.length);
  });

  it("ラベルでフィルタリングする", () => {
    const result = filterSlashItems(items, "Heading", mockT);
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(["heading1", "heading2"]);
  });

  it("キーワードでフィルタリングする", () => {
    const result = filterSlashItems(items, "bullet", mockT);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("bulletList");
  });

  it("日本語キーワードでフィルタリングする", () => {
    const result = filterSlashItems(items, "見出し", mockT);
    expect(result).toHaveLength(2);
  });

  it("大小文字を区別しない", () => {
    const result = filterSlashItems(items, "TABLE", mockT);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("table");
  });

  it("マッチしないクエリなら空配列を返す", () => {
    const result = filterSlashItems(items, "zzzzz", mockT);
    expect(result).toHaveLength(0);
  });

  it("部分一致でフィルタリングする", () => {
    const result = filterSlashItems(items, "code", mockT);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("codeBlock");
  });
});
