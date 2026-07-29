import {
  COOCCURRENCE_SLICE_ENTRY_MAX,
  COOCCURRENCE_SLICE_MAX,
  cloneCooccurrenceTimeline,
  cooccurrenceSliceEntryCount,
  hasCooccurrenceTimeline,
  readCooccurrenceSliceValue,
  remapCooccurrenceTimeline,
  sliceBearingIndexes,
  totalCooccurrenceSliceValue,
  withCooccurrenceSliceValue,
  withoutCooccurrenceSliceValue,
  type CooccurrenceTimeline,
} from '../../presets/cooccurrenceTimeline';
import {
  computeSpecHash,
  parseCoocFile,
  schemaVersionForSpec,
  serializeCoocFile,
  validateCooccurrenceFile,
  withDerivedTotals,
  type CooccurrenceFile,
} from '../../presets/cooccurrenceFile';
import { filterCooccurrenceFile } from '../../presets/cooccurrenceFilter';

function timeline(): CooccurrenceTimeline {
  return {
    slices: [{ label: '1月', at: '2026-01-01' }, { label: '2月', at: '2026-02-01' }],
    // 語 0 は両月、語 1 は 1 月のみ、語 2 は 2 月のみ。
    nodes: [
      [
        [0, 6],
        [1, 4],
      ],
      [
        [0, 4],
        [2, 5],
      ],
    ],
    links: [[[0, 0.9]], [[1, 0.7]]],
  };
}

function fileWithTimeline(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 4, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'A', frequency: 10 },
        { label: 'B', frequency: 4 },
        { label: 'C', frequency: 5 },
      ],
      links: [
        [0, 1, 0.9],
        [0, 2, 0.7],
      ],
      timeline: timeline(),
    },
  };
}

function fileWithoutTimeline(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'A', frequency: 10 },
        { label: 'B', frequency: 4 },
      ],
      links: [[0, 1, 0.9]],
    },
  };
}

describe('cooccurrenceTimeline', () => {
  it('スライスを 1 つも持たない spec は時間軸を持たないと判定する', () => {
    expect(hasCooccurrenceTimeline(fileWithoutTimeline().spec)).toBe(false);
    expect(hasCooccurrenceTimeline({ timeline: { slices: [], nodes: [], links: [] } })).toBe(false);
    expect(hasCooccurrenceTimeline(fileWithTimeline().spec)).toBe(true);
  });

  it('スライスに現れない対象の値は undefined を返す（不在は 0 で表さない）', () => {
    const spec = fileWithTimeline().spec;
    expect(readCooccurrenceSliceValue(spec, { target: 'nodes', slice: 0, index: 0 })).toBe(6);
    expect(readCooccurrenceSliceValue(spec, { target: 'nodes', slice: 0, index: 2 })).toBeUndefined();
    expect(readCooccurrenceSliceValue(spec, { target: 'nodes', slice: 1, index: 2 })).toBe(5);
    expect(readCooccurrenceSliceValue(spec, { target: 'links', slice: 1, index: 1 })).toBe(0.7);
    expect(readCooccurrenceSliceValue(spec, { target: 'links', slice: 1, index: 0 })).toBeUndefined();
  });

  it('そのスライスに存在する対象の添字を集合で返す', () => {
    const spec = fileWithTimeline().spec;
    expect([...sliceBearingIndexes(spec, 'nodes', 0)].sort()).toEqual([0, 1]);
    expect([...sliceBearingIndexes(spec, 'nodes', 1)].sort()).toEqual([0, 2]);
    expect([...sliceBearingIndexes(spec, 'nodes', 9)]).toEqual([]);
  });

  it('延べエントリ数は全スライスの語と共起のエントリを合算する', () => {
    // 語 4 件（2+2）+ 共起 2 件（1+1）。
    expect(cooccurrenceSliceEntryCount(timeline())).toBe(6);
    expect(cooccurrenceSliceEntryCount(undefined)).toBe(0);
  });

  it('全体値はスライス値の合計になる', () => {
    const t = timeline();
    expect(totalCooccurrenceSliceValue(t, 'nodes', 0)).toBe(10);
    expect(totalCooccurrenceSliceValue(t, 'nodes', 1)).toBe(4);
    expect(totalCooccurrenceSliceValue(t, 'nodes', 2)).toBe(5);
    // どのスライスにも現れない対象は 0。
    expect(totalCooccurrenceSliceValue(t, 'nodes', 3)).toBe(0);
  });

  it('複製はスライスが 1 つも無ければ undefined を返す（空の器を残さない）', () => {
    expect(cloneCooccurrenceTimeline(undefined)).toBeUndefined();
    expect(cloneCooccurrenceTimeline({ slices: [], nodes: [], links: [] })).toBeUndefined();
  });

  it('複製は元の配列を共有しない', () => {
    const original = timeline();
    const cloned = cloneCooccurrenceTimeline(original);
    if (cloned === undefined) throw new Error('cloned must be defined');
    cloned.nodes[0][0][1] = 999;
    cloned.slices[0].label = 'changed';
    expect(original.nodes[0][0][1]).toBe(6);
    expect(original.slices[0].label).toBe('1月');
  });

  it('値の設定は添字順を保ち、同じ対象を二重に持たない', () => {
    const next = withCooccurrenceSliceValue(timeline(), { target: 'nodes', slice: 0, index: 2 }, 3);
    expect(next.nodes[0]).toEqual([
      [0, 6],
      [1, 4],
      [2, 3],
    ]);
    const overwritten = withCooccurrenceSliceValue(next, { target: 'nodes', slice: 0, index: 0 }, 1);
    expect(overwritten.nodes[0]).toEqual([
      [0, 1],
      [1, 4],
      [2, 3],
    ]);
  });

  it('値の削除は対象のスライスからだけ落とす', () => {
    const next = withoutCooccurrenceSliceValue(timeline(), { target: 'nodes', slice: 0, index: 0 });
    expect(next.nodes[0]).toEqual([[1, 4]]);
    expect(next.nodes[1]).toEqual([
      [0, 4],
      [2, 5],
    ]);
  });

  it('付け替えで消えた対象のエントリを落とし、後続の添字を繰り上げる', () => {
    // 語 1 を削除したときの付け替え。
    const remapped = remapCooccurrenceTimeline(timeline(), 'nodes', (index) => {
      if (index === 1) return undefined;
      return index > 1 ? index - 1 : index;
    });
    if (remapped === undefined) throw new Error('remapped must be defined');
    expect(remapped.nodes[0]).toEqual([[0, 6]]);
    expect(remapped.nodes[1]).toEqual([
      [0, 4],
      [1, 5],
    ]);
    // 共起側は触らない。
    expect(remapped.links).toEqual(timeline().links);
  });
});

