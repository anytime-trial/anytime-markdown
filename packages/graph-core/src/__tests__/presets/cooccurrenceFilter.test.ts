import { filterCooccurrenceFile } from '../../presets/cooccurrenceFilter';
import type { CooccurrenceFile } from '../../presets/cooccurrenceFile';

function file(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'A', frequency: 10 },
        { label: 'B', frequency: 5 },
        { label: 'C', frequency: 1 },
        { label: 'D', frequency: 8 },
      ],
      links: [
        [0, 1, 0.9],
        [1, 2, 0.8],
        [0, 3, 0.7],
        [2, 3, 0.6],
      ],
      clusters: [
        { label: 'left', members: [0, 1, 2] },
        { label: 'right', members: [2, 3] },
      ],
    },
  };
}

function setValues(values: ReadonlySet<number>): number[] {
  return [...values].sort((a, b) => a - b);
}

describe('cooccurrence filter', () => {
  it('仕様どおりの順序で、頻度、クラスタ、端点生存、強度、上位 N 本を適用する', () => {
    const result = filterCooccurrenceFile(file(), {
      minFrequency: 5,
      selectedClusterIndexes: [0],
      minStrength: 0.75,
      topLinkCount: 1,
    });

    expect(setValues(result.nodeIndexes)).toEqual([0, 1]);
    expect(setValues(result.linkIndexes)).toEqual([0]);
  });

  it('最小共起強度と上位 N 本では共起を持たなくなった語を消さない', () => {
    const result = filterCooccurrenceFile(file(), { minStrength: 0.95, topLinkCount: 1 });

    expect(setValues(result.nodeIndexes)).toEqual([0, 1, 2, 3]);
    expect(setValues(result.linkIndexes)).toEqual([]);
    expect(result.counts).toEqual({
      visibleNodeCount: 4,
      visibleLinkCount: 0,
      totalNodeCount: 4,
      totalLinkCount: 4,
    });
  });

  it('最小出現頻度とクラスタ選択で語が消え、その語を端点に持つ共起も消える', () => {
    const result = filterCooccurrenceFile(file(), { minFrequency: 6, selectedClusterIndexes: [1] });

    expect(setValues(result.nodeIndexes)).toEqual([3]);
    expect(setValues(result.linkIndexes)).toEqual([]);
    expect(result.counts.visibleNodeCount).toBe(1);
    expect(result.counts.visibleLinkCount).toBe(0);
  });

  it('件数は描画対象の語数と共起数に一致する', () => {
    const result = filterCooccurrenceFile(file(), { minFrequency: 2, minStrength: 0.7, topLinkCount: 2 });

    expect(setValues(result.nodeIndexes)).toEqual([0, 1, 3]);
    expect(setValues(result.linkIndexes)).toEqual([0, 2]);
    expect(result.counts).toEqual({
      visibleNodeCount: 3,
      visibleLinkCount: 2,
      totalNodeCount: 4,
      totalLinkCount: 4,
    });
  });

  it('上位 N 本は強度同値の順序を元の添字で決める', () => {
    const input = file();
    input.spec.links = [
      [0, 1, 0.5],
      [0, 2, 0.7],
      [0, 3, 0.7],
    ];

    const result = filterCooccurrenceFile(input, { topLinkCount: 2 });

    expect(setValues(result.linkIndexes)).toEqual([1, 2]);
  });
});

describe('cooccurrenceFilter クラスタ未所属の語', () => {
  const file: CooccurrenceFile = {
    meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'A', frequency: 5 },
        { label: 'B', frequency: 4 },
        { label: 'unclustered', frequency: 3 },
      ],
      links: [[0, 1, 3]],
      clusters: [{ label: 'One', members: [0] }, { label: 'Two', members: [1] }],
    },
  };
  const labels = (indexes: ReadonlySet<number>) => [...indexes].map((i) => file.spec.nodes[i]!.label).sort();

  it('全クラスタ選択は絞り込みなしと一致する（未所属の語も残る）', () => {
    const none = filterCooccurrenceFile(file, undefined);
    const all = filterCooccurrenceFile(file, { selectedClusterIndexes: [0, 1] });
    expect(labels(all.nodeIndexes)).toEqual(labels(none.nodeIndexes));
    expect(labels(all.nodeIndexes)).toEqual(['A', 'B', 'unclustered']);
  });

  it('一部クラスタのみ選択でも未所属の語は残る', () => {
    const result = filterCooccurrenceFile(file, { selectedClusterIndexes: [0] });
    expect(labels(result.nodeIndexes)).toEqual(['A', 'unclustered']);
  });

  it('全クラスタ未選択でも未所属の語は残る（クラスタ所属の語だけが消える）', () => {
    const result = filterCooccurrenceFile(file, { selectedClusterIndexes: [] });
    expect(labels(result.nodeIndexes)).toEqual(['unclustered']);
  });
});

