/**
 * @jest-environment jsdom
 */
import type { CooccurrenceFile, CooccurrenceFilterOptions } from '@anytime-markdown/graph-core';
import { createCooccurrenceT } from '../i18n/createCooccurrenceT';
import { createFilterPanel } from '../ui/FilterPanel';

const t = createCooccurrenceT('Cooccurrence', 'ja');

function file(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 5, generatedAt: '2026-07-31T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'Alpha', frequency: 3 },
        { label: 'Beta', frequency: 2 },
        { label: 'Gamma', frequency: 1 },
      ],
      links: [[0, 1, 1], [1, 2, 2]],
      clusters: [
        { label: '値下がり', members: [0], subclusters: [{ label: '需給', members: [0] }] },
        { label: '値上がり', members: [1] },
        { label: '観測', members: [2] },
      ],
      timeline: {
        slices: [{ label: 'S1' }, { label: 'S2' }, { label: 'S3' }],
        nodes: [[[0, 1]], [[1, 1]], [[2, 1]]],
        links: [[[0, 1]], [[1, 1]], []],
      },
    },
  };
}

interface Mounted {
  element: HTMLElement;
  emitted: CooccurrenceFilterOptions[];
  sliceChanges: (readonly string[])[];
  update(next: { filter?: CooccurrenceFilterOptions; selectedSliceLabels?: readonly string[] }): void;
  destroy(): void;
}

function mount(target: CooccurrenceFile, selectedSliceLabels?: readonly string[]): Mounted {
  const emitted: CooccurrenceFilterOptions[] = [];
  const sliceChanges: (readonly string[])[] = [];
  const base = {
    file: target,
    counts: { visibleNodeCount: 3, totalNodeCount: 3, visibleLinkCount: 2, totalLinkCount: 2 },
    t,
  };
  const panel = createFilterPanel({
    ...base,
    selectedSliceLabels,
    onFilterChange: (options) => emitted.push(options),
    onSelectedSliceLabelsChange: (selected) => sliceChanges.push(selected),
  });
  document.body.appendChild(panel.element);
  return {
    element: panel.element,
    emitted,
    sliceChanges,
    update: (next) => panel.update({ ...base, ...next }),
    destroy: () => panel.destroy(),
  };
}

function masterBoxes(root: HTMLElement): HTMLInputElement[] {
  return [...root.querySelectorAll<HTMLInputElement>('.cooc-filter__all input[type=checkbox]')];
}

function clusterBoxes(root: HTMLElement): HTMLInputElement[] {
  return [...root.querySelectorAll<HTMLInputElement>('.cooc-filter__clusters input[type=checkbox]')];
}

function toggle(box: HTMLInputElement): void {
  box.checked = !box.checked;
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(() => document.body.replaceChildren());

describe('一括選択「すべて」', () => {
  it('クラスタとスライスの一覧の外側に「すべて」が 1 つずつ出て、初期状態は選択済みになる', () => {
    const panel = mount(file());

    const masters = masterBoxes(panel.element);
    expect(masters).toHaveLength(2);
    expect(masters.map((box) => box.checked)).toEqual([true, true]);
    expect(masters.map((box) => box.indeterminate)).toEqual([false, false]);
    // 一覧のスクロール領域の中には置かない（件数が増えても常に見える位置に固定する）。
    expect(panel.element.querySelectorAll('.cooc-filter__clusters .cooc-filter__check--all')).toHaveLength(0);
    expect(panel.element.querySelectorAll('.cooc-filter__slices .cooc-filter__check--all')).toHaveLength(0);

    panel.destroy();
  });

  it('一部だけ選択されていると中間状態になり、全て外すと未選択になる', () => {
    const panel = mount(file());

    const [, cluster2] = clusterBoxes(panel.element).filter((box) => !box.closest('.cooc-filter__check--sub'));
    toggle(cluster2);
    let [clustersMaster] = masterBoxes(panel.element);
    expect(clustersMaster.checked).toBe(false);
    expect(clustersMaster.indeterminate).toBe(true);

    panel.update({ filter: { selectedClusterIndexes: [] } });
    [clustersMaster] = masterBoxes(panel.element);
    expect(clustersMaster.checked).toBe(false);
    expect(clustersMaster.indeterminate).toBe(false);

    panel.destroy();
  });

  it('全選択済みで押すと全解除になり、サブクラスタの操作が無効になる', () => {
    const panel = mount(file());

    const [clustersMaster] = masterBoxes(panel.element);
    toggle(clustersMaster);

    expect(panel.emitted).toHaveLength(1);
    expect(panel.emitted[0].selectedClusterIndexes).toEqual([]);
    const sub = panel.element.querySelector<HTMLInputElement>('.cooc-filter__check--sub input');
    expect(sub?.disabled).toBe(true);

    panel.destroy();
  });

  it('混在から押すと全選択になり、サブクラスタの選択は変わらない', () => {
    const panel = mount(file());
    panel.update({
      filter: { selectedClusterIndexes: [0], selectedSubclusters: [{ cluster: 0, subcluster: 0 }] },
    });

    const [clustersMaster] = masterBoxes(panel.element);
    toggle(clustersMaster);

    expect(panel.emitted).toHaveLength(1);
    expect(panel.emitted[0].selectedClusterIndexes).toEqual([0, 1, 2]);
    expect(panel.emitted[0].selectedSubclusters).toEqual([{ cluster: 0, subcluster: 0 }]);

    panel.destroy();
  });

  it('スライスの「すべて」は全解除で空列、全選択で時間順の全ラベル列を通知する', () => {
    const panel = mount(file());

    const [, slicesMaster] = masterBoxes(panel.element);
    toggle(slicesMaster);
    expect(panel.sliceChanges).toEqual([[]]);

    // ホストが空選択を反映した状態から、もう一度押すと全選択へ戻る。
    panel.update({ selectedSliceLabels: [] });
    const [, refreshed] = masterBoxes(panel.element);
    expect(refreshed.checked).toBe(false);
    expect(refreshed.indeterminate).toBe(false);
    toggle(refreshed);
    expect(panel.sliceChanges).toEqual([[], ['S1', 'S2', 'S3']]);

    panel.destroy();
  });

  it('一部のスライスだけ表示していると中間状態になる', () => {
    const panel = mount(file(), ['S2']);

    const [, slicesMaster] = masterBoxes(panel.element);
    expect(slicesMaster.checked).toBe(false);
    expect(slicesMaster.indeterminate).toBe(true);

    panel.destroy();
  });

  it('時間軸の無いファイルではスライスの「すべて」を出さない', () => {
    const target = file();
    delete (target.spec as { timeline?: unknown }).timeline;
    const panel = mount(target);

    expect(masterBoxes(panel.element)).toHaveLength(1);

    panel.destroy();
  });
});
