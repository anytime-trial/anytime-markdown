import { THEME_PRESETS } from "../constants/themePresets";
import { applyEditorThemeCssVars } from "../utils/applyEditorThemeCssVars";

/**
 * 見出し書体はプリセットの displayFont で決まる（design.md §3.1）。
 * 以前は handwritten だけが変数を設定し、professional では変数を消していたため、
 * 見出しが editorContentCss のフォールバック `monospace` で描画されていた。
 */
function headingFont(): string {
  return document.documentElement.style.getPropertyValue("--editor-heading-font-family");
}

describe("applyEditorThemeCssVars の見出し書体", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it.each(["professional", "handwritten"] as const)("%s はプリセットの displayFont を見出しに使う", (presetName) => {
    applyEditorThemeCssVars({ presetName, themeMode: "light", loadGoogleFonts: false });

    expect(headingFont()).toBe(THEME_PRESETS[presetName].displayFont);
  });

  it("handwritten から professional へ切り替えても見出し書体が消えない", () => {
    applyEditorThemeCssVars({ presetName: "handwritten", themeMode: "dark", loadGoogleFonts: false });
    applyEditorThemeCssVars({ presetName: "professional", themeMode: "dark", loadGoogleFonts: false });

    expect(headingFont()).toBe(THEME_PRESETS.professional.displayFont);
    expect(headingFont()).not.toContain("monospace");
  });
});
