import { createTheme } from "@mui/material";
import { getBaseStyles } from "../styles/baseStyles";
import { getBlockStyles } from "../styles/blockStyles";
import { getCodeStyles } from "../styles/codeStyles";
import { getHeadingStyles } from "../styles/headingStyles";
import { getInlineStyles } from "../styles/inlineStyles";
import { getEditorPaperSx } from "../styles/editorStyles";
import type { EditorSettings } from "../useEditorSettings";

const lightTheme = createTheme({ palette: { mode: "light" } });
const darkTheme = createTheme({ palette: { mode: "dark" } });

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
};

describe("getBaseStyles", () => {
  test("ライトテーマでオブジェクトを返す", () => {
    const result = getBaseStyles(lightTheme);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("ダークテーマでオブジェクトを返す", () => {
    const result = getBaseStyles(darkTheme);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("readonlyModeオプションを受け付ける", () => {
    const result = getBaseStyles(lightTheme, { readonlyMode: true });
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });
});

describe("getBlockStyles", () => {
  test("ライトテーマでオブジェクトを返す", () => {
    const result = getBlockStyles(lightTheme, defaultSettings);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("ダークテーマでオブジェクトを返す", () => {
    const result = getBlockStyles(darkTheme, defaultSettings);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("テーブルとイメージのスタイルを含む", () => {
    const result = getBlockStyles(lightTheme, defaultSettings) as Record<string, unknown>;
    expect(result).toHaveProperty("& table");
    expect(result).toHaveProperty("& img");
  });
});

describe("getCodeStyles", () => {
  test("ライトテーマでオブジェクトを返す", () => {
    const result = getCodeStyles(lightTheme);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("ダークテーマでオブジェクトを返す", () => {
    const result = getCodeStyles(darkTheme);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("codeとpreのスタイルを含む", () => {
    const result = getCodeStyles(lightTheme) as Record<string, unknown>;
    expect(result).toHaveProperty("& code");
    expect(result).toHaveProperty("& pre");
  });
});

describe("getHeadingStyles", () => {
  test("ライトテーマでオブジェクトを返す", () => {
    const result = getHeadingStyles(lightTheme);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("ダークテーマでオブジェクトを返す", () => {
    const result = getHeadingStyles(darkTheme);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("h1〜h3のスタイルを含む", () => {
    const result = getHeadingStyles(lightTheme) as Record<string, unknown>;
    expect(result).toHaveProperty("& h1");
    expect(result).toHaveProperty("& h2");
    expect(result).toHaveProperty("& h3");
  });
});

describe("getInlineStyles", () => {
  test("ライトテーマでオブジェクトを返す", () => {
    const result = getInlineStyles(lightTheme);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("ダークテーマでオブジェクトを返す", () => {
    const result = getInlineStyles(darkTheme);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("リンクのスタイルを含む", () => {
    const result = getInlineStyles(lightTheme) as Record<string, unknown>;
    expect(result).toHaveProperty("& a");
  });
});

describe("getEditorPaperSx", () => {
  test("ライトテーマでオブジェクトを返す", () => {
    const result = getEditorPaperSx(lightTheme, defaultSettings, 600);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("ダークテーマでオブジェクトを返す", () => {
    const result = getEditorPaperSx(darkTheme, defaultSettings, 600);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("paperSize A4でmaxWidthを含む", () => {
    const a4Settings = { ...defaultSettings, paperSize: "A4" as const };
    const result = getEditorPaperSx(lightTheme, a4Settings, 600) as Record<string, Record<string, unknown>>;
    expect(result["& .tiptap"]).toHaveProperty("maxWidth");
  });

  test("readonlyModeオプションを受け付ける", () => {
    const result = getEditorPaperSx(lightTheme, defaultSettings, 600, { readonlyMode: true });
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  test("noScrollオプションでoverflowYがvisibleになる", () => {
    const result = getEditorPaperSx(lightTheme, defaultSettings, 600, { noScroll: true }) as Record<string, Record<string, unknown>>;
    expect(result["& .tiptap"]).toHaveProperty("overflowY", "visible");
  });

  test("blockAlign center で textAlign スタイルが含まれる", () => {
    const centerSettings = { ...defaultSettings, blockAlign: "center" as const };
    const result = getEditorPaperSx(lightTheme, centerSettings, 600) as Record<string, Record<string, unknown>>;
    const tiptap = result["& .tiptap"] as Record<string, unknown>;
    // blockAlign !== 'left' adds image/block wrapper styles
    const key = Object.keys(tiptap).find(k => k.includes("image-node-wrapper"));
    expect(key).toBeDefined();
  });

  test("ダークテーマ + paperSize A4 で用紙スタイルが含まれる", () => {
    const a4Settings = { ...defaultSettings, paperSize: "A4" as const };
    const result = getEditorPaperSx(darkTheme, a4Settings, 600) as Record<string, Record<string, unknown>>;
    expect(result["& .tiptap"]).toHaveProperty("mx", "auto");
  });
});
