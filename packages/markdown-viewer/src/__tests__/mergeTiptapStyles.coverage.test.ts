/**
 * mergeTiptapStyles.ts coverage tests
 * showHoverLabels option と isDark のバリエーションを網羅する。
 */
import { createTheme } from "@mui/material/styles";

import { getMergeTiptapStyles } from "../components/mergeTiptapStyles";
import { DEFAULT_SETTINGS } from "../useEditorSettings";

const lightTheme = createTheme({ palette: { mode: "light" } });
const darkTheme = createTheme({ palette: { mode: "dark" } });

describe("getMergeTiptapStyles", () => {
  it("returns styles without showHoverLabels (default)", () => {
    const result = getMergeTiptapStyles(lightTheme, DEFAULT_SETTINGS);
    expect(result).toBeDefined();
    expect(result["& .tiptap"]).toBeDefined();
  });

  it("includes heading block labels when showHoverLabels=true (light)", () => {
    const result = getMergeTiptapStyles(lightTheme, DEFAULT_SETTINGS, { showHoverLabels: true });
    const tiptap = result["& .tiptap"] as Record<string, any>;
    // 見出し装飾（getHeadingStyles）が合成されている
    expect(tiptap["& h1"]).toBeDefined();
    expect(tiptap["& h1"]["&::before"]).toBeDefined();
    // showHoverLabels=true ではラベル非表示の上書きが入らない
    const hideKey = Object.keys(tiptap).find((k) => k.includes("::before") && k.includes("& li::before"));
    expect(hideKey).toBeUndefined();
  });

  it("hides block labels when showHoverLabels=false", () => {
    const result = getMergeTiptapStyles(darkTheme, DEFAULT_SETTINGS, { showHoverLabels: false });
    const tiptap = result["& .tiptap"] as Record<string, any>;
    const hideKey = Object.keys(tiptap).find((k) => k.includes("& li::before"));
    expect(hideKey).toBeDefined();
    expect(tiptap[hideKey as string].display).toContain("none");
  });

  it("composes code styles in dark mode", () => {
    const result = getMergeTiptapStyles(darkTheme, DEFAULT_SETTINGS, { showHoverLabels: true });
    const tiptap = result["& .tiptap"] as Record<string, any>;
    expect(tiptap["& code"]).toBeDefined();
    expect(tiptap["& pre"]).toBeDefined();
  });

  it("uses settings fontSize and lineHeight", () => {
    const result = getMergeTiptapStyles(lightTheme, { ...DEFAULT_SETTINGS, fontSize: 18, lineHeight: 2.0 });
    const tiptap = result["& .tiptap"] as Record<string, any>;
    expect(tiptap.fontSize).toBe("18px");
    expect(tiptap.lineHeight).toBe(2.0);
  });
});
