import { splitIdentifierSubtokens } from '../identifierTokens';

describe('splitIdentifierSubtokens', () => {
  it('camelCase を語へ分割し小文字化する', () => {
    expect(splitIdentifierSubtokens('useBlockAlignment')).toEqual(['use', 'block', 'alignment']);
  });

  it('PascalCase を分割する', () => {
    expect(splitIdentifierSubtokens('CaravanApiHandler')).toEqual(['caravan', 'api', 'handler']);
  });

  it('大文字の連続（略語）を 1 語として保つ', () => {
    expect(splitIdentifierSubtokens('HTTPServer')).toEqual(['http', 'server']);
  });

  it('snake_case を分割する', () => {
    expect(splitIdentifierSubtokens('caravan_search_events')).toEqual(['caravan', 'search', 'events']);
  });

  it('kebab-case を分割する', () => {
    expect(splitIdentifierSubtokens('trail-caravan-book')).toEqual(['trail', 'caravan', 'book']);
  });

  it('パス・拡張子を区切りとして分割し、各セグメントも再分割する', () => {
    expect(splitIdentifierSubtokens('packages/markdown-editor/src/useBlockAlignment.ts')).toEqual([
      'packages',
      'markdown',
      'editor',
      'src',
      'use',
      'block',
      'alignment',
      'ts',
    ]);
  });

  it('数字境界で分割する', () => {
    expect(splitIdentifierSubtokens('sha256sum')).toEqual(['sha', '256', 'sum']);
  });

  it('長さ 2 未満のサブトークンは出力しない', () => {
    // 'S3776' → ['s', '3776'] の 's' は落ちる
    expect(splitIdentifierSubtokens('S3776')).toEqual(['3776']);
  });

  it('分割点が無い（元文字列と同一になる）場合は空を返す', () => {
    expect(splitIdentifierSubtokens('alignment')).toEqual([]);
    expect(splitIdentifierSubtokens('Alignment')).toEqual([]);
  });

  it('重複サブトークンは 1 回だけ出力する', () => {
    expect(splitIdentifierSubtokens('test_test-Test')).toEqual(['test']);
  });

  it('非 ASCII（日本語）は分割しない', () => {
    expect(splitIdentifierSubtokens('知識グラフ')).toEqual([]);
  });

  it('日本語と識別子の混在はセグメント単位で扱う', () => {
    // 区切り文字で切った ASCII セグメントだけが分割対象
    expect(splitIdentifierSubtokens('検索/searchEvents')).toEqual(['search', 'events']);
  });

  it('空文字・空白のみは空を返す', () => {
    expect(splitIdentifierSubtokens('')).toEqual([]);
    expect(splitIdentifierSubtokens('   ')).toEqual([]);
  });
});
