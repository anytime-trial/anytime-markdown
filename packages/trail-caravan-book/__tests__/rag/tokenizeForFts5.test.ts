import { tokenizeForFts5 } from '../../src/rag/tokenizeForFts5';

describe('tokenizeForFts5', () => {
  test('単一トークンは "token" で包む', () => {
    expect(tokenizeForFts5('foo')).toBe('"foo"');
  });

  test('スペース区切りは OR 連結', () => {
    expect(tokenizeForFts5('foo bar')).toBe('"foo" OR "bar"');
  });

  test('quoted phrase はそのまま 1 つのフレーズとして扱う', () => {
    expect(tokenizeForFts5('"foo bar"')).toBe('"foo bar"');
  });

  test('quoted phrase と単独トークンの混在', () => {
    expect(tokenizeForFts5('"foo bar" baz')).toBe('"foo bar" OR "baz"');
  });

  test('FTS5 予約文字 (* ^ ( ) :) はエスケープ (除去)', () => {
    expect(tokenizeForFts5('foo* bar^')).toBe('"foo" OR "bar"');
    expect(tokenizeForFts5('(foo) baz:qux')).toBe('"foo" OR "bazqux"');
  });

  test('全角空白を半角に正規化', () => {
    expect(tokenizeForFts5('foo　bar')).toBe('"foo" OR "bar"');
  });

  test('空入力は空文字', () => {
    expect(tokenizeForFts5('')).toBe('');
    expect(tokenizeForFts5('   ')).toBe('');
    expect(tokenizeForFts5('　　')).toBe('');
  });

  test('1 文字トークンは除外', () => {
    expect(tokenizeForFts5('a foo')).toBe('"foo"');
    expect(tokenizeForFts5('a b c')).toBe('');
  });

  test('内部のダブルクォートは除去 (FTS5 構文を壊さない)', () => {
    expect(tokenizeForFts5('foo"bar')).toBe('"foobar"');
  });

  test('前後の空白は trim', () => {
    expect(tokenizeForFts5('  foo bar  ')).toBe('"foo" OR "bar"');
  });
});
