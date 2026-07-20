import {
  addCooccurrenceLink,
  addCooccurrenceNode,
  assignCooccurrenceNodeToCluster,
  deleteCooccurrenceLink,
  deleteCooccurrenceNode,
  renameCooccurrenceNode,
  setCooccurrenceLinkStrength,
  setCooccurrenceNodeFrequency,
  setCooccurrenceSubject,
  setCooccurrenceTitle,
} from '../../presets/cooccurrenceEdit';
import type { CooccurrenceFile } from '../../presets/cooccurrenceFile';

function file(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'manual' },
    spec: {
      title: 'before',
      subject: 3,
      nodes: [
        { label: 'A', frequency: 10 },
        { label: 'B', frequency: 8 },
        { label: 'C', frequency: 6 },
        { label: 'D', frequency: 4 },
      ],
      links: [
        [0, 1, 0.9],
        [1, 3, 0.8],
        [2, 3, 0.7],
      ],
      clusters: [
        { label: 'alpha', members: [0, 2, 3] },
        { label: 'beta', members: [1, 3] },
      ],
    },
    layout: {
      positions: [
        [0, 0],
        [10, 0],
        [20, 0],
        [30, 0],
      ],
      specHash: 'hash',
      algorithmVersion: 'cooccurrence-layout-v1',
    },
  };
}

function expectOk(result: ReturnType<typeof deleteCooccurrenceNode>): CooccurrenceFile {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(', '));
  return result.file;
}

describe('cooccurrence edit', () => {
  it('語の削除で links、subject、clusters.members、layout.positions の参照を付け替える', () => {
    const edited = expectOk(deleteCooccurrenceNode(file(), 1));

    expect(edited.spec.nodes.map((node) => node.label)).toEqual(['A', 'C', 'D']);
    expect(edited.spec.links).toEqual([[1, 2, 0.7]]);
    expect(edited.spec.subject).toBe(2);
    expect(edited.spec.clusters).toEqual([
      { label: 'alpha', members: [0, 1, 2] },
      { label: 'beta', members: [2] },
    ]);
    expect(edited.layout?.positions).toEqual([
      [0, 0],
      [20, 0],
      [30, 0],
    ]);
  });

  it('削除された語が subject の場合は中心事象を外す', () => {
    const edited = expectOk(deleteCooccurrenceNode(file(), 3));

    expect(edited.spec.subject).toBeUndefined();
  });

  it('語の改名で共起の端点は同じ 2 語を指したままにする', () => {
    const edited = expectOk(renameCooccurrenceNode(file(), 1, 'B renamed'));

    expect(edited.spec.nodes[1].label).toBe('B renamed');
    expect(edited.spec.links[0]).toEqual([0, 1, 0.9]);
    expect(edited.spec.links[1]).toEqual([1, 3, 0.8]);
  });

  it('編集関数は引数を破壊的に変更しない', () => {
    const input = file();
    const before = JSON.stringify(input);

    expectOk(setCooccurrenceNodeFrequency(input, 0, 99));
    expectOk(setCooccurrenceTitle(input, 'after'));
    expect(JSON.stringify(input)).toBe(before);
  });

  it('語、共起、タイトル、中心事象の編集を検証つきで適用する', () => {
    const withNode = expectOk(addCooccurrenceNode(file(), { label: 'E', frequency: 2 }, [40, 0]));
    const withLink = expectOk(addCooccurrenceLink(withNode, [0, 4, 0.4]));
    const withCluster = expectOk(assignCooccurrenceNodeToCluster(withLink, 4, 0));
    const withStrength = expectOk(setCooccurrenceLinkStrength(withCluster, 3, 0.45));
    const withoutLink = expectOk(deleteCooccurrenceLink(withStrength, 0));
    const withTitle = expectOk(setCooccurrenceTitle(withoutLink, undefined));
    const withSubject = expectOk(setCooccurrenceSubject(withTitle, 4));

    expect(withSubject.spec.title).toBeUndefined();
    expect(withSubject.spec.subject).toBe(4);
    expect(withSubject.spec.nodes[4]).toEqual({ label: 'E', frequency: 2 });
    expect(withSubject.spec.links).toEqual([
      [1, 3, 0.8],
      [2, 3, 0.7],
      [0, 4, 0.45],
    ]);
    expect(withSubject.spec.clusters?.[0].members).toEqual([0, 2, 3, 4]);
    expect(withSubject.layout?.positions[4]).toEqual([40, 0]);
  });

  it('不正になる編集は拒否する', () => {
    const duplicate = renameCooccurrenceNode(file(), 1, 'A');
    const selfLink = addCooccurrenceLink(file(), [2, 2, 1]);
    const negativeFrequency = setCooccurrenceNodeFrequency(file(), 0, -1);
    const outOfRangeSubject = setCooccurrenceSubject(file(), 99);

    expect(duplicate.ok).toBe(false);
    expect(selfLink.ok).toBe(false);
    expect(negativeFrequency.ok).toBe(false);
    expect(outOfRangeSubject.ok).toBe(false);

    if (!duplicate.ok) expect(duplicate.errors.map((e) => e.code)).toContain('duplicate-node-label');
    if (!selfLink.ok) expect(selfLink.errors.map((e) => e.code)).toContain('self-cooccurrence');
    if (!negativeFrequency.ok) expect(negativeFrequency.errors.map((e) => e.code)).toContain('negative-frequency');
    if (!outOfRangeSubject.ok) expect(outOfRangeSubject.errors.map((e) => e.code)).toContain('node-reference-out-of-range');
  });

  it('不正な編集の拒否時も引数を破壊的に変更しない', () => {
    const input = file();
    const before = JSON.stringify(input);

    const result = addCooccurrenceLink(input, [0, 0, -1]);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(input)).toBe(before);
  });
});
