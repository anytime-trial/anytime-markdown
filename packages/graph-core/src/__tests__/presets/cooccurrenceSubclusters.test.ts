import {
  parseCoocFile,
  schemaVersionForSpec,
  serializeCoocFile,
  validateCooccurrenceFile,
  type CooccurrenceFile,
} from '../../presets/cooccurrenceFile';

/**
 * サブクラスタ（要件書「サブクラスタ」§2.1・§2.2）。
 *
 * 所属を決めるのは `members` だけで、`subclusters` はその部分集合を分割する。ここで守るのは
 * 「部分集合であること」「サブクラスタどうしが重ならないこと」の 2 つで、どちらも破れても
 * ファイルとしては読めてしまうため、検証でしか捕まえられない。
 */
function fileWithSubclusters(
  subclusters: Array<{ label: string; members: number[] }> | undefined,
): CooccurrenceFile {
  const spec: CooccurrenceFile['spec'] = {
    nodes: [
      { label: '半導体関連株', frequency: 10 },
      { label: '電子部品', frequency: 6 },
      { label: '内需株', frequency: 5 },
    ],
    links: [[0, 1, 3]],
    clusters: [
      {
        label: '売られた側',
        members: [0, 1],
        ...(subclusters === undefined ? {} : { subclusters }),
      },
      { label: '買われた側', members: [2] },
    ],
  };
  return {
    meta: { schemaVersion: schemaVersionForSpec(spec), generatedAt: '2026-07-31T00:00:00.000Z', origin: 'manual' },
    spec,
  };
}

function codes(file: CooccurrenceFile): string[] {
  return validateCooccurrenceFile(file).map((e) => e.code);
}

describe('サブクラスタの版数', () => {
  it('サブクラスタを 1 つでも持つと版数 5 になる', () => {
    const file = fileWithSubclusters([{ label: '半導体・AI 関連', members: [0] }]);
    expect(schemaVersionForSpec(file.spec)).toBe(5);
  });

  it('サブクラスタを持たなければ従来の版数のまま', () => {
    expect(schemaVersionForSpec(fileWithSubclusters(undefined).spec)).toBe(1);
  });

  it('空配列の subclusters は版数を繰り上げない', () => {
    expect(schemaVersionForSpec(fileWithSubclusters([]).spec)).toBe(1);
  });
});

describe('サブクラスタの検証', () => {
  it('クラスタの members の部分集合なら受理する', () => {
    const file = fileWithSubclusters([
      { label: '半導体・AI 関連', members: [0] },
      { label: '電子部品', members: [1] },
    ]);
    expect(validateCooccurrenceFile(file)).toEqual([]);
  });

  it('サブクラスタに入らない members があってよい（細分の途中でも壊れない）', () => {
    expect(validateCooccurrenceFile(fileWithSubclusters([{ label: '半導体・AI 関連', members: [0] }]))).toEqual([]);
  });

  it('クラスタの members に無い語は拒否する', () => {
    // 語 2 は「買われた側」に属する。ここへ入れると色（クラスタ）と位置（レーン）が食い違う。
    expect(codes(fileWithSubclusters([{ label: '誤り', members: [2] }]))).toContain(
      'subcluster-member-outside-cluster',
    );
  });

  it('サブクラスタどうしのメンバー重複を拒否する', () => {
    const file = fileWithSubclusters([
      { label: '半導体・AI 関連', members: [0, 1] },
      { label: '電子部品', members: [1] },
    ]);
    expect(codes(file)).toContain('subcluster-member-duplicated');
  });

  it('同一クラスタ内のサブクラスタ名の重複を拒否する', () => {
    const file = fileWithSubclusters([
      { label: '同じ名前', members: [0] },
      { label: '同じ名前', members: [1] },
    ]);
    expect(codes(file)).toContain('subcluster-label-duplicated');
  });

  it('メンバーが 0 件のサブクラスタを拒否する', () => {
    expect(codes(fileWithSubclusters([{ label: '空', members: [] }]))).toContain('subcluster-empty');
  });

  it('版数がサブクラスタに追いついていないファイルを拒否する', () => {
    const file = fileWithSubclusters([{ label: '半導体・AI 関連', members: [0] }]);
    file.meta.schemaVersion = 4;
    expect(validateCooccurrenceFile(file).map((e) => e.message)).toContain(
      'subclusters require schemaVersion 5 or later',
    );
  });
});

/**
 * 版数を 1 つ足すたびに、時間軸を併用したファイルが「時間軸の検査」で落ちる形の壊れ方があった。
 * 時間軸の版数検査が等値（`!== 4`）だったためで、下限比較へ直した回帰。
 */
describe('時間軸とサブクラスタの併用', () => {
  function timelineFile(): CooccurrenceFile {
    const spec: CooccurrenceFile['spec'] = {
      nodes: [
        { label: '半導体関連株', frequency: 10 },
        { label: '電子部品', frequency: 6 },
      ],
      links: [[0, 1, 3]],
      clusters: [
        {
          label: '売られた側',
          members: [0, 1],
          subclusters: [{ label: '半導体・AI 関連', members: [0] }],
        },
      ],
      timeline: {
        slices: [{ label: '2026-07-28', at: '2026-07-28' }],
        nodes: [
          [
            [0, 10],
            [1, 6],
          ],
        ],
        links: [[[0, 3]]],
      },
    };
    return {
      meta: { schemaVersion: schemaVersionForSpec(spec), generatedAt: '2026-07-31T00:00:00.000Z', origin: 'manual' },
      spec,
    };
  }

  it('時間軸とサブクラスタを併せ持つファイルは版数 5 で受理される', () => {
    const file = timelineFile();
    expect(file.meta.schemaVersion).toBe(5);
    expect(validateCooccurrenceFile(file)).toEqual([]);
  });

  it('版数 4 のまま時間軸だけを持つファイルは従来どおり受理される', () => {
    const file = timelineFile();
    delete file.spec.clusters![0].subclusters;
    file.meta.schemaVersion = schemaVersionForSpec(file.spec);
    expect(file.meta.schemaVersion).toBe(4);
    expect(validateCooccurrenceFile(file)).toEqual([]);
  });

  it('往復してもサブクラスタが失われない', () => {
    const file = timelineFile();
    const roundTripped = parseCoocFile(serializeCoocFile(file));
    expect(roundTripped.spec.clusters?.[0].subclusters).toEqual([{ label: '半導体・AI 関連', members: [0] }]);
    expect(roundTripped.meta.schemaVersion).toBe(5);
  });
});