describe('向き付きの共起の絞り込み', () => {
  function directedFile(): CooccurrenceFile {
    return {
      meta: { schemaVersion: 2, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
      spec: {
        nodes: [
          { label: 'A', frequency: 10 },
          { label: 'B', frequency: 10 },
          { label: 'C', frequency: 10 },
        ],
        links: [
          [0, 1, 0.9, 1],
          [1, 2, 0.2, 2],
          [0, 2, 0.5, 3],
        ],
      },
    };
  }

  it('向き付きでも強度で絞り込める', () => {
    const result = filterCooccurrenceFile(directedFile(), { minStrength: 0.5 });
    expect(setValues(result.linkIndexes)).toEqual([0, 2]);
  });

  it('向き付きでも上位 N 本の対象になる', () => {
    const result = filterCooccurrenceFile(directedFile(), { topLinkCount: 2 });
    expect(setValues(result.linkIndexes)).toEqual([0, 2]);
  });

  it('向き付きでも端点の生存判定が効く', () => {
    const file = directedFile();
    file.spec.nodes[2].frequency = 1;
    const result = filterCooccurrenceFile(file, { minFrequency: 5 });
    expect(setValues(result.linkIndexes)).toEqual([0]);
  });
});

describe('サブクラスタによる絞り込み', () => {
  function subclusterFile(): CooccurrenceFile {
    return {
      meta: { schemaVersion: 5, generatedAt: '2026-07-31T00:00:00.000Z', origin: 'manual' },
      spec: {
        nodes: [
          { label: 'A', frequency: 10 },
          { label: 'B', frequency: 10 },
          { label: 'C', frequency: 10 },
          { label: 'D', frequency: 10 },
        ],
        links: [[0, 1, 0.9], [1, 2, 0.8], [2, 3, 0.7]],
        clusters: [
          // C は「クラスタには属すがどのサブクラスタにも属さない」残余の語。
          { label: 'left', members: [0, 1, 2], subclusters: [{ label: 'a', members: [0] }, { label: 'b', members: [1] }] },
          { label: 'right', members: [3] },
        ],
      },
    };
  }

  function labelsOf(file: CooccurrenceFile, indexes: ReadonlySet<number>): string[] {
    return setValues(indexes).map((index) => file.spec.nodes[index].label);
  }

  it('選択されていないサブクラスタの語を外す', () => {
    const target = subclusterFile();
    const result = filterCooccurrenceFile(target, { selectedSubclusters: [{ cluster: 0, subcluster: 0 }] });
    // b（語 B）だけが落ちる。残余の C とサブクラスタを持たないクラスタの D は残る。
    expect(labelsOf(target, result.nodeIndexes)).toEqual(['A', 'C', 'D']);
  });

  it('全サブクラスタを選んだ状態は絞り込みなしと一致する', () => {
    const target = subclusterFile();
    const all = filterCooccurrenceFile(target, {
      selectedSubclusters: [{ cluster: 0, subcluster: 0 }, { cluster: 0, subcluster: 1 }],
    });
    const none = filterCooccurrenceFile(target, {});
    expect(setValues(all.nodeIndexes)).toEqual(setValues(none.nodeIndexes));
    expect(setValues(all.linkIndexes)).toEqual(setValues(none.linkIndexes));
  });

  it('サブクラスタを全て外しても、どのサブクラスタにも属さない語は残る', () => {
    const target = subclusterFile();
    const result = filterCooccurrenceFile(target, { selectedSubclusters: [] });
    expect(labelsOf(target, result.nodeIndexes)).toEqual(['C', 'D']);
  });

  it('クラスタを外すと、その中のサブクラスタの語も選択に関わらず消える', () => {
    const target = subclusterFile();
    const result = filterCooccurrenceFile(target, {
      selectedClusterIndexes: [1],
      selectedSubclusters: [{ cluster: 0, subcluster: 0 }, { cluster: 0, subcluster: 1 }],
    });
    expect(labelsOf(target, result.nodeIndexes)).toEqual(['D']);
  });

  it('語が消えると、その語を端点に持つ共起も消える', () => {
    const target = subclusterFile();
    const result = filterCooccurrenceFile(target, { selectedSubclusters: [{ cluster: 0, subcluster: 1 }] });
    // A が消えるので共起 0（A-B）も落ちる。B-C・C-D は残る。
    expect(setValues(result.linkIndexes)).toEqual([1, 2]);
  });
});
