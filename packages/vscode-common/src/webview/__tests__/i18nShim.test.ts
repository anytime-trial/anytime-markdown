import { createNextIntlShim } from '../i18nShim';

const ja = {
  tickets: {
    status: { backlog: 'バックログ' },
    board: { cardAriaLabel: 'チケット {id} {title}' },
    common: { minutes: '{minutes} 分' },
  },
};
const en = {
  tickets: {
    status: { backlog: 'Backlog' },
    board: { cardAriaLabel: 'Ticket {id} {title}' },
    common: { minutes: '{minutes} min' },
  },
};

describe('createNextIntlShim', () => {
  it('ネストしたメッセージをドット区切りキーで解決する', () => {
    const shim = createNextIntlShim({ ja, en }, 'en');
    shim.setLocale('ja');
    expect(shim.useTranslations('tickets')('status.backlog')).toBe('バックログ');
  });

  it('{name} プレースホルダを values で補間する', () => {
    const shim = createNextIntlShim({ ja, en }, 'en');
    shim.setLocale('ja');
    const t = shim.useTranslations('tickets');
    expect(t('board.cardAriaLabel', { id: 'T-1024', title: '認証修正' })).toBe(
      'チケット T-1024 認証修正',
    );
    expect(t('common.minutes', { minutes: 30 })).toBe('30 分');
  });

  it('未知のロケールでは fallback ロケールのメッセージを使う', () => {
    const shim = createNextIntlShim({ ja, en }, 'en');
    shim.setLocale('fr');
    expect(shim.useTranslations('tickets')('status.backlog')).toBe('Backlog');
  });

  it('値を渡さなければプレースホルダをそのまま残す（欠落を可視化する）', () => {
    const shim = createNextIntlShim({ ja, en }, 'en');
    shim.setLocale('en');
    expect(shim.useTranslations('tickets')('board.cardAriaLabel')).toBe('Ticket {id} {title}');
  });

  it('フラットなメッセージ（既存形式）も従来どおり解決する', () => {
    const flat = { ns: { greeting: 'hello' } };
    const shim = createNextIntlShim({ en: flat }, 'en');
    expect(shim.useTranslations('ns')('greeting')).toBe('hello');
  });

  it('未定義キーはキー文字列を返す（生キー表示の回帰検知）', () => {
    const shim = createNextIntlShim({ ja, en }, 'en');
    shim.setLocale('ja');
    expect(shim.useTranslations('tickets')('status.nonexistent')).toBe('status.nonexistent');
  });
});
