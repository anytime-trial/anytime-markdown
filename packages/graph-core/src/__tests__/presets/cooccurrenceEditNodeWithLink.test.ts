import { addCooccurrenceNodeWithLink, addCooccurrenceSlice } from '../../presets/cooccurrenceEdit';
import { readLink, type CooccurrenceFile } from '../../presets/cooccurrenceFile';

function file(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-31T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: '金利', frequency: 10 },
        { label: '株価', frequency: 8 },
      ],
      links: [[0, 1, 0.5]],
      clusters: [{ label: '政策', members: [0] }],
    },
  } as unknown as CooccurrenceFile;
}

describe('addCooccurrenceNodeWithLink', () => {
  it('語と共起を 1 回で足す', () => {
    const result = addCooccurrenceNodeWithLink(file(), {
      node: { label: 'インフレ', frequency: 4 },
      source: 0,
      strength: 0.6,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.spec.nodes.map((node) => node.label)).toEqual(['金利', '株価', 'インフレ']);
    expect(result.file.spec.links).toHaveLength(2);
    expect(readLink(result.file.spec.links[1])).toMatchObject({ source: 0, target: 2, strength: 0.6 });
  });

  it('クラスタ所属も同時に設定する', () => {
    const result = addCooccurrenceNodeWithLink(file(), {
      node: { label: 'インフレ', frequency: 4 },
      source: 0,
      strength: 0.6,
      clusterIndex: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.spec.clusters?.[0]?.members).toContain(2);
  });

  it('相手の語の添字が範囲外なら何も足さない', () => {
    const before = file();
    const result = addCooccurrenceNodeWithLink(before, {
      node: { label: 'インフレ', frequency: 4 },
      source: 99,
      strength: 0.6,
    });
    expect(result.ok).toBe(false);
    expect(before.spec.nodes).toHaveLength(2);
  });

  it('共起の検証に落ちたら語も足さない', () => {
    const result = addCooccurrenceNodeWithLink(file(), {
      node: { label: 'インフレ', frequency: 4 },
      source: 0,
      strength: -1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.code === 'negative-link-strength')).toBe(true);
  });

  it('クラスタの添字が範囲外なら語も共起も足さない', () => {
    const result = addCooccurrenceNodeWithLink(file(), {
      node: { label: 'インフレ', frequency: 4 },
      source: 0,
      strength: 0.6,
      clusterIndex: 9,
    });
    expect(result.ok).toBe(false);
  });

  it('語名が既存と重複したら足さない', () => {
    const result = addCooccurrenceNodeWithLink(file(), {
      node: { label: '株価', frequency: 4 },
      source: 0,
      strength: 0.6,
    });
    expect(result.ok).toBe(false);
  });

  it('時間軸を持つファイルではスライス別の値で足す', () => {
    const withFirst = addCooccurrenceSlice(file(), { label: '前期' });
    expect(withFirst.ok).toBe(true);
    if (!withFirst.ok) return;
    const withSecond = addCooccurrenceSlice(withFirst.file, { label: '後期' });
    expect(withSecond.ok).toBe(true);
    if (!withSecond.ok) return;
    const layered = withSecond.file;

    const result = addCooccurrenceNodeWithLink(layered, {
      node: { label: 'インフレ', sliceValues: [1, 3] },
      source: 0,
      strength: 0,
      linkSliceValues: [0.2, 0.4],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.spec.nodes[2]).toMatchObject({ label: 'インフレ', frequency: 4 });
    expect(readLink(result.file.spec.links[1])).toMatchObject({ source: 0, target: 2, strength: 0.6 });
  });
});
