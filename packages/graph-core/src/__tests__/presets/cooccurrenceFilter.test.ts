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
