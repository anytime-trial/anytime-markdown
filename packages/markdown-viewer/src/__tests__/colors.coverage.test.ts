/**
 * constants/colors.ts のカバレッジテスト
 * 未カバー関数: getEditorBg, getEditDialogBg, getEditorText, getTextPrimary, getTextSecondary, getTextDisabled,
 *              getBgPaper, getActionHover, getActionSelected, getDivider,
 *              getPrimaryMain, getPrimaryDark, getPrimaryLight, getPrimaryContrast,
 *              getErrorMain, getWarningMain, getWarningLight, getSuccessMain, getGrey,
 *              getInfoMain, getErrorBg, getWarningBg, getSuccessBg, getInfoBg
 */
import {
  getEditorBg, getEditDialogBg, getEditorText,
  getTextPrimary, getTextSecondary, getTextDisabled,
  getBgPaper, getActionHover, getActionSelected, getDivider,
  getPrimaryMain, getPrimaryDark, getPrimaryLight, getPrimaryContrast,
  getErrorMain, getWarningMain, getWarningLight, getSuccessMain,
  getGrey, getInfoMain, getErrorBg, getWarningBg, getSuccessBg, getInfoBg,
  DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, DEFAULT_DARK_TEXT, DEFAULT_LIGHT_TEXT,
  DARK_TEXT_PRIMARY, LIGHT_TEXT_PRIMARY, DARK_TEXT_SECONDARY, LIGHT_TEXT_SECONDARY,
  DARK_TEXT_DISABLED, LIGHT_TEXT_DISABLED,
  DARK_BG_PAPER, LIGHT_BG_PAPER, DARK_ACTION_HOVER, LIGHT_ACTION_HOVER,
  DARK_ACTION_SELECTED, LIGHT_ACTION_SELECTED, DARK_DIVIDER, LIGHT_DIVIDER,
  DARK_PRIMARY_MAIN, LIGHT_PRIMARY_MAIN, DARK_PRIMARY_DARK, LIGHT_PRIMARY_DARK,
  DARK_PRIMARY_LIGHT, LIGHT_PRIMARY_LIGHT, DARK_PRIMARY_CONTRAST, LIGHT_PRIMARY_CONTRAST,
  DARK_ERROR_MAIN, LIGHT_ERROR_MAIN, DARK_WARNING_MAIN, LIGHT_WARNING_MAIN,
  DARK_WARNING_LIGHT, LIGHT_WARNING_LIGHT, DARK_SUCCESS_MAIN, LIGHT_SUCCESS_MAIN,
  DARK_INFO_MAIN, LIGHT_INFO_MAIN,
  DARK_ERROR_BG, LIGHT_ERROR_BG, DARK_WARNING_BG, LIGHT_WARNING_BG,
  DARK_SUCCESS_BG, LIGHT_SUCCESS_BG, DARK_INFO_BG, LIGHT_INFO_BG,
  alpha,
} from "../constants/colors";

