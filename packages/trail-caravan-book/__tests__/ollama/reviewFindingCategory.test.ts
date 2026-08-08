import {
  buildReviewCategoryPrompt,
  CATEGORIES,
} from '../../src/ollama/prompts/reviewFindingCategory';

describe('buildReviewCategoryPrompt', () => {
  it('システムプロンプトとカテゴリ一覧が含まれる', () => {
    const prompt = buildReviewCategoryPrompt({ text: 'Some finding text' });
    expect(prompt).toContain('コードレビュー所見を分類するアナリスト');
    expect(prompt).toContain('design');
    expect(prompt).toContain('security');
    expect(prompt).toContain('logic');
    expect(prompt).toContain('other');
  });

  it('所見テキストが最後に含まれる', () => {
    const text = 'NULL参照の可能性がある';
    const prompt = buildReviewCategoryPrompt({ text });
    expect(prompt).toContain(text);
    expect(prompt).toContain('所見テキスト:');
  });

  it('chapter 指定時に「チャプター: ...」行が挿入される', () => {
    const prompt = buildReviewCategoryPrompt({
      text: 'ボタンの色が仕様に違反している',
      chapter: 'UIデザイン規約',
    });
    expect(prompt).toContain('チャプター: UIデザイン規約');
  });

  it('chapter 未指定時にチャプター行が含まれない', () => {
    const prompt = buildReviewCategoryPrompt({ text: 'some text' });
    expect(prompt).not.toContain('チャプター:');
  });

  it('JSON形式の指示が含まれる (category と confidence キーの言及)', () => {
    const prompt = buildReviewCategoryPrompt({ text: 'some text' });
    expect(prompt).toContain('"category"');
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('JSON');
  });

  it('chapter が空文字列の場合はチャプター行を出力しない', () => {
    const prompt = buildReviewCategoryPrompt({ text: 'some text', chapter: '' });
    // empty string はfalsy扱い → チャプター行なし
    expect(prompt).not.toContain('チャプター:');
  });
});

describe('CATEGORIES', () => {
  it('8カテゴリを含む', () => {
    expect(CATEGORIES).toHaveLength(8);
  });

  it('design, a11y, security, perf, naming, spec, logic, other を含む', () => {
    const categorySet = new Set<string>(CATEGORIES);
    expect(categorySet.has('design')).toBe(true);
    expect(categorySet.has('a11y')).toBe(true);
    expect(categorySet.has('security')).toBe(true);
    expect(categorySet.has('perf')).toBe(true);
    expect(categorySet.has('naming')).toBe(true);
    expect(categorySet.has('spec')).toBe(true);
    expect(categorySet.has('logic')).toBe(true);
    expect(categorySet.has('other')).toBe(true);
  });
});