describe('時間軸を持つファイルの版数と検証', () => {
  it('時間軸を持つ spec の版数は 4 になる', () => {
    expect(schemaVersionForSpec(fileWithTimeline().spec)).toBe(4);
    expect(schemaVersionForSpec(fileWithoutTimeline().spec)).toBe(1);
  });

  it('スライスを 1 つも持たない timeline は版数を繰り上げない', () => {
    const spec = { ...fileWithoutTimeline().spec, timeline: { slices: [], nodes: [], links: [] } };
    expect(schemaVersionForSpec(spec)).toBe(1);
  });

  it('妥当な時間軸つきファイルは検証を通る', () => {
    expect(validateCooccurrenceFile(fileWithTimeline())).toEqual([]);
  });

  it('版数 3 以下のファイルに時間軸があれば拒否する', () => {
    const file = fileWithTimeline();
    file.meta.schemaVersion = 3;
    expect(validateCooccurrenceFile(file).map((e) => e.code)).toContain('invalid-schema');
  });

  it('スライス配列と値配列の長さが揃っていなければ拒否する', () => {
    const file = fileWithTimeline();
    file.spec.timeline!.nodes = [file.spec.timeline!.nodes[0]];
    expect(validateCooccurrenceFile(file).map((e) => e.code)).toContain('slice-count-mismatch');
  });

  it('スライスのラベルが空文字または重複していれば拒否する', () => {
    const empty = fileWithTimeline();
    empty.spec.timeline!.slices[0].label = '';
    expect(validateCooccurrenceFile(empty).map((e) => e.code)).toContain('empty-slice-label');

    const duplicated = fileWithTimeline();
    duplicated.spec.timeline!.slices[1].label = '1月';
    expect(validateCooccurrenceFile(duplicated).map((e) => e.code)).toContain('duplicate-slice-label');
  });

  it('at が日付として解釈できなければ拒否する', () => {
    const file = fileWithTimeline();
    file.spec.timeline!.slices[0].at = 'いつか';
    expect(validateCooccurrenceFile(file).map((e) => e.code)).toContain('invalid-slice-date');
  });

  it('at を持つスライスの並びが時間順でなければ拒否する', () => {
    const file = fileWithTimeline();
    file.spec.timeline!.slices[0].at = '2026-03-01';
    expect(validateCooccurrenceFile(file).map((e) => e.code)).toContain('slice-order-not-chronological');
  });

  it('エントリの添字が範囲外なら拒否する', () => {
    const file = fileWithTimeline();
    file.spec.timeline!.nodes[0].push([9, 1]);
    expect(validateCooccurrenceFile(file).map((e) => e.code)).toContain('slice-target-out-of-range');
  });

  it('同じスライスで同じ対象を 2 度指していれば拒否する', () => {
    const file = fileWithTimeline();
    file.spec.timeline!.nodes[0].push([0, 1]);
    expect(validateCooccurrenceFile(file).map((e) => e.code)).toContain('duplicate-slice-target');
  });

  it('エントリの値が 0 以下なら拒否する（不在はエントリが現れないことで表す）', () => {
    const zero = fileWithTimeline();
    zero.spec.timeline!.nodes[0][0][1] = 0;
    expect(validateCooccurrenceFile(zero).map((e) => e.code)).toContain('non-positive-slice-value');

    const negative = fileWithTimeline();
    negative.spec.timeline!.nodes[0][0][1] = -1;
    expect(validateCooccurrenceFile(negative).map((e) => e.code)).toContain('non-positive-slice-value');
  });

  it('1 件もエントリを持たないスライスは拒否しない（作った直後の状態を不正にしない）', () => {
    const file = fileWithTimeline();
    file.spec.timeline!.slices.push({ label: '3月', at: '2026-03-01' });
    file.spec.timeline!.nodes.push([]);
    file.spec.timeline!.links.push([]);
    expect(validateCooccurrenceFile(file)).toEqual([]);
  });

  it('スライス数の上限を超えれば拒否する', () => {
    const file = fileWithTimeline();
    const t = file.spec.timeline!;
    t.slices = [];
    t.nodes = [];
    t.links = [];
    for (let i = 0; i <= COOCCURRENCE_SLICE_MAX; i++) {
      t.slices.push({ label: `s${i}` });
      t.nodes.push([[0, 1]]);
      t.links.push([]);
    }
    file.spec.nodes[0].frequency = COOCCURRENCE_SLICE_MAX + 1;
    file.spec.nodes[1].frequency = 0;
    file.spec.nodes[2].frequency = 0;
    file.spec.links = [];
    expect(validateCooccurrenceFile(file).map((e) => e.code)).toContain('too-many-slices');
  });

  it('延べエントリ数の上限を超えれば拒否する', () => {
    const nodes = Array.from({ length: 2000 }, (_, i) => ({ label: `n${i}`, frequency: 2 }));
    const perSlice = Array.from({ length: 2000 }, (_, i): [number, number] => [i, 1]);
    const file: CooccurrenceFile = {
      meta: { schemaVersion: 4, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
      spec: {
        nodes,
        links: [],
        timeline: {
          slices: [{ label: 'a' }, { label: 'b' }, { label: 'c' }, { label: 'd' }, { label: 'e' }],
          nodes: [perSlice, perSlice, perSlice, perSlice, perSlice].map((entries) =>
            entries.map((entry): [number, number] => [entry[0], entry[1]]),
          ),
          links: [[], [], [], [], []],
        },
      },
    };
    // 2,000 × 5 = 10,000 > 8,000。
    expect(cooccurrenceSliceEntryCount(file.spec.timeline)).toBeGreaterThan(COOCCURRENCE_SLICE_ENTRY_MAX);
    expect(validateCooccurrenceFile(file).map((e) => e.code)).toContain('too-many-slice-entries');
  });

  it('全体値がスライス値の合計と一致しなければ拒否する', () => {
    const file = fileWithTimeline();
    file.spec.nodes[0].frequency = 99;
    expect(validateCooccurrenceFile(file).map((e) => e.code)).toContain('total-not-derived');
  });
});

describe('全体値の導出', () => {
  it('スライス値の合計で全体値を埋め直す', () => {
    const file = fileWithTimeline();
    file.spec.nodes[0].frequency = 0;
    file.spec.links[0][2] = 0;
    const derived = withDerivedTotals(file.spec);
    expect(derived.nodes.map((node) => node.frequency)).toEqual([10, 4, 5]);
    expect(derived.links[0][2]).toBe(0.9);
    expect(derived.links[1][2]).toBe(0.7);
  });

  it('時間軸を持たない spec はそのまま返す', () => {
    const spec = fileWithoutTimeline().spec;
    expect(withDerivedTotals(spec).nodes.map((node) => node.frequency)).toEqual([10, 4]);
  });

  it('向きを落とさずに全体値だけを差し替える', () => {
    const file = fileWithTimeline();
    file.spec.links[0] = [0, 1, 0.9, 3];
    const derived = withDerivedTotals(file.spec);
    expect(derived.links[0]).toEqual([0, 1, 0.9, 3]);
  });
});

describe('時間軸と座標キャッシュ・往復', () => {
  it('時間軸はハッシュに影響しない（スライスを変えてもレイアウトを無効化しない）', () => {
    const base = fileWithTimeline().spec;
    const changed = fileWithTimeline().spec;
    changed.timeline!.nodes[0][0][1] = 5;
    changed.timeline!.slices[0].label = '別のラベル';
    expect(computeSpecHash(changed)).toBe(computeSpecHash(base));
  });

  it('時間軸の有無でハッシュが変わらない', () => {
    const withT = fileWithTimeline().spec;
    const withoutT = { ...fileWithTimeline().spec };
    delete withoutT.timeline;
    expect(computeSpecHash(withT)).toBe(computeSpecHash(withoutT));
  });

  it('書き出しと読み込みで時間軸が保たれ、版数 4 が付く', () => {
    const text = serializeCoocFile(fileWithTimeline());
    expect(JSON.parse(text).meta.schemaVersion).toBe(4);
    const parsed = parseCoocFile(text);
    expect(parsed.spec.timeline).toEqual(timeline());
  });

  it('スライスを 1 つも持たない timeline は書き出しで落とす', () => {
    const file = fileWithoutTimeline();
    file.spec.timeline = { slices: [], nodes: [], links: [] };
    const text = serializeCoocFile(file);
    expect(JSON.parse(text).spec.timeline).toBeUndefined();
    expect(JSON.parse(text).meta.schemaVersion).toBe(1);
  });

  it('書き出しは全体値をスライス値の合計で埋め直す', () => {
    const file = fileWithTimeline();
    file.spec.nodes[0].frequency = 99;
    const parsed = JSON.parse(serializeCoocFile(file));
    expect(parsed.spec.nodes[0].frequency).toBe(10);
  });
});

describe('スライスを指定した絞り込み', () => {
  function sliceFile(): CooccurrenceFile {
    return fileWithTimeline();
  }

  it('そのスライスに現れない語と共起は最初から外れる', () => {
    const result = filterCooccurrenceFile(sliceFile(), { sliceIndex: 0 });
    expect([...result.nodeIndexes].sort()).toEqual([0, 1]);
    expect([...result.linkIndexes].sort()).toEqual([0]);
  });

  it('最小出現頻度はスライスの値で判定する（全体値では判定しない）', () => {
    // 語 0 は 1 月に 6、2 月に 4、全体で 10。閾値 5 を 2 月へ適用すると外れる。
    const january = filterCooccurrenceFile(sliceFile(), { sliceIndex: 0, minFrequency: 5 });
    expect(january.nodeIndexes.has(0)).toBe(true);
    const february = filterCooccurrenceFile(sliceFile(), { sliceIndex: 1, minFrequency: 5 });
    expect(february.nodeIndexes.has(0)).toBe(false);
    // 全体値（10）で判定していれば 2 月でも残ってしまう。
    const union = filterCooccurrenceFile(sliceFile(), { minFrequency: 5 });
    expect(union.nodeIndexes.has(0)).toBe(true);
  });

  it('最小共起強度もスライスの値で判定する', () => {
    const january = filterCooccurrenceFile(sliceFile(), { sliceIndex: 0, minStrength: 0.8 });
    expect(january.linkIndexes.has(0)).toBe(true);
    const strict = filterCooccurrenceFile(sliceFile(), { sliceIndex: 0, minStrength: 0.95 });
    expect(strict.linkIndexes.has(0)).toBe(false);
  });

  it('最小値 0 でも不在の語は描かれない（不在を 0 とみなさない）', () => {
    const result = filterCooccurrenceFile(sliceFile(), { sliceIndex: 0, minFrequency: 0 });
    expect(result.nodeIndexes.has(2)).toBe(false);
  });

  it('スライスを指定しなければ従来どおり全体値で判定する', () => {
    const result = filterCooccurrenceFile(sliceFile(), {});
    expect([...result.nodeIndexes].sort()).toEqual([0, 1, 2]);
  });
});
