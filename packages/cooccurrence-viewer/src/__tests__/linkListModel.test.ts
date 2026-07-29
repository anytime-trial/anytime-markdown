import { LINK_DIRECTION, type CooccurrenceLinkTuple } from '@anytime-markdown/graph-core';
import { directionSymbol, filterLinkRows } from '../ui/linkListModel';

const nodes = [{ label: '納期遅延' }, { label: '仕様変更' }, { label: '人員不足' }];
const links: CooccurrenceLinkTuple[] = [
  [0, 1, 8, LINK_DIRECTION.forward],
  [1, 2, 5],
  [0, 2, 3, LINK_DIRECTION.both],
];

describe('filterLinkRows', () => {
  it('検索語が空なら全件を返す', () => {
    expect(filterLinkRows(nodes, links, '')).toHaveLength(3);
  });

  it('空白だけの検索語も全件を返す', () => {
    expect(filterLinkRows(nodes, links, '   ')).toHaveLength(3);
  });

  it('端点のどちらかに一致すれば残す', () => {
    expect(filterLinkRows(nodes, links, '納期').map((row) => row.linkIndex)).toEqual([0, 2]);
  });

  it('もう一方の端点への一致も拾う', () => {
    expect(filterLinkRows(nodes, links, '人員').map((row) => row.linkIndex)).toEqual([1, 2]);
  });

  it('どちらの端点にも一致しなければ空になる', () => {
    expect(filterLinkRows(nodes, links, '存在しない語')).toEqual([]);
  });

  it('行に両端の語名・強度・向きが入る', () => {
    expect(filterLinkRows(nodes, links, '')[0]).toEqual({
      linkIndex: 0,
      sourceLabel: '納期遅延',
      targetLabel: '仕様変更',
      strength: 8,
      direction: LINK_DIRECTION.forward,
    });
  });

  it('第 4 要素の無い共起は無向として読む', () => {
    expect(filterLinkRows(nodes, links, '')[1].direction).toBe(LINK_DIRECTION.none);
  });

  it('linkIndex は絞り込み後も元の添字を指す', () => {
    // 行から編集関数を呼ぶため、表示順ではなく spec.links の添字である必要がある。
    expect(filterLinkRows(nodes, links, '人員').map((row) => row.linkIndex)).toEqual([1, 2]);
  });

  it('端点が範囲外でも例外を投げない', () => {
    const broken: CooccurrenceLinkTuple[] = [[0, 99, 1]];
    expect(filterLinkRows(nodes, broken, '')[0]).toMatchObject({ sourceLabel: '納期遅延', targetLabel: '' });
  });
});

describe('directionSymbol', () => {
  it('4 つの向きに記号を割り当てる', () => {
    expect(directionSymbol(LINK_DIRECTION.none)).toBe('—');
    expect(directionSymbol(LINK_DIRECTION.forward)).toBe('→');
    expect(directionSymbol(LINK_DIRECTION.backward)).toBe('←');
    expect(directionSymbol(LINK_DIRECTION.both)).toBe('↔');
  });

  it('4 つの記号は互いに重複しない', () => {
    const symbols = [LINK_DIRECTION.none, LINK_DIRECTION.forward, LINK_DIRECTION.backward, LINK_DIRECTION.both].map(
      directionSymbol,
    );
    expect(new Set(symbols).size).toBe(4);
  });
});
