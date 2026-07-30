import {
  applyEditorThemeCssVars,
  DEFAULT_DARK_BG,
  DEFAULT_LIGHT_BG,
  type ThemePresetName,
} from '@anytime-markdown/markdown-viewer';

/**
 * webview のテーマ（CSS 変数 + body 背景）を反映する。MUI ThemeProvider/CssBaseline の置換。
 *
 * app.ts へ直接書かず独立モジュールにしているのは、**「webview では Google Fonts を読まない」
 * という不変条件をテストで守るため**である。app.ts は 742 行あり、トップレベルで
 * `getVsCodeApi()`（`acquireVsCodeApi()`）を呼ぶため jest から import できない。
 * ここに切り出すことで、`loadGoogleFonts: false` が渡ることを単体テストで固定できる。
 *
 * Why not: webview では Google Fonts を読まない。webview の CSP は
 * `style-src ${webview.cspSource} 'unsafe-inline'` で外部 CDN を許可しておらず、
 * 読み込もうとしても必ずブロックされる（実機で確認）。CSP を緩めて外部 CDN を
 * 許可する選択もあるが、webview は拡張ホスト経由のローカル資産で完結させる方針
 * （default-src 'none' / localResourceRoots）と反し、オフラインでも失敗し続ける。
 * プリセットのフォントはシステムフォントへフォールバックさせる。
 */
export function applyWebviewTheme(
  presetName: ThemePresetName,
  themeMode: 'light' | 'dark',
): void {
  applyEditorThemeCssVars({ presetName, themeMode, loadGoogleFonts: false });
  document.body.style.margin = '0';
  document.body.style.backgroundColor = themeMode === 'dark' ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG;
  document.documentElement.style.colorScheme = themeMode;
}
