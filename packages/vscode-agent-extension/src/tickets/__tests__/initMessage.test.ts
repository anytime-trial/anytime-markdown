import { isInitMessage } from '../../webview/tickets/initMessage';

describe('isInitMessage', () => {
  it('type/source/currentUser/locale が正しい形の値を init メッセージとして受理する', () => {
    expect(
      isInitMessage({
        type: 'init',
        source: { label: 'owner/repo / main' },
        currentUser: 'octocat',
        locale: 'ja',
      }),
    ).toBe(true);
  });

  it('source が null、currentUser 省略でも受理する', () => {
    expect(isInitMessage({ type: 'init', source: null, locale: 'en' })).toBe(true);
  });

  it('type が init 以外なら拒否する', () => {
    expect(isInitMessage({ type: 'rpcResult', source: null, locale: 'en' })).toBe(false);
  });

  it('source が label を持たないオブジェクトなら拒否する', () => {
    expect(isInitMessage({ type: 'init', source: { label: 123 }, locale: 'en' })).toBe(false);
  });

  it('source が文字列や配列など object 以外なら拒否する', () => {
    expect(isInitMessage({ type: 'init', source: 'owner/repo', locale: 'en' })).toBe(false);
    expect(isInitMessage({ type: 'init', source: ['owner/repo'], locale: 'en' })).toBe(false);
  });

  it('locale が string でなければ拒否する', () => {
    expect(isInitMessage({ type: 'init', source: null, locale: 42 })).toBe(false);
  });

  it('locale が欠けていれば拒否する', () => {
    expect(isInitMessage({ type: 'init', source: null })).toBe(false);
  });

  it('currentUser が string でも undefined でもなければ拒否する', () => {
    expect(isInitMessage({ type: 'init', source: null, locale: 'en', currentUser: 42 })).toBe(false);
  });

  it('null・配列・プリミティブは拒否する', () => {
    expect(isInitMessage(null)).toBe(false);
    expect(isInitMessage(undefined)).toBe(false);
    expect(isInitMessage([])).toBe(false);
    expect(isInitMessage('init')).toBe(false);
  });
});
