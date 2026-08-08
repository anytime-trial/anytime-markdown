import { buildSizeMatrix } from '../buildSizeMatrix';
import type { SizeFileEntry } from '../buildSizeMatrix';
import type { C4Element } from '../../types';

const entry = (
  elementId: string,
  lineCount: number,
  functionCount: number,
): SizeFileEntry => ({ elementId, lineCount, functionCount });

const elements: readonly C4Element[] = [
  { id: 'pkg_a', name: 'a', type: 'container' },
  { id: 'comp_x', name: 'x', type: 'component', boundaryId: 'pkg_a' },
  { id: 'file::packages/a/foo.ts', name: 'foo.ts', type: 'code', boundaryId: 'comp_x' },
  { id: 'file::packages/a/bar.ts', name: 'bar.ts', type: 'code', boundaryId: 'comp_x' },
];

const sizeEntries: readonly SizeFileEntry[] = [
  entry('file::packages/a/foo.ts', 100, 5),
  entry('file::packages/a/bar.ts', 200, 10),
];

describe('buildSizeMatrix', () => {
  it('code 要素は自分自身の値 (locMax === loc)', () => {
    const r = buildSizeMatrix(sizeEntries, elements);
    expect(r['file::packages/a/foo.ts']).toEqual({ loc: 100, locMax: 100, files: 1, functions: 5 });
    expect(r['file::packages/a/bar.ts']).toEqual({ loc: 200, locMax: 200, files: 1, functions: 10 });
  });

  it('component 要素は子 code の合計 (locMax は最大単一ファイル)', () => {
    const r = buildSizeMatrix(sizeEntries, elements);
    expect(r['comp_x']).toEqual({ loc: 300, locMax: 200, files: 2, functions: 15 });
  });

  it('container 要素は子孫 code の合計 (locMax は最大単一ファイル)', () => {
    const r = buildSizeMatrix(sizeEntries, elements);
    expect(r['pkg_a']).toEqual({ loc: 300, locMax: 200, files: 2, functions: 15 });
  });

  it('エントリが無い code 要素は出力に含めない', () => {
    const r = buildSizeMatrix(sizeEntries, [
      { id: 'file::packages/x/orphan.ts', name: 'o', type: 'code' },
    ]);
    expect(r).toEqual({});
  });

  it('fileEntries が空なら空オブジェクト', () => {
    const r = buildSizeMatrix([], elements);
    expect(r).toEqual({});
  });

  it('lineCount === 0 のエントリは skip される', () => {
    const withZero: readonly SizeFileEntry[] = [
      entry('file::packages/a/foo.ts', 0, 3),
      entry('file::packages/a/bar.ts', 200, 10),
    ];
    const r = buildSizeMatrix(withZero, elements);
    // foo.ts は skip されるので出力に含まれない
    expect(r['file::packages/a/foo.ts']).toBeUndefined();
    // bar.ts は出力される
    expect(r['file::packages/a/bar.ts']).toEqual({ loc: 200, locMax: 200, files: 1, functions: 10 });
    // comp_x / pkg_a は bar.ts のみ集計
    expect(r['comp_x']).toEqual({ loc: 200, locMax: 200, files: 1, functions: 10 });
    expect(r['pkg_a']).toEqual({ loc: 200, locMax: 200, files: 1, functions: 10 });
  });
});
