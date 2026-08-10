import { tokenizeForFts5 } from '../tokenizeForFts5';

describe('tokenizeForFts5', () => {
  it('語彙トークンを OR で結ぶ（既存挙動・不変）', () => {
    expect(tokenizeForFts5('hello world')).toBe('"hello" OR "world"');
  });

  it('引用フレーズはそのまま保ち、サブトークン展開しない（既存挙動・不変）', () => {
    expect(tokenizeForFts5('"foo bar"')).toBe('"foo bar"');
  });

  it('空・空白のみは空文字を返す（既存挙動・不変）', () => {
    expect(tokenizeForFts5('')).toBe('');
    expect(tokenizeForFts5('  ')).toBe('');
  });

  it('識別子形トークンへ分割サブトークンを OR 追加する（B1）', () => {
    expect(tokenizeForFts5('blockAlignment')).toBe('"blockAlignment" OR "block" OR "alignment"');
  });

  it('snake_case も展開する（B1）', () => {
    expect(tokenizeForFts5('caravan_search_events')).toBe(
      '"caravan_search_events" OR "caravan" OR "search" OR "events"',
    );
  });

  it('パス形トークンを展開する（B1）', () => {
    expect(tokenizeForFts5('src/useBlockAlignment.ts')).toBe(
      '"src/useBlockAlignment.ts" OR "src" OR "use" OR "block" OR "alignment" OR "ts"',
    );
  });

  it('日本語と識別子の混在はそれぞれの挙動を保つ（B1）', () => {
    expect(tokenizeForFts5('修正 blockAlignment')).toBe(
      '"修正" OR "blockAlignment" OR "block" OR "alignment"',
    );
  });

  it('分割点の無い語は展開しない（B1）', () => {
    expect(tokenizeForFts5('alignment')).toBe('"alignment"');
  });

  it('重複するサブトークンは 1 回だけ出力する（B1）', () => {
    expect(tokenizeForFts5('searchEvents search')).toBe('"searchEvents" OR "search" OR "events"');
  });
});
