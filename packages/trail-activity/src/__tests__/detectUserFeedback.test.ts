import { detectUserFeedback } from '../domain/usecase/DetectUserFeedback';

describe('detectUserFeedback', () => {
  it.each([
    ['やり直してください', 'やり直し'],
    ['さっきの変更をやりなおしして', 'やり直し'],
    ['仕様が違うので修正して', '違う'],
    ['A ではなく B で実装して', 'ではなく'],
    ['さっきのファイルを元に戻して', '戻して'],
    ['この実装は間違いです', '間違'],
    ['Please revert the last change', 'revert'],
  ])('修正指示「%s」をパターン %s として検知する', (prompt, expected) => {
    expect(detectUserFeedback(prompt)?.matchedPattern).toBe(expected);
  });

  it('日本語直後でも latin 単語境界が成立する（revert が和文中でも検知される）', () => {
    expect(detectUserFeedback('この変更はrevertして')?.matchedPattern).toBe('revert');
  });

  it('非該当プロンプトは null', () => {
    expect(detectUserFeedback('新しいページを追加してください')).toBeNull();
    expect(detectUserFeedback('テストを実行して')).toBeNull();
    expect(detectUserFeedback('')).toBeNull();
  });

  it('revertonly のような部分一致は検知しない（latin は単語境界）', () => {
    expect(detectUserFeedback('use revertonly mode')).toBeNull();
  });
});
