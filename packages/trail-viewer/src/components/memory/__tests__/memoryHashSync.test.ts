/**
 * `#memory/<tab>` の解釈。実装（memoryPanel の export）をそのまま検査する。
 * ここで正規表現を書き写すと、実装だけ変わってもテストが通り続ける（検査しないテストになる）。
 */
import { parseHashSubTab } from '../../../views/memory/memoryPanel';

describe('parseHashSubTab', () => {
  it('returns runs for #memory/runs', () => {
    expect(parseHashSubTab('#memory/runs')).toBe('runs');
  });

  it.each(['#memory/drift', '#memory/bug', '#memory/review'])(
    'returns null for %s（Flight Record へ移設済み。既定タブへ落とす）',
    (hash) => {
      expect(parseHashSubTab(hash)).toBeNull();
    },
  );

  it('returns null for empty hash', () => {
    expect(parseHashSubTab('')).toBeNull();
  });

  it('returns null for unrelated hash', () => {
    expect(parseHashSubTab('#analytics')).toBeNull();
  });

  it('returns null for partial match', () => {
    expect(parseHashSubTab('#memory/')).toBeNull();
  });

  it('ignores query params after tab name', () => {
    expect(parseHashSubTab('#memory/runs?foo=bar')).toBe('runs');
  });
});
