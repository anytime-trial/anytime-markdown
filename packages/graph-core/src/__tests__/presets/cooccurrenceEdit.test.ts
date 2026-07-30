import {
  addCooccurrenceLink,
  addCooccurrenceNode,
  assignCooccurrenceNodeToCluster,
  deleteCooccurrenceLink,
  deleteCooccurrenceNode,
  renameCooccurrenceNode,
  setCooccurrenceLinkDirection,
  setCooccurrenceLinkStrength,
  setCooccurrenceNodeFrequency,
  setCooccurrenceSubject,
  setCooccurrenceTitle,
} from '../../presets/cooccurrenceEdit';
import { LINK_DIRECTION, readLink, type CooccurrenceFile } from '../../presets/cooccurrenceFile';

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

describe('共起の向きの編集', () => {
  function directedFile(): CooccurrenceFile {
    const result = setCooccurrenceLinkDirection(file(), 1, LINK_DIRECTION.forward);
    if (!result.ok) throw new Error('setup failed');
    return result.file;
  }

  it('向きを設定できる', () => {
    const result = setCooccurrenceLinkDirection(file(), 0, LINK_DIRECTION.forward);
    expect(result.ok).toBe(true);
    if (result.ok) expect(readLink(result.file.spec.links[0]).direction).toBe(LINK_DIRECTION.forward);
  });

  it('向きを無向へ戻すと 3 要素になる', () => {
    const result = setCooccurrenceLinkDirection(directedFile(), 1, LINK_DIRECTION.none);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file.spec.links[1]).toHaveLength(3);
  });

  it('範囲外の共起の添字を拒否する', () => {
    expect(setCooccurrenceLinkDirection(file(), 99, LINK_DIRECTION.forward).ok).toBe(false);
  });

  it('範囲外の向きの値を拒否する', () => {
    expect(setCooccurrenceLinkDirection(file(), 0, 4 as never).ok).toBe(false);
    expect(setCooccurrenceLinkDirection(file(), 0, -1 as never).ok).toBe(false);
  });

  it('強度の変更で向きが失われない', () => {
    const result = setCooccurrenceLinkStrength(directedFile(), 1, 0.5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(readLink(result.file.spec.links[1])).toMatchObject({
        strength: 0.5,
        direction: LINK_DIRECTION.forward,
      });
    }
  });

  it('向き付きで共起を追加できる', () => {
    const result = addCooccurrenceLink(file(), [0, 2, 0.4, LINK_DIRECTION.both]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const added = result.file.spec.links.at(-1);
      expect(added).toBeDefined();
      expect(readLink(added!).direction).toBe(LINK_DIRECTION.both);
    }
  });

  it('他の編集でも向きが保たれる', () => {
    const result = renameCooccurrenceNode(directedFile(), 1, 'B2');
    expect(result.ok).toBe(true);
    if (result.ok) expect(readLink(result.file.spec.links[1]).direction).toBe(LINK_DIRECTION.forward);
  });

  it('向き付きでも自己共起の追加を拒否する', () => {
    // 編集 UI・MCP・読み込みの 3 経路が同じ検証関数を共有する（設計書 §2.6）。向きを付けた
    // だけで受理されると、UI から不正なファイルを作れる。
    expect(addCooccurrenceLink(file(), [0, 0, 5, LINK_DIRECTION.forward]).ok).toBe(false);
  });

  it('向き付きでも負の強度を拒否する', () => {
    expect(addCooccurrenceLink(file(), [0, 1, -5, LINK_DIRECTION.both]).ok).toBe(false);
  });

  it('向き付きでも範囲外の端点を拒否する', () => {
    expect(addCooccurrenceLink(file(), [0, 99, 5, LINK_DIRECTION.backward]).ok).toBe(false);
  });

  it('語の削除で残る共起の向きと端点が保たれる', () => {
    // 語 0 を削除すると links[0]（端点に語 0 を持つ）が消え、元 links[1] = [1, 3] が
    // [0, 2] へ繰り上がる。向きは端点の添字が変わっても「どちらからどちらへ」を保つ。
    const result = deleteCooccurrenceNode(directedFile(), 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(readLink(result.file.spec.links[0])).toMatchObject({
        source: 0,
        target: 2,
        direction: LINK_DIRECTION.forward,
      });
    }
  });
});
