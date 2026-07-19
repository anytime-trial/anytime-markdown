// Phase 6 S5-B: Bus Factor Score（属人度）の算出（FR-28 / FR-29）。
import { computeBusFactor, normalizeAuthor } from '../computeBusFactor';
import type { FileAuthorCommitRow } from '../types';

function rows(...triples: readonly (readonly [string, string, string])[]): FileAuthorCommitRow[] {
  return triples.map(([filePath, author, commitHash]) => ({ filePath, author, commitHash }));
}

describe('normalizeAuthor', () => {
  test('前後空白除去と小文字化のみ行う', () => {
    expect(normalizeAuthor('  Taro Yamada ')).toBe('taro yamada');
    expect(normalizeAuthor('TARO YAMADA')).toBe('taro yamada');
  });

  test('別表記（ドット区切り）は名寄せしない（メール列が無く判定不能なため）', () => {
    expect(normalizeAuthor('taro.yamada')).not.toBe(normalizeAuthor('taro yamada'));
  });
});

describe('computeBusFactor', () => {
  test('単独著者は score 1.0・実効著者数 1', () => {
    const [entry] = computeBusFactor(
      rows(
        ['a.ts', 'taro', 'c1'],
        ['a.ts', 'taro', 'c2'],
        ['a.ts', 'taro', 'c3'],
        ['a.ts', 'taro', 'c4'],
        ['a.ts', 'taro', 'c5'],
      ),
      { minCommits: 5 },
    );
    expect(entry.unitId).toBe('a.ts');
    expect(entry.totalCommits).toBe(5);
    expect(entry.authorCount).toBe(1);
    expect(entry.topAuthor).toBe('taro');
    expect(entry.score).toBe(1);
    expect(entry.effectiveAuthors).toBeCloseTo(1, 6);
  });

  test('均等な 2 著者は score 0.5・実効著者数 2', () => {
    const [entry] = computeBusFactor(
      rows(
        ['a.ts', 'taro', 'c1'],
        ['a.ts', 'taro', 'c2'],
        ['a.ts', 'hanako', 'c3'],
        ['a.ts', 'hanako', 'c4'],
      ),
      { minCommits: 4 },
    );
    expect(entry.score).toBeCloseTo(0.5, 6);
    expect(entry.authorCount).toBe(2);
    expect(entry.effectiveAuthors).toBeCloseTo(2, 6);
  });

  test('同じ実効比率でも著者数が違えば effectiveAuthors で区別できる', () => {
    const twoAuthors = computeBusFactor(
      rows(
        ['a.ts', 'taro', 'c1'],
        ['a.ts', 'taro', 'c2'],
        ['a.ts', 'taro', 'c3'],
        ['a.ts', 'taro', 'c4'],
        ['a.ts', 'hanako', 'c5'],
      ),
      { minCommits: 5 },
    )[0];
    const manyAuthors = computeBusFactor(
      rows(
        ['b.ts', 'taro', 'c1'],
        ['b.ts', 'taro', 'c2'],
        ['b.ts', 'taro', 'c3'],
        ['b.ts', 'taro', 'c4'],
        ['b.ts', 'jiro', 'c5'],
        ['b.ts', 'saburo', 'c6'],
        ['b.ts', 'shiro', 'c7'],
        ['b.ts', 'goro', 'c8'],
      ),
      { minCommits: 5 },
    )[0];
    expect(twoAuthors.score).toBeCloseTo(0.8, 6);
    expect(manyAuthors.score).toBeCloseTo(0.5, 6);
    expect(manyAuthors.effectiveAuthors).toBeGreaterThan(twoAuthors.effectiveAuthors);
  });

  test('minCommits 未満の単位は score が null（1 コミットで 1.0 になる偽陽性を防ぐ）', () => {
    const [entry] = computeBusFactor(rows(['a.ts', 'taro', 'c1']), { minCommits: 5 });
    expect(entry.totalCommits).toBe(1);
    expect(entry.score).toBeNull();
    expect(entry.topAuthor).toBe('taro');
  });

  test('同一コミットが複数行で現れても 1 コミットとして数える（FR-29）', () => {
    // 同一 commit が複数セッションに紐づくと JOIN で重複行になる
    const [entry] = computeBusFactor(
      rows(
        ['a.ts', 'taro', 'c1'],
        ['a.ts', 'taro', 'c1'],
        ['a.ts', 'taro', 'c1'],
        ['a.ts', 'hanako', 'c2'],
      ),
      { minCommits: 2 },
    );
    expect(entry.totalCommits).toBe(2);
    expect(entry.score).toBeCloseTo(0.5, 6);
  });

  test('著者名の表記ゆれ（大文字・前後空白）は同一著者として数える', () => {
    const [entry] = computeBusFactor(
      rows(
        ['a.ts', 'Taro', 'c1'],
        ['a.ts', ' taro ', 'c2'],
        ['a.ts', 'TARO', 'c3'],
      ),
      { minCommits: 2 },
    );
    expect(entry.authorCount).toBe(1);
    expect(entry.score).toBe(1);
  });

  test('空著者は除外する（取込漏れ行を主著者にしない）', () => {
    const [entry] = computeBusFactor(
      rows(
        ['a.ts', '', 'c1'],
        ['a.ts', 'taro', 'c2'],
        ['a.ts', 'taro', 'c3'],
      ),
      { minCommits: 2 },
    );
    expect(entry.authorCount).toBe(1);
    expect(entry.totalCommits).toBe(2);
  });

  test('複数ファイルは属人度の降順で返る', () => {
    const entries = computeBusFactor(
      rows(
        ['shared.ts', 'taro', 'c1'],
        ['shared.ts', 'hanako', 'c2'],
        ['owned.ts', 'taro', 'c3'],
        ['owned.ts', 'taro', 'c4'],
      ),
      { minCommits: 2 },
    );
    expect(entries.map((e) => e.unitId)).toEqual(['owned.ts', 'shared.ts']);
  });

  test('入力が空なら空配列', () => {
    expect(computeBusFactor([], {})).toEqual([]);
  });

  test('unitsOf で C4 要素へ写すと、著者×コミットを合算してから score を再計算する', () => {
    // 2 ファイルはそれぞれ単独著者（score 1.0）だが、束ねた要素では 2 著者になる
    const entries = computeBusFactor(
      rows(
        ['x/a.ts', 'taro', 'c1'],
        ['x/a.ts', 'taro', 'c2'],
        ['x/b.ts', 'hanako', 'c3'],
        ['x/b.ts', 'hanako', 'c4'],
      ),
      { minCommits: 2, unitsOf: () => ['pkg_x'] },
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].unitId).toBe('pkg_x');
    expect(entries[0].totalCommits).toBe(4);
    expect(entries[0].authorCount).toBe(2);
    expect(entries[0].score).toBeCloseTo(0.5, 6);
  });

  test('unitsOf が同一コミットを複数単位へ写しても、単位ごとに 1 回だけ数える', () => {
    const entries = computeBusFactor(rows(['x/a.ts', 'taro', 'c1'], ['x/a.ts', 'taro', 'c1']), {
      minCommits: 1,
      unitsOf: () => ['pkg_x', 'pkg_x/inner'],
    });
    expect(entries.every((e) => e.totalCommits === 1)).toBe(true);
    expect(entries).toHaveLength(2);
  });

  test('unitsOf が空配列を返すファイルは集計から落ちる', () => {
    const entries = computeBusFactor(rows(['x/a.ts', 'taro', 'c1']), { unitsOf: () => [] });
    expect(entries).toEqual([]);
  });

  test('minCommits 既定値は 5', () => {
    const [entry] = computeBusFactor(
      rows(
        ['a.ts', 'taro', 'c1'],
        ['a.ts', 'taro', 'c2'],
        ['a.ts', 'taro', 'c3'],
        ['a.ts', 'taro', 'c4'],
      ),
      {},
    );
    expect(entry.score).toBeNull();
  });
});
