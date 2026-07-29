import {
  addCooccurrenceLink,
  addCooccurrenceNode,
  addCooccurrenceSlice,
  deleteCooccurrenceLink,
  deleteCooccurrenceNode,
  deleteCooccurrenceSlice,
  moveCooccurrenceSlice,
  removeCooccurrenceLinkSliceValue,
  removeCooccurrenceNodeSliceValue,
  renameCooccurrenceSlice,
  setCooccurrenceLinkSliceValue,
  setCooccurrenceLinkStrength,
  setCooccurrenceNodeFrequency,
  setCooccurrenceNodeSliceValue,
  type CooccurrenceEditResult,
} from '../../presets/cooccurrenceEdit';
import { readCooccurrenceSliceValue } from '../../presets/cooccurrenceTimeline';
import { validateCooccurrenceFile, type CooccurrenceFile } from '../../presets/cooccurrenceFile';

function unwrap(result: CooccurrenceEditResult): CooccurrenceFile {
  if (!result.ok) throw new Error(result.errors.map((e) => `${e.code}: ${e.message}`).join('; '));
  return result.file;
}

function codes(result: CooccurrenceEditResult): string[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

function plainFile(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'A', frequency: 10 },
        { label: 'B', frequency: 4 },
        { label: 'C', frequency: 6 },
      ],
      links: [
        [0, 1, 0.9],
        [1, 2, 0.5],
      ],
    },
    layout: { positions: [[0, 0], [1, 1], [2, 2]], specHash: 'x', algorithmVersion: 'v1' },
  };
}

function timelineFile(): CooccurrenceFile {
  const withFirst = unwrap(addCooccurrenceSlice(plainFile(), { label: '1月', at: '2026-01-01' }));
  return unwrap(addCooccurrenceSlice(withFirst, { label: '2月', at: '2026-02-01' }));
}

describe('スライスの追加', () => {
  it('最初のスライスは既存の全体値を引き継ぐ（時間軸を足しただけで値が失われない）', () => {
    const next = unwrap(addCooccurrenceSlice(plainFile(), { label: '1月' }));
    expect(next.spec.timeline?.slices).toEqual([{ label: '1月' }]);
    expect(readCooccurrenceSliceValue(next.spec, { target: 'nodes', slice: 0, index: 0 })).toBe(10);
    expect(readCooccurrenceSliceValue(next.spec, { target: 'nodes', slice: 0, index: 1 })).toBe(4);
    expect(readCooccurrenceSliceValue(next.spec, { target: 'nodes', slice: 0, index: 2 })).toBe(6);
    expect(readCooccurrenceSliceValue(next.spec, { target: 'links', slice: 0, index: 0 })).toBe(0.9);
    expect(next.spec.nodes.map((node) => node.frequency)).toEqual([10, 4, 6]);
    expect(next.meta.schemaVersion).toBe(4);
  });

  it('引き継ぎは値が正のものだけを入れる（0 の全体値をエントリにしない）', () => {
    const base = plainFile();
    base.spec.nodes[1].frequency = 0;
    const next = unwrap(addCooccurrenceSlice(base, { label: '1月' }));
    // 語 1（頻度 0）は唯一のスライス（添字 0）に現れない。
    expect(readCooccurrenceSliceValue(next.spec, { target: 'nodes', slice: 0, index: 1 })).toBeUndefined();
    expect(readCooccurrenceSliceValue(next.spec, { target: 'nodes', slice: 0, index: 0 })).toBe(10);
  });

  it('2 つ目以降のスライスは空で始まる', () => {
    const next = timelineFile();
    expect(next.spec.timeline?.slices).toHaveLength(2);
    expect(next.spec.timeline?.nodes[1]).toEqual([]);
    expect(next.spec.timeline?.links[1]).toEqual([]);
    // 全体値は 1 つ目のスライスの分だけ。
    expect(next.spec.nodes.map((node) => node.frequency)).toEqual([10, 4, 6]);
  });

  it('ラベルが重複するスライスは追加できない', () => {
    expect(codes(addCooccurrenceSlice(timelineFile(), { label: '1月' }))).toContain('duplicate-slice-label');
  });

  it('スライスを足してもレイアウトの座標は変わらない', () => {
    const next = timelineFile();
    expect(next.layout?.positions).toEqual([[0, 0], [1, 1], [2, 2]]);
    expect(next.layout?.specHash).toBe('x');
  });
});

