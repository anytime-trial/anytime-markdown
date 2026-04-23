import { parseMarkdownTable, serializeMarkdownTable } from '../utils/markdown';
import type { SheetSnapshot } from '../types';

describe('parseMarkdownTable', () => {
  it('基本的なテーブルをパースする', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    const snap = parseMarkdownTable(md);
    expect(snap.cells).toEqual([['A', 'B'], ['1', '2']]);
    expect(snap.range).toEqual({ rows: 2, cols: 2 });
  });

  it('セパレータ行からアライメントをパースする', () => {
    const md = '| A | B | C |\n| :--- | :---: | ---: |\n| x | y | z |';
    const snap = parseMarkdownTable(md);
    expect(snap.alignments[0]).toEqual(['left', 'center', 'right']);
    expect(snap.alignments[1]).toEqual(['left', 'center', 'right']);
  });

  it('セル前後の空白をトリムする', () => {
    const md = '|  Hello  |  World  |\n|  ---  |  ---  |\n|  foo  |  bar  |';
    const snap = parseMarkdownTable(md);
    expect(snap.cells[0]).toEqual(['Hello', 'World']);
    expect(snap.cells[1]).toEqual(['foo', 'bar']);
  });

  it('データ行なし（ヘッダーのみ）のテーブルを扱う', () => {
    const md = '| A | B |\n| --- | --- |';
    const snap = parseMarkdownTable(md);
    expect(snap.cells).toEqual([['A', 'B']]);
    expect(snap.range).toEqual({ rows: 1, cols: 2 });
  });

  it('空文字列を渡したとき 1×1 のスナップショットを返す', () => {
    const snap = parseMarkdownTable('');
    expect(snap.cells).toEqual([['']]);
    expect(snap.range).toEqual({ rows: 1, cols: 1 });
  });
});

describe('serializeMarkdownTable', () => {
  it('基本的なテーブルをシリアライズする', () => {
    const snap = parseMarkdownTable('| A | B |\n| --- | --- |\n| 1 | 2 |');
    const md = serializeMarkdownTable(snap);
    expect(md).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
  });

  it('アライメントをセパレータ行に反映する', () => {
    const snap = parseMarkdownTable('| A | B | C |\n| :--- | :---: | ---: |\n| x | y | z |');
    const md = serializeMarkdownTable(snap);
    expect(md).toBe('| A | B | C |\n| :--- | :---: | ---: |\n| x | y | z |');
  });

  it('セル内のパイプ文字をエスケープする', () => {
    const snap: SheetSnapshot = {
      cells: [['a|b', 'c'], ['1', '2']],
      alignments: [[null, null], [null, null]],
      range: { rows: 2, cols: 2 },
    };
    const md = serializeMarkdownTable(snap);
    expect(md).toContain('a\\|b');
  });

  it('range.rows の範囲のみシリアライズする', () => {
    const snap: SheetSnapshot = {
      cells: [['A', 'B'], ['1', '2'], ['3', '4']],
      alignments: [[null, null], [null, null], [null, null]],
      range: { rows: 2, cols: 2 },
    };
    const md = serializeMarkdownTable(snap);
    const lines = md.split('\n');
    expect(lines).toHaveLength(3);
  });
});
