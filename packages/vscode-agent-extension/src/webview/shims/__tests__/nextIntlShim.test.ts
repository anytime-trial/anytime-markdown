import { setLocale, useLocale, useTranslations } from '../next-intl';

/**
 * 既知の罠（memory: vanilla-ui-conventions 系事例と同種）: フォールバックが効くため
 * 未解決キーでも例外を投げず「生キー表示」に静かに劣化する。型検査では検知できない
 * ため、実際に日本語文字列が返ることをここで実測する。
 */
describe('next-intl shim (webview)', () => {
  afterEach(() => {
    setLocale('en');
  });

  it('setLocale("ja") 後、useTranslations("tickets") が入れ子キーの日本語訳を返す', () => {
    setLocale('ja');
    const t = useTranslations('tickets');
    expect(t('status.backlog')).toBe('バックログ');
  });

  it('生キーがそのまま返らない', () => {
    setLocale('ja');
    const t = useTranslations('tickets');
    expect(t('status.backlog')).not.toBe('status.backlog');
  });

  it('ICU 風の {placeholder} 補間が機能する', () => {
    setLocale('ja');
    const t = useTranslations('tickets');
    expect(t('board.cardAriaLabel', { id: 'T-1', title: '調査' })).toBe('チケット T-1 調査');
  });

  it('未知のロケールにフォールバックしない範囲では既定ロケール(en)の訳を返す', () => {
    const t = useTranslations('tickets');
    expect(t('status.backlog')).toBe('Backlog');
  });

  it('useLocale は setLocale で切り替えた値を返す', () => {
    expect(useLocale()).toBe('en');
    setLocale('ja');
    expect(useLocale()).toBe('ja');
  });
});