describe('スライスの削除・改名・並べ替え', () => {
  it('削除はスライスと値を落とし、全体値を引き直す', () => {
    const base = unwrap(setCooccurrenceNodeSliceValue(timelineFile(), { node: 0, slice: 1 }, 3));
    expect(base.spec.nodes[0].frequency).toBe(13);
    const next = unwrap(deleteCooccurrenceSlice(base, 0));
    expect(next.spec.timeline?.slices).toEqual([{ label: '2月', at: '2026-02-01' }]);
    expect(next.spec.nodes[0].frequency).toBe(3);
    expect(next.spec.nodes[1].frequency).toBe(0);
  });

  it('最後のスライスを削除すると時間軸そのものを落とす（版数が 1 へ戻る）', () => {
    const one = unwrap(addCooccurrenceSlice(plainFile(), { label: '1月' }));
    const next = unwrap(deleteCooccurrenceSlice(one, 0));
    expect(next.spec.timeline).toBeUndefined();
    expect(next.meta.schemaVersion).toBe(1);
  });

  it('改名はラベルと日付を差し替え、値を動かさない', () => {
    const next = unwrap(renameCooccurrenceSlice(timelineFile(), 0, { label: '第1期', at: '2026-01-15' }));
    expect(next.spec.timeline?.slices[0]).toEqual({ label: '第1期', at: '2026-01-15' });
    expect(readCooccurrenceSliceValue(next.spec, { target: 'nodes', slice: 0, index: 0 })).toBe(10);
  });

  it('改名で日付を外せる', () => {
    const next = unwrap(renameCooccurrenceSlice(timelineFile(), 0, { label: '1月' }));
    expect(next.spec.timeline?.slices[0]).toEqual({ label: '1月' });
  });

  it('並べ替えはスライスと値を同時に動かす', () => {
    const base = unwrap(setCooccurrenceNodeSliceValue(timelineFile(), { node: 0, slice: 1 }, 3));
    // 日付の順序が壊れないよう、入れ替え後の並びに合わせて日付を外しておく。
    const undated = unwrap(renameCooccurrenceSlice(unwrap(renameCooccurrenceSlice(base, 0, { label: '1月' })), 1, { label: '2月' }));
    const next = unwrap(moveCooccurrenceSlice(undated, 0, 1));
    expect(next.spec.timeline?.slices.map((slice) => slice.label)).toEqual(['2月', '1月']);
    expect(readCooccurrenceSliceValue(next.spec, { target: 'nodes', slice: 0, index: 0 })).toBe(3);
    expect(readCooccurrenceSliceValue(next.spec, { target: 'nodes', slice: 1, index: 0 })).toBe(10);
  });

  it('範囲外のスライスを指す操作は拒否する', () => {
    expect(codes(deleteCooccurrenceSlice(timelineFile(), 9))).toContain('invalid-schema');
    expect(codes(renameCooccurrenceSlice(timelineFile(), 9, { label: 'x' }))).toContain('invalid-schema');
    expect(codes(moveCooccurrenceSlice(timelineFile(), 0, 9))).toContain('invalid-schema');
  });
});

describe('スライス別の値の編集', () => {
  it('値を設定すると全体値が合計へ追従する', () => {
    const next = unwrap(setCooccurrenceNodeSliceValue(timelineFile(), { node: 1, slice: 1 }, 7));
    expect(readCooccurrenceSliceValue(next.spec, { target: 'nodes', slice: 1, index: 1 })).toBe(7);
    expect(next.spec.nodes[1].frequency).toBe(11);
  });

  it('共起の値も同じく全体値へ追従する', () => {
    const next = unwrap(setCooccurrenceLinkSliceValue(timelineFile(), { link: 0, slice: 1 }, 0.4));
    expect(next.spec.links[0][2]).toBeCloseTo(1.3);
  });

  it('値を消すと全体値から抜ける', () => {
    const next = unwrap(removeCooccurrenceNodeSliceValue(timelineFile(), { node: 0, slice: 0 }));
    expect(readCooccurrenceSliceValue(next.spec, { target: 'nodes', slice: 0, index: 0 })).toBeUndefined();
    expect(next.spec.nodes[0].frequency).toBe(0);
  });

  it('共起の値も消せる', () => {
    const next = unwrap(removeCooccurrenceLinkSliceValue(timelineFile(), { link: 0, slice: 0 }));
    expect(next.spec.links[0][2]).toBe(0);
  });

  it('0 以下の値は設定できない（不在はエントリを消すことで表す）', () => {
    expect(codes(setCooccurrenceNodeSliceValue(timelineFile(), { node: 0, slice: 0 }, 0))).toContain('non-positive-slice-value');
    expect(codes(setCooccurrenceNodeSliceValue(timelineFile(), { node: 0, slice: 0 }, -1))).toContain('non-positive-slice-value');
  });

  it('時間軸を持たないファイルではスライス別の値を設定できない', () => {
    expect(codes(setCooccurrenceNodeSliceValue(plainFile(), { node: 0, slice: 0 }, 5))).toContain('invalid-schema');
  });
});