describe("colors helper functions", () => {
  describe("getEditorBg", () => {
    it("returns dark bg by default", () => {
      expect(getEditorBg(true)).toBe(DEFAULT_DARK_BG);
    });
    it("returns light bg by default", () => {
      expect(getEditorBg(false)).toBe(DEFAULT_LIGHT_BG);
    });
    it("returns custom dark bg from settings", () => {
      expect(getEditorBg(true, { darkBgColor: "#111", lightBgColor: "" })).toBe("#111");
    });
    it("returns custom light bg from settings", () => {
      expect(getEditorBg(false, { darkBgColor: "", lightBgColor: "#eee" })).toBe("#eee");
    });
    it("falls back when settings have empty string", () => {
      expect(getEditorBg(true, { darkBgColor: "", lightBgColor: "" })).toBe(DEFAULT_DARK_BG);
      expect(getEditorBg(false, { darkBgColor: "", lightBgColor: "" })).toBe(DEFAULT_LIGHT_BG);
    });
  });

  describe("getEditDialogBg", () => {
    it("returns grey.50 when editorBg is grey and light mode", () => {
      expect(getEditDialogBg(false, { editorBg: "grey" })).toBe("grey.50");
    });
    it("returns undefined when editorBg is grey but dark mode", () => {
      expect(getEditDialogBg(true, { editorBg: "grey" })).toBeUndefined();
    });
    it("returns undefined when editorBg is not grey", () => {
      expect(getEditDialogBg(false, { editorBg: "white" as any })).toBeUndefined();
    });
    it("returns undefined without settings", () => {
      expect(getEditDialogBg(false)).toBeUndefined();
    });
  });

  describe("getEditorText", () => {
    it("returns dark text by default", () => {
      expect(getEditorText(true)).toBe(DEFAULT_DARK_TEXT);
    });
    it("returns light text by default", () => {
      expect(getEditorText(false)).toBe(DEFAULT_LIGHT_TEXT);
    });
    it("returns custom dark text from settings", () => {
      expect(getEditorText(true, { darkTextColor: "#fff", lightTextColor: "" })).toBe("#fff");
    });
    it("returns custom light text from settings", () => {
      expect(getEditorText(false, { darkTextColor: "", lightTextColor: "#000" })).toBe("#000");
    });
  });

  describe("getTextPrimary", () => {
    it("dark", () => expect(getTextPrimary(true)).toBe(DARK_TEXT_PRIMARY));
    it("light", () => expect(getTextPrimary(false)).toBe(LIGHT_TEXT_PRIMARY));
  });

  describe("getTextSecondary", () => {
    it("dark", () => expect(getTextSecondary(true)).toBe(DARK_TEXT_SECONDARY));
    it("light", () => expect(getTextSecondary(false)).toBe(LIGHT_TEXT_SECONDARY));
  });

  describe("getTextDisabled", () => {
    it("dark", () => expect(getTextDisabled(true)).toBe(DARK_TEXT_DISABLED));
    it("light", () => expect(getTextDisabled(false)).toBe(LIGHT_TEXT_DISABLED));
  });

  describe("getBgPaper", () => {
    it("dark", () => expect(getBgPaper(true)).toBe(DARK_BG_PAPER));
    it("light", () => expect(getBgPaper(false)).toBe(LIGHT_BG_PAPER));
  });

  describe("getActionHover", () => {
    it("dark", () => expect(getActionHover(true)).toBe(DARK_ACTION_HOVER));
    it("light", () => expect(getActionHover(false)).toBe(LIGHT_ACTION_HOVER));
  });

  describe("getActionSelected", () => {
    it("dark", () => expect(getActionSelected(true)).toBe(DARK_ACTION_SELECTED));
    it("light", () => expect(getActionSelected(false)).toBe(LIGHT_ACTION_SELECTED));
  });

  describe("getDivider", () => {
    it("dark", () => expect(getDivider(true)).toBe(DARK_DIVIDER));
    it("light", () => expect(getDivider(false)).toBe(LIGHT_DIVIDER));
  });

  describe("getPrimaryMain", () => {
    it("dark", () => expect(getPrimaryMain(true)).toBe(DARK_PRIMARY_MAIN));
    it("light", () => expect(getPrimaryMain(false)).toBe(LIGHT_PRIMARY_MAIN));
  });

  describe("getPrimaryDark", () => {
    it("dark", () => expect(getPrimaryDark(true)).toBe(DARK_PRIMARY_DARK));
    it("light", () => expect(getPrimaryDark(false)).toBe(LIGHT_PRIMARY_DARK));
  });

  describe("getPrimaryLight", () => {
    it("dark", () => expect(getPrimaryLight(true)).toBe(DARK_PRIMARY_LIGHT));
    it("light", () => expect(getPrimaryLight(false)).toBe(LIGHT_PRIMARY_LIGHT));
  });

  describe("getPrimaryContrast", () => {
    it("dark", () => expect(getPrimaryContrast(true)).toBe(DARK_PRIMARY_CONTRAST));
    it("light", () => expect(getPrimaryContrast(false)).toBe(LIGHT_PRIMARY_CONTRAST));
  });

  describe("getErrorMain", () => {
    it("dark", () => expect(getErrorMain(true)).toBe(DARK_ERROR_MAIN));
    it("light", () => expect(getErrorMain(false)).toBe(LIGHT_ERROR_MAIN));
  });

  describe("getWarningMain", () => {
    it("dark", () => expect(getWarningMain(true)).toBe(DARK_WARNING_MAIN));
    it("light", () => expect(getWarningMain(false)).toBe(LIGHT_WARNING_MAIN));
  });

  describe("getWarningLight", () => {
    it("dark", () => expect(getWarningLight(true)).toBe(DARK_WARNING_LIGHT));
    it("light", () => expect(getWarningLight(false)).toBe(LIGHT_WARNING_LIGHT));
  });

  describe("getSuccessMain", () => {
    it("dark", () => expect(getSuccessMain(true)).toBe(DARK_SUCCESS_MAIN));
    it("light", () => expect(getSuccessMain(false)).toBe(LIGHT_SUCCESS_MAIN));
  });

  describe("getGrey", () => {
    it("returns correct shade 100", () => {
      expect(getGrey(true, 100)).toBe("#f5f5f5");
      expect(getGrey(false, 100)).toBe("#f5f5f5");
    });
    it("returns correct shade 300", () => {
      expect(getGrey(true, 300)).toBe("#e0e0e0");
    });
    it("returns correct shade 900", () => {
      expect(getGrey(true, 900)).toBe("#212121");
    });
  });

  describe("getInfoMain", () => {
    it("dark", () => expect(getInfoMain(true)).toBe(DARK_INFO_MAIN));
    it("light", () => expect(getInfoMain(false)).toBe(LIGHT_INFO_MAIN));
  });

  describe("getErrorBg", () => {
    it("dark", () => expect(getErrorBg(true)).toBe(DARK_ERROR_BG));
    it("light", () => expect(getErrorBg(false)).toBe(LIGHT_ERROR_BG));
  });

  describe("getWarningBg", () => {
    it("dark", () => expect(getWarningBg(true)).toBe(DARK_WARNING_BG));
    it("light", () => expect(getWarningBg(false)).toBe(LIGHT_WARNING_BG));
  });

  describe("getSuccessBg", () => {
    it("dark", () => expect(getSuccessBg(true)).toBe(DARK_SUCCESS_BG));
    it("light", () => expect(getSuccessBg(false)).toBe(LIGHT_SUCCESS_BG));
  });

  describe("getInfoBg", () => {
    it("dark", () => expect(getInfoBg(true)).toBe(DARK_INFO_BG));
    it("light", () => expect(getInfoBg(false)).toBe(LIGHT_INFO_BG));
  });
});

