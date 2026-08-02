/**
 * @jest-environment jsdom
 */
import type { CooccurrenceFile, CooccurrenceFilterOptions } from '@anytime-markdown/graph-core';
import { filterCooccurrenceFile } from '@anytime-markdown/graph-core';
import { createCooccurrenceT } from '../i18n/createCooccurrenceT';
import { createFilterPanel } from '../ui/FilterPanel';

const t = createCooccurrenceT('Cooccurrence', 'ja');

function file(withSubclusters = true): CooccurrenceFile {
  return {
    meta: { schemaVersion: withSubclusters ? 5 : 1, generatedAt: '2026-07-31T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'Alpha', frequency: 3 },
        { label: 'Beta', frequency: 2 },
        { label: 'Gamma', frequency: 1 },
      ],
      links: [[0, 1, 1], [1, 2, 2]],
      clusters: [
        {
          label: '値下がり',
          members: [0, 1, 2],
          ...(withSubclusters
            ? { subclusters: [{ label: '需給', members: [0] }, { label: '業績', members: [1] }] }
            : {}),
        },
      ],
    },
  };
}

function mount(target: CooccurrenceFile): {
  element: HTMLElement;
  emitted: CooccurrenceFilterOptions[];
  destroy(): void;
} {
  const emitted: CooccurrenceFilterOptions[] = [];
  const panel = createFilterPanel({
    file: target,
    counts: { visibleNodeCount: 3, totalNodeCount: 3, visibleLinkCount: 2, totalLinkCount: 2 },
    t,
    onFilterChange: (options) => emitted.push(options),
    onSelectedSliceLabelsChange: jest.fn(),
  });
  document.body.appendChild(panel.element);
  return { element: panel.element, emitted, destroy: () => panel.destroy() };
}

function checkboxes(root: HTMLElement): HTMLInputElement[] {
  return [...root.querySelectorAll<HTMLInputElement>('.cooc-filter__clusters input[type=checkbox]')];
}

function subRows(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.cooc-filter__check--sub')];
}

afterEach(() => document.body.replaceChildren());

describe('サブクラスタの絞り込み', () => {
  it('クラスタの下にサブクラスタが字下げして並び、初期状態は全選択', () => {
    const panel = mount(file());

    const rows = subRows(panel.element);
    expect(rows.map((row) => row.textContent)).toEqual(['需給', '業績']);
    expect(checkboxes(panel.element).map((box) => box.checked)).toEqual([true, true, true]);
    // 色見本はクラスタの段だけに置く（色はクラスタの符号で、子に並べると段が読めなくなる）。
    expect(panel.element.querySelectorAll('.cooc-filter__check--sub .cooc-filter__swatch')).toHaveLength(0);

    panel.destroy();
  });

  it('サブクラスタを外すと、その語だけが図から落ちる', () => {
    const target = file();
    const panel = mount(target);

    const [, subA] = checkboxes(panel.element);
    subA.checked = false;
    subA.dispatchEvent(new Event('change', { bubbles: true }));

    expect(panel.emitted).toHaveLength(1);
    expect(panel.emitted[0].selectedSubclusters).toEqual([{ cluster: 0, subcluster: 1 }]);
    // 発火した条件を実際の絞り込みへ通して、落ちる語を確かめる（UI の形だけを固定しない）。
    const result = filterCooccurrenceFile(target, panel.emitted[0]);
    expect([...result.nodeIndexes].sort()).toEqual([1, 2]);

    panel.destroy();
  });

  it('親のクラスタを外している間はサブクラスタを操作できない', () => {
    const panel = mount(file());

    const [cluster] = checkboxes(panel.element);
    cluster.checked = false;
    cluster.dispatchEvent(new Event('change', { bubbles: true }));

    const [, subA, subB] = checkboxes(panel.element);
    expect(subA.disabled).toBe(true);
    expect(subB.disabled).toBe(true);

    panel.destroy();
  });

  it('サブクラスタを持たないファイルでは条件そのものを出さない', () => {
    const panel = mount(file(false));

    expect(subRows(panel.element)).toHaveLength(0);
    const [cluster] = checkboxes(panel.element);
    cluster.checked = false;
    cluster.dispatchEvent(new Event('change', { bubbles: true }));

    expect(panel.emitted).toHaveLength(1);
    expect(Object.keys(panel.emitted[0])).not.toContain('selectedSubclusters');

    panel.destroy();
  });
});