describe('全体値を直接触る操作の扱い', () => {
  it('時間軸を持つファイルでは全体値の直接変更を拒否する', () => {
    expect(codes(setCooccurrenceNodeFrequency(timelineFile(), 0, 20))).toContain('total-not-editable');
    expect(codes(setCooccurrenceLinkStrength(timelineFile(), 0, 0.2))).toContain('total-not-editable');
  });

  it('時間軸を持たないファイルでは従来どおり変更できる', () => {
    const next = unwrap(setCooccurrenceNodeFrequency(plainFile(), 0, 20));
    expect(next.spec.nodes[0].frequency).toBe(20);
  });
});

describe('語・共起の追加と削除に対する時間軸の追従', () => {
  it('時間軸を持つファイルへの追加はスライス別の値を要求する', () => {
    expect(codes(addCooccurrenceNode(timelineFile(), { label: 'D', frequency: 3 }))).toContain('slice-values-required');
    expect(codes(addCooccurrenceLink(timelineFile(), [0, 2, 0.3]))).toContain('slice-values-required');
  });

  it('スライス別の値を与えれば追加でき、全体値は合計になる', () => {
    const withNode = unwrap(addCooccurrenceNode(timelineFile(), { label: 'D', sliceValues: [2, 5] }));
    expect(withNode.spec.nodes[3]).toEqual({ label: 'D', frequency: 7 });
    expect(readCooccurrenceSliceValue(withNode.spec, { target: 'nodes', slice: 1, index: 3 })).toBe(5);

    const withLink = unwrap(addCooccurrenceLink(withNode, [0, 3, 0], [0.2, undefined]));
    expect(withLink.spec.links[2][2]).toBeCloseTo(0.2);
    expect(readCooccurrenceSliceValue(withLink.spec, { target: 'links', slice: 1, index: 2 })).toBeUndefined();
  });

  it('スライス別の値の長さがスライス数と違えば拒否する', () => {
    expect(codes(addCooccurrenceNode(timelineFile(), { label: 'D', sliceValues: [1] }))).toContain(
      'slice-count-mismatch',
    );
  });

  it('時間軸を持たないファイルにスライス別の値を渡せば拒否する', () => {
    expect(codes(addCooccurrenceNode(plainFile(), { label: 'D', sliceValues: [1] }))).toContain('invalid-schema');
  });

  it('語を削除するとスライスの語の添字が繰り上がる', () => {
    const base = unwrap(setCooccurrenceNodeSliceValue(timelineFile(), { node: 2, slice: 1 }, 4));
    const next = unwrap(deleteCooccurrenceNode(base, 0));
    expect(next.spec.nodes.map((node) => node.label)).toEqual(['B', 'C']);
    // 旧添字 2（C）が 1 へ繰り上がる。
    expect(readCooccurrenceSliceValue(next.spec, { target: 'nodes', slice: 1, index: 1 })).toBe(4);
    expect(readCooccurrenceSliceValue(next.spec, { target: 'nodes', slice: 0, index: 0 })).toBe(4);
    expect(validateCooccurrenceFile(next)).toEqual([]);
  });

  it('語の削除で道連れになった共起のスライス値も付け替わる', () => {
    // 語 0 を消すと共起 0（0-1）が道連れで消え、共起 1（1-2）が添字 0 へ繰り上がる。
    const base = unwrap(setCooccurrenceLinkSliceValue(timelineFile(), { link: 1, slice: 1 }, 0.6));
    const next = unwrap(deleteCooccurrenceNode(base, 0));
    expect(next.spec.links).toHaveLength(1);
    expect(readCooccurrenceSliceValue(next.spec, { target: 'links', slice: 0, index: 0 })).toBe(0.5);
    expect(readCooccurrenceSliceValue(next.spec, { target: 'links', slice: 1, index: 0 })).toBe(0.6);
    expect(validateCooccurrenceFile(next)).toEqual([]);
  });

  it('共起を削除するとスライスの共起の添字が繰り上がる', () => {
    const base = unwrap(setCooccurrenceLinkSliceValue(timelineFile(), { link: 1, slice: 1 }, 0.6));
    const next = unwrap(deleteCooccurrenceLink(base, 0));
    expect(next.spec.links).toHaveLength(1);
    expect(readCooccurrenceSliceValue(next.spec, { target: 'links', slice: 0, index: 0 })).toBe(0.5);
    expect(readCooccurrenceSliceValue(next.spec, { target: 'links', slice: 1, index: 0 })).toBe(0.6);
    expect(validateCooccurrenceFile(next)).toEqual([]);
  });

  it('削除の結果は常に検証を通る（全体値が合計から取り残されない）', () => {
    const base = unwrap(setCooccurrenceNodeSliceValue(timelineFile(), { node: 2, slice: 1 }, 4));
    expect(validateCooccurrenceFile(unwrap(deleteCooccurrenceNode(base, 2)))).toEqual([]);
    expect(validateCooccurrenceFile(unwrap(deleteCooccurrenceLink(base, 1)))).toEqual([]);
  });
});
