/**
 * selectEmbedSections の仕様（FR-3 / AC-1）:
 * 埋め込み対象はリード節＋各見出しの「固有本文」（次の任意レベル見出しまで）。
 * 区間が互いに素なため、親子の内容重複による類似度バイアスと、
 * 親固有テキストの検索脱落の両方が起きない。
 */

import { selectEmbedSections } from '../selectEmbedSections';

describe('selectEmbedSections', () => {
  test('入れ子構造では各見出しの固有本文が選ばれ、親は子の本文を含まない', () => {
    const body = [
      '# 概要',
      'h1 本文',
      '## 詳細',
      'h2 本文',
      '### 内訳',
      'h3 本文',
      '## まとめ',
      'h2 まとめ本文',
    ].join('\n');
    const selected = selectEmbedSections(body);
    expect(selected.map((s) => s.heading)).toEqual(['概要', '詳細', '内訳', 'まとめ']);
    // 親「概要」の固有本文は次の見出しの手前で止まる（子の本文を含まない＝重複ゼロ）。
    expect(selected[0].text).toBe('# 概要\nh1 本文');
    expect(selected[1].text).toBe('## 詳細\nh2 本文');
    // 固有本文の集合はどの 2 節も内容を共有しない。
    for (const a of selected) {
      for (const b of selected) {
        if (a.sectionIdx !== b.sectionIdx) expect(a.text.includes(b.text)).toBe(false);
      }
    }
  });

  test('親見出し直下の固有テキストが脱落しない（レビュー指摘の回帰）', () => {
    const body = ['## 親', '親固有の説明文', '### 子', '子の本文'].join('\n');
    const selected = selectEmbedSections(body);
    const joined = selected.map((s) => s.text).join('\n');
    expect(joined).toContain('親固有の説明文');
    expect(selected.map((s) => s.heading)).toEqual(['親', '子']);
  });

  test('リード節は常に選ばれる', () => {
    const body = ['前文テキスト', '', '# 見出し', '本文'].join('\n');
    const selected = selectEmbedSections(body);
    expect(selected.map((s) => s.heading)).toEqual(['', '見出し']);
    expect(selected[0].level).toBe(0);
    expect(selected[0].text).toBe('前文テキスト');
  });

  test('見出しのみで固有本文が見出し行だけの節も選ばれる（見出し語の検索シグナル）', () => {
    const body = ['# 親', '## 子', '子の本文'].join('\n');
    const selected = selectEmbedSections(body);
    expect(selected.map((s) => s.text)).toEqual(['# 親', '## 子\n子の本文']);
  });

  test('sectionIdx は文書順連番になる', () => {
    const body = ['# A', 'a', '## B', 'b', '# C', 'c'].join('\n');
    const selected = selectEmbedSections(body);
    expect(selected.map((s) => s.sectionIdx)).toEqual([0, 1, 2]);
  });

  test('空・空白のみの本文は空配列を返す', () => {
    expect(selectEmbedSections('')).toEqual([]);
    expect(selectEmbedSections('   \n  ')).toEqual([]);
  });
});
