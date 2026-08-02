import { applyEditorThemeCssVars } from "../utils/applyEditorThemeCssVars";

/**
 * webview（VS Code 拡張）は CSP `style-src ${webview.cspSource} 'unsafe-inline'` の下で動き、
 * 外部 CDN のスタイルシートを読めない。Google Fonts の `<link>` を注入すると必ず
 * ブロックされるため、ホスト側が `loadGoogleFonts: false` で無効化できる必要がある。
 *
 * この分岐は型では守れず（`boolean` を渡し忘れても既定値で通る）、実機で初めて
 * CSP 違反として表面化した経緯があるため、両分岐を実測で固定する。
 */
const FONT_LINK_ID = "google-fonts-preset";

function fontLink(): HTMLLinkElement | null {
  return document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
}

describe("applyEditorThemeCssVars の Google Fonts 注入", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("loadGoogleFonts: false なら外部スタイルシートを注入しない", () => {
    applyEditorThemeCssVars({
      presetName: "professional",
      themeMode: "light",
      loadGoogleFonts: false,
    });

    expect(fontLink()).toBeNull();
    expect(document.head.innerHTML).not.toContain("fonts.googleapis.com");
  });

  it("既定（未指定）では注入する（web アプリ向けの従来挙動）", () => {
    applyEditorThemeCssVars({ presetName: "professional", themeMode: "light" });

    const link = fontLink();
    expect(link).not.toBeNull();
    expect(link?.href).toContain("fonts.googleapis.com");
  });

  it("注入しない場合でもテーマの CSS 変数は適用される（フォント以外は縮退しない）", () => {
    applyEditorThemeCssVars({
      presetName: "professional",
      themeMode: "light",
      loadGoogleFonts: false,
    });

    // プリセットのフォント指定自体は CSS 変数として残り、
    // 実際の描画はシステムフォントへフォールバックする。
    const fontFamily = document.documentElement.style.getPropertyValue("--editor-content-font-family");
    expect(fontFamily).not.toBe("");
  });

  it("true → false と切り替えると既存の link を残さない", () => {
    applyEditorThemeCssVars({ presetName: "professional", themeMode: "light" });
    expect(fontLink()).not.toBeNull();

    applyEditorThemeCssVars({
      presetName: "professional",
      themeMode: "light",
      loadGoogleFonts: false,
    });

    expect(fontLink()).toBeNull();
  });
});
