/**
 * @jest-environment jsdom
 */
import { applyWebviewTheme } from '../webviewTheme';
import { applyEditorThemeCssVars } from '@anytime-markdown/markdown-viewer';

/**
 * webview の CSP（`style-src ${webview.cspSource} 'unsafe-inline'`）は外部 CDN を許可しない。
 * `applyEditorThemeCssVars` へ `loadGoogleFonts: false` を渡し忘れると Google Fonts の
 * `<link>` が注入され、実行時に必ず CSP でブロックされる（実機で発生した経緯がある）。
 *
 * この「渡し忘れ」は型では防げない（省略しても既定値 true で通る）ため、
 * **呼び出し側の引数そのもの**をここで固定する。共有関数側の単体テスト
 * （markdown-viewer の applyEditorThemeCssVars.googleFonts.test.ts）は
 * フラグの効果を検証するもので、渡し忘れは検知できない。
 */
jest.mock('@anytime-markdown/markdown-viewer', () => ({
  applyEditorThemeCssVars: jest.fn(),
  DEFAULT_DARK_BG: '#1e1e1e',
  DEFAULT_LIGHT_BG: '#ffffff',
}));

const applyEditorThemeCssVarsMock = applyEditorThemeCssVars as jest.MockedFunction<
  typeof applyEditorThemeCssVars
>;

describe('applyWebviewTheme', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');
  });

  it('Google Fonts を読み込まない指定で applyEditorThemeCssVars を呼ぶ', () => {
    applyWebviewTheme('handwritten', 'dark');

    expect(applyEditorThemeCssVarsMock).toHaveBeenCalledTimes(1);
    expect(applyEditorThemeCssVarsMock).toHaveBeenCalledWith(
      expect.objectContaining({ loadGoogleFonts: false }),
    );
  });

  it('プリセットとテーマモードをそのまま渡す', () => {
    applyWebviewTheme('professional', 'light');

    expect(applyEditorThemeCssVarsMock).toHaveBeenCalledWith(
      expect.objectContaining({ presetName: 'professional', themeMode: 'light' }),
    );
  });

  it('dark では body 背景と colorScheme を dark 側にする', () => {
    applyWebviewTheme('handwritten', 'dark');

    expect(document.body.style.backgroundColor).not.toBe('');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.body.style.margin).toBe('0px');
  });

  it('light では colorScheme を light 側にする', () => {
    applyWebviewTheme('handwritten', 'light');

    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});
