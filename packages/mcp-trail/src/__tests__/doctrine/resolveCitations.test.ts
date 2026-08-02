import { resolveCitations, type DoctrineCitation } from '../../doctrine/resolveCitations';

const DOC_BODY = [
  '# 設計原則',
  '',
  '## エラー処理',
  '',
  'ゲートは fail-closed、記録は fail-open とする。',
  '複数行に  またがる   規範文も引用対象になる。',
].join('\n');

function makeReader(files: Record<string, string>): (path: string) => string | null {
  return (path) => (path in files ? files[path] : null);
}

describe('resolveCitations', () => {
  const reader = makeReader({ '/docs/spec/92.doctrine/principles.ja.md': DOC_BODY });

  function citation(overrides: Partial<DoctrineCitation> = {}): DoctrineCitation {
    return {
      docPath: '/docs/spec/92.doctrine/principles.ja.md',
      section: 'エラー処理',
      quote: 'ゲートは fail-closed、記録は fail-open とする。',
      ...overrides,
    };
  }

  it('実在文書に逐語一致する引用を resolved=true で返す', () => {
    const [result] = resolveCitations([citation()], reader);
    expect(result).toMatchObject({ resolved: true, reason: 'ok' });
  });

  it('存在しない文書パスは file_not_found', () => {
    const [result] = resolveCitations([citation({ docPath: '/docs/nowhere.md' })], reader);
    expect(result).toMatchObject({ resolved: false, reason: 'file_not_found' });
  });

  it('本文に無い引用文は quote_not_found', () => {
    const [result] = resolveCitations([citation({ quote: 'この規範は存在しない。' })], reader);
    expect(result).toMatchObject({ resolved: false, reason: 'quote_not_found' });
  });

  it('空白の揺れ（改行・連続空白）は正規化して一致させる', () => {
    const [result] = resolveCitations(
      [citation({ quote: '複数行に またがる 規範文も引用対象になる。' })],
      reader,
    );
    expect(result).toMatchObject({ resolved: true, reason: 'ok' });
  });

  it('空の引用文は quote_not_found（解決不能）', () => {
    const [result] = resolveCitations([citation({ quote: '   ' })], reader);
    expect(result).toMatchObject({ resolved: false, reason: 'quote_not_found' });
  });

  it('複数引用は入力順を保って個別判定する', () => {
    const results = resolveCitations(
      [citation(), citation({ docPath: '/docs/nowhere.md' })],
      reader,
    );
    expect(results.map((r) => r.resolved)).toEqual([true, false]);
  });
});
