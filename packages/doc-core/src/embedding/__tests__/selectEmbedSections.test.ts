/**
 * selectEmbedSections の仕様（FR-3 / AC-1）:
 * 埋め込み対象は葉節（子見出しを持たない節）とリード節のみ。
 * 親節は子の本文を含むため除外し、同一 doc の親子で類似度上位が重複するバイアスを防ぐ。
 */

import { splitSections } from '../../ingest/splitSections';
import { selectEmbedSections } from '../selectEmbedSections';

describe('selectEmbedSections', () => {
  test('入れ子構造では親節を除外し葉節のみ選ぶ', () => {
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
    const selected = selectEmbedSections(splitSections(body));
    // 「概要」(h1) は「詳細」以下を含む親、「詳細」(h2) は「内訳」を含む親 → 除外。
    expect(selected.map((s) => s.heading)).toEqual(['内訳', 'まとめ']);
  });

  test('リード節は常に選ばれる（本文は最初の見出しで止まり子を含まないため）', () => {
    const body = ['前文テキスト', '', '# 見出し', '本文'].join('\n');
    const selected = selectEmbedSections(splitSections(body));
    expect(selected.map((s) => s.heading)).toEqual(['', '見出し']);
    expect(selected[0].level).toBe(0);
  });

  test('同レベルの兄弟見出しはすべて葉として選ばれる', () => {
    const body = ['# A', 'a', '# B', 'b', '# C', 'c'].join('\n');
    const selected = selectEmbedSections(splitSections(body));
    expect(selected.map((s) => s.heading)).toEqual(['A', 'B', 'C']);
  });

  test('sectionIdx は選定後の文書順連番になる', () => {
    const body = ['# 親', 'p', '## 子1', 'c1', '## 子2', 'c2'].join('\n');
    const selected = selectEmbedSections(splitSections(body));
    expect(selected.map((s) => s.sectionIdx)).toEqual([0, 1]);
    expect(selected.map((s) => s.heading)).toEqual(['子1', '子2']);
  });

  test('レベルが飛んで戻る構造でも親判定は直後の節のレベルで決まる', () => {
    // 「B」(h3) の次は「C」(h1) → B は葉。「A」(h1) は h3 を含む親 → 除外。
    const body = ['# A', 'a', '### B', 'b', '# C', 'c'].join('\n');
    const selected = selectEmbedSections(splitSections(body));
    expect(selected.map((s) => s.heading)).toEqual(['B', 'C']);
  });

  test('空配列は空配列を返す', () => {
    expect(selectEmbedSections([])).toEqual([]);
  });

  test('選ばれた節の text は splitSections の本文をそのまま保持する', () => {
    const body = ['# A', 'a 本文', '## B', 'b 本文'].join('\n');
    const selected = selectEmbedSections(splitSections(body));
    expect(selected).toHaveLength(1);
    expect(selected[0].text).toBe('## B\nb 本文');
  });
});
