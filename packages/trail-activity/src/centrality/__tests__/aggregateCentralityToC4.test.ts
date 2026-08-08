import { aggregateCentralityToC4 } from '../aggregateCentralityToC4';
import type { C4Element } from '../../domain/engine/c4Mapper';

// mapFilesToC4Elements の Strategy 2 (package_fallback):
//   'packages/foo/src/a.ts' → elementId 'pkg_foo'
// を利用するため、C4Element の id を 'pkg_foo' で定義する。

const pkgElement: C4Element = {
  id: 'pkg_foo',
  type: 'container',
  name: 'Foo Package',
};

const systemElement: C4Element = {
  id: 'sys_root',
  type: 'system',
  name: 'Root System',
};

describe('aggregateCentralityToC4', () => {
  it('fileScores 空で {} を返す', () => {
    const result = aggregateCentralityToC4({}, [pkgElement]);
    expect(result).toEqual({});
  });

  it('1 ファイル / 1 コンポーネント要素で score 100', () => {
    const result = aggregateCentralityToC4(
      { 'packages/foo/src/a.ts': 5 },
      [pkgElement],
    );
    expect(result).toEqual({ 'pkg_foo': 100 });
  });

  it('2 ファイル → 1 要素配下なら sum で集約 (1 要素しかないので 100)', () => {
    const result = aggregateCentralityToC4(
      {
        'packages/foo/src/a.ts': 3,
        'packages/foo/src/b.ts': 7,
      },
      [pkgElement],
    );
    // sum = 3 + 7 = 10, max = 10 → normalized = 100
    expect(result).toEqual({ 'pkg_foo': 100 });
  });

  it('system 要素はキーに含まれない', () => {
    const result = aggregateCentralityToC4(
      { 'packages/foo/src/a.ts': 5 },
      [pkgElement, systemElement],
    );
    expect(Object.keys(result)).not.toContain('sys_root');
    expect(result['pkg_foo']).toBe(100);
  });
});
