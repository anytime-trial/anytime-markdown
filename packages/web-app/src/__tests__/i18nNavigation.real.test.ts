/**
 * i18n/navigation の実モジュール（next-intl の createNavigation）に対するテスト。
 *
 * 他のスイートは moduleNameMapper で navigation をモックへ差し替えるため、
 * 「/en から辿ったリンクがロケールを保つ」ことを誰も検証していない状態だった。
 * ここだけは実物を通す。
 *
 * Why not: import パスに '../i18n/navigation' を使わない。それは jest.config.js の
 * moduleNameMapper（`^(\.{1,2}/)+i18n/navigation$`）に一致してモックへ差し替わるため、
 * このテストが検証対象を失う。'../../src/i18n/navigation' は同じファイルを指しつつ
 * パターンに一致しない。
 */
import { getPathname } from '../../src/i18n/navigation';

describe('i18n/navigation (実モジュール)', () => {
  it('既定ロケール（ja）はプレフィックスを付けない', () => {
    expect(getPathname({ href: '/markdown', locale: 'ja' })).toBe('/markdown');
  });

  it('en は /en 配下へ解決する', () => {
    expect(getPathname({ href: '/markdown', locale: 'en' })).toBe('/en/markdown');
  });

  it('ルートも en では /en になる（/en/ にはしない）', () => {
    expect(getPathname({ href: '/', locale: 'en' })).toBe('/en');
  });

  it('クエリ付きの href でもロケールプレフィックスを付ける', () => {
    expect(getPathname({ href: { pathname: '/report', query: { page: '2' } }, locale: 'en' })).toBe(
      '/en/report?page=2',
    );
  });
});