describe("alpha", () => {
  it("converts 6-digit hex to rgba (matches MUI alpha output)", () => {
    expect(alpha("#f44336", 0.35)).toBe("rgba(244, 67, 54, 0.35)");
    expect(alpha("#6B2A20", 0.35)).toBe("rgba(107, 42, 32, 0.35)");
  });
  it("expands 3-digit hex", () => {
    expect(alpha("#abc", 0.5)).toBe("rgba(170, 187, 204, 0.5)");
  });
  it("multiplies existing alpha of 8-digit hex", () => {
    expect(alpha("#ffffff80", 0.5)).toBe("rgba(255, 255, 255, 0.251)");
  });
  it("multiplies existing alpha of rgba() input", () => {
    expect(alpha("rgba(10, 20, 30, 0.8)", 0.5)).toBe("rgba(10, 20, 30, 0.4)");
  });
  it("applies opacity to rgb() input", () => {
    expect(alpha("rgb(10, 20, 30)", 0.25)).toBe("rgba(10, 20, 30, 0.25)");
  });
  it("clamps opacity to [0,1]", () => {
    expect(alpha("#000000", 2)).toBe("rgba(0, 0, 0, 1)");
    expect(alpha("#000000", -1)).toBe("rgba(0, 0, 0, 0)");
  });
  it("returns input unchanged when uninterpretable", () => {
    expect(alpha("currentColor", 0.5)).toBe("currentColor");
  });
});
