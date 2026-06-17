import { messagesByLocale } from '../i18n/messages';

/**
 * クライアント（LocaleProvider）とサーバー（request.ts）が参照する単一メッセージ源の回帰テスト。
 * 過去、PrivacyServices 名前空間がクライアント側のマージから漏れてランタイムで
 * MISSING_MESSAGE になった。名前空間の追加漏れ・ja/en ドリフトを検出する。
 */
describe('i18n messagesByLocale', () => {
  test('ja / en に PrivacyServices 名前空間が含まれる', () => {
    expect(messagesByLocale.ja.PrivacyServices?.title).toBeTruthy();
    expect(messagesByLocale.en.PrivacyServices?.title).toBeTruthy();
  });

  test('ja と en のトップレベル名前空間が一致する（ドリフト検出）', () => {
    const jaKeys = Object.keys(messagesByLocale.ja).sort();
    const enKeys = Object.keys(messagesByLocale.en).sort();
    expect(jaKeys).toEqual(enKeys);
  });

  test('press 名前空間も両ロケールに存在する', () => {
    expect(messagesByLocale.ja.press).toBeDefined();
    expect(messagesByLocale.en.press).toBeDefined();
  });
});
