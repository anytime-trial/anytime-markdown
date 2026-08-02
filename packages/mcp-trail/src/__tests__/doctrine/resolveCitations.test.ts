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

const DOCTRINE_BODY = [
  '# 設計哲学・製品原則',
  '',
  '## 概要',
  '',
  '概要節の文は条項ブロックの外にある。',
  '',
  '## 原則',
  '',
  '### 承認済みの条項',
  '',
  '- 確度: 原則',
  '- 状態: 暗黙',
  '- 承認: canon（2026-08-02 / 承認者: ユーザー）',
  '- 主張: 承認済み条項の主張である。',
  '',
  '### 未承認の条項',
  '',
  '- 確度: 仮説',
  '- 状態: 暗黙',
  '- 主張: 承認行を持たない条項の主張である。',
].join('\n');

const CLAUDE_MD_BODY = ['# CLAUDE.md', '', '広域 add は禁止する。'].join('\n');
const SPEC_BODY = ['# 要件定義書', '', '要件書の本文は条項ではない。'].join('\n');

describe('resolveCitations — 承認状態（DCT-3）', () => {
  const reader = makeReader({
    '/docs/spec/92.doctrine/principles.ja.md': DOCTRINE_BODY,
    '/anytime-markdown/CLAUDE.md': CLAUDE_MD_BODY,
    '/docs/spec/00.requirements/trail-doctrine-requirements.ja.md': SPEC_BODY,
  });

  function doctrineCitation(quote: string): DoctrineCitation {
    return { docPath: '/docs/spec/92.doctrine/principles.ja.md', section: '原則', quote };
  }

  it('canon 条項からの引用は approval=canon', () => {
    const [result] = resolveCitations([doctrineCitation('承認済み条項の主張である。')], reader);
    expect(result).toMatchObject({ resolved: true, approval: 'canon' });
  });

  it('承認行を持たない条項からの引用は approval=draft（fail-closed 既定）', () => {
    const [result] = resolveCitations(
      [doctrineCitation('承認行を持たない条項の主張である。')],
      reader,
    );
    expect(result).toMatchObject({ resolved: true, approval: 'draft' });
  });

  it('条項ブロックの外（概要節）からの引用は approval=draft', () => {
    const [result] = resolveCitations(
      [doctrineCitation('概要節の文は条項ブロックの外にある。')],
      reader,
    );
    expect(result).toMatchObject({ resolved: true, approval: 'draft' });
  });

  it('明文規約文書（CLAUDE.md）からの引用は approval=canon_by_document', () => {
    const [result] = resolveCitations(
      [{ docPath: '/anytime-markdown/CLAUDE.md', section: '広域 add 禁止', quote: '広域 add は禁止する。' }],
      reader,
    );
    expect(result).toMatchObject({ resolved: true, approval: 'canon_by_document' });
  });

  it('ドクトリンでも明文規約でもない文書からの引用は approval=unknown', () => {
    const [result] = resolveCitations(
      [
        {
          docPath: '/docs/spec/00.requirements/trail-doctrine-requirements.ja.md',
          section: '2.1',
          quote: '要件書の本文は条項ではない。',
        },
      ],
      reader,
    );
    expect(result).toMatchObject({ resolved: true, approval: 'unknown' });
  });

  it('逐語一致しない引用は resolved=false かつ approval=unknown（両者は独立）', () => {
    const [result] = resolveCitations([doctrineCitation('この条項は存在しない。')], reader);
    expect(result).toMatchObject({ resolved: false, reason: 'quote_not_found', approval: 'unknown' });
  });
});
