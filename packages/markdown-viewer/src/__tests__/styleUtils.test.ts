import { getBaseStyles } from "../styles/baseStyles";
import { getBlockStyles } from "../styles/blockStyles";
import { getCodeStyles } from "../styles/codeStyles";
import { getHeadingStyles } from "../styles/headingStyles";
import { getInlineStyles } from "../styles/inlineStyles";
import { getEditorPaperSx } from "../styles/editorStyles";
import type { EditorSettings } from "../useEditorSettings";

const defaultSettings: EditorSettings = {
  fontSize: 16,
  lineHeight: 1.8,
  tableWidth: "auto" as const,
  editorBg: "white" as const,
  spellCheck: false,
  paperSize: "off" as const,
  paperMargin: 20,
  darkBgColor: "",
  lightBgColor: "",
  darkTextColor: "",
  lightTextColor: "",
  blockAlign: "left" as const,
  wordBreak: "keep-all" as const,
};

describe("getBaseStyles", () => {
  test("ライトテーマでオブジェクトを返す", () => {
    const result = getBaseStyles(false);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("ダークテーマでオブジェクトを返す", () => {
    const result = getBaseStyles(true);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("readonlyModeオプションを受け付ける", () => {
    const result = getBaseStyles(false, { readonlyMode: true });
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });
});

describe("getBlockStyles", () => {
  test("ライトテーマでオブジェクトを返す", () => {
    const result = getBlockStyles(false, defaultSettings);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("ダークテーマでオブジェクトを返す", () => {
    const result = getBlockStyles(true, defaultSettings);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("テーブルとイメージのスタイルを含む", () => {
    const result = getBlockStyles(false, defaultSettings) as Record<string, unknown>;
    expect(result).toHaveProperty("& table");
    expect(result).toHaveProperty("& img");
  });
});

describe("getCodeStyles", () => {
  test("ライトテーマでオブジェクトを返す", () => {
    const result = getCodeStyles(false);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("ダークテーマでオブジェクトを返す", () => {
    const result = getCodeStyles(true);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("codeとpreのスタイルを含む", () => {
    const result = getCodeStyles(false) as Record<string, unknown>;
    expect(result).toHaveProperty("& code");
    expect(result).toHaveProperty("& pre");
  });
});

describe("getHeadingStyles", () => {
  test("ライトテーマでオブジェクトを返す", () => {
    const result = getHeadingStyles(false);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("ダークテーマでオブジェクトを返す", () => {
    const result = getHeadingStyles(true);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("h1〜h3のスタイルを含む", () => {
    const result = getHeadingStyles(false) as Record<string, unknown>;
    expect(result).toHaveProperty("& h1");
    expect(result).toHaveProperty("& h2");
    expect(result).toHaveProperty("& h3");
  });
});

describe("getInlineStyles", () => {
  test("ライトテーマでオブジェクトを返す", () => {
    const result = getInlineStyles(false);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("ダークテーマでオブジェクトを返す", () => {
    const result = getInlineStyles(true);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("リンクのスタイルを含む", () => {
    const result = getInlineStyles(false) as Record<string, unknown>;
    expect(result).toHaveProperty("& a");
  });
});

describe("getEditorPaperSx", () => {
  test("ライトテーマでオブジェクトを返す", () => {
    const result = getEditorPaperSx(false, defaultSettings, 600);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("ダークテーマでオブジェクトを返す", () => {
    const result = getEditorPaperSx(true, defaultSettings, 600);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("paperSize A4でmaxWidthを含む", () => {
    const a4Settings = { ...defaultSettings, paperSize: "A4" as const };
    const result = getEditorPaperSx(false, a4Settings, 600) as Record<string, Record<string, unknown>>;
    expect(result["& .tiptap"]).toHaveProperty("maxWidth");
  });

  test("readonlyModeオプションを受け付ける", () => {
    const result = getEditorPaperSx(false, defaultSettings, 600, { readonlyMode: true });
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("noScrollオプションでoverflowYがvisibleになる", () => {
    const result = getEditorPaperSx(false, defaultSettings, 600, { noScroll: true }) as Record<string, Record<string, unknown>>;
    expect(result["& .tiptap"]).toHaveProperty("overflowY", "visible");
  });

  test("blockAlign center で textAlign スタイルが含まれる", () => {
    const centerSettings = { ...defaultSettings, blockAlign: "center" as const };
    const result = getEditorPaperSx(false, centerSettings, 600) as Record<string, Record<string, unknown>>;
    const tiptap = result["& .tiptap"] as Record<string, unknown>;
    // blockAlign !== 'left' adds image/block wrapper styles
    const key = Object.keys(tiptap).find(k => k.includes("image-node-wrapper"));
    expect(key).toBeDefined();
  });

  test("ダークテーマ + paperSize A4 で用紙スタイルが含まれる", () => {
    const a4Settings = { ...defaultSettings, paperSize: "A4" as const };
    const result = getEditorPaperSx(true, a4Settings, 600) as Record<string, Record<string, unknown>>;
    expect(result["& .tiptap"]).toHaveProperty("mx", "auto");
  });
});
