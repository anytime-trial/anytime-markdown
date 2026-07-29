import {
  LINK_DIRECTION,
  canonicalizeSpec,
  computeSpecHash,
  parseCoocFile,
  readLink,
  serializeCoocFile,
  validateCooccurrenceFile,
  writeLink,
  type CooccurrenceFile,
  type CooccurrenceLinkTuple,
} from '../../presets/cooccurrenceFile';

function validFile(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'manual' },
    spec: {
      title: '納期遅延の要因',
      subject: 0,
      nodes: [
        { label: '納期遅延', frequency: 40 },
        { label: '仕様変更', frequency: 25 },
        { label: 'レビュー待ち', frequency: 18 },
      ],
      links: [
        [0, 1, 0.8],
        [0, 2, 0.5],
      ],
      clusters: [{ label: '工程', members: [0, 2] }],
    },
    layout: {
      positions: [
        [0, 0],
        [100, 10],
        [-80, 12],
      ],
      specHash: 'hash',
      algorithmVersion: 'cooccurrence-layout-v1',
    },
  };
}

describe('cooccurrence .cooc.json helpers', () => {
  it('妥当なファイルは検証エラーなしで受理する', () => {
    expect(validateCooccurrenceFile(validFile())).toEqual([]);
  });

  it('仕様で不正とする入力を打ち切らずに検出する', () => {
    const file: CooccurrenceFile = {
      meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'manual' },
      spec: {
        subject: 10,
        nodes: [
          { label: 'A', frequency: -1 },
          { label: 'A', frequency: 2 },
        ],
        links: [
          [0, 0, 1],
          [0, 9, -0.2],
        ],
        clusters: [{ label: 'bad', members: [1, 7] }],
      },
      layout: {
        positions: [[0, 0]],
        specHash: 'hash',
        algorithmVersion: 'cooccurrence-layout-v1',
      },
    };

    const codes = validateCooccurrenceFile(file).map((e) => e.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'duplicate-node-label',
        'self-cooccurrence',
        'negative-frequency',
        'negative-link-strength',
        'link-endpoint-out-of-range',
        'node-reference-out-of-range',
        'layout-position-count-mismatch',
      ]),
    );
  });

  it('外部入力として壊れた型を受けても例外を投げずに検証エラーを返す', () => {
    const errors = validateCooccurrenceFile({
      meta: { schemaVersion: 1, generatedAt: 123, origin: 'manual' },
      spec: { nodes: [{ label: 'A', frequency: 'high' }], links: [[0, 'B', 1]] },
    });
    expect(errors.map((e) => e.code)).toContain('invalid-schema');
  });

  it('spec のキーは辞書順に正規化し、配列順序は保存する', () => {
    const a: CooccurrenceFile['spec'] = {
      nodes: [
        { frequency: 1, label: 'A' },
        { frequency: 2, label: 'B' },
      ],
      links: [[0, 1, 0.5]],
      title: 'T',
    };
    const b: CooccurrenceFile['spec'] = {
      title: 'T',
      links: [[0, 1, 0.5]],
      nodes: [
        { label: 'A', frequency: 1 },
        { label: 'B', frequency: 2 },
      ],
    };
    const reordered: CooccurrenceFile['spec'] = {
      ...a,
      nodes: [a.nodes[1], a.nodes[0]],
    };

    expect(canonicalizeSpec(a)).toBe(canonicalizeSpec(b));
    expect(canonicalizeSpec(a)).toBe('{"links":[[0,1,0.5]],"nodes":[{"frequency":1,"label":"A"},{"frequency":2,"label":"B"}],"title":"T"}');
    expect(canonicalizeSpec(a)).not.toBe(canonicalizeSpec(reordered));
    expect(computeSpecHash(a)).toBe(computeSpecHash(b));
    expect(computeSpecHash(a)).not.toBe(computeSpecHash(reordered));
  });

  it('serialize は minify し、座標を小数第 1 位に丸める', () => {
    const text = serializeCoocFile({
      ...validFile(),
      layout: {
        positions: [
          [1.24, -1.25],
          [2.26, 2.24],
          [3, 4],
        ],
        specHash: 'hash',
        algorithmVersion: 'cooccurrence-layout-v1',
      },
    });

    expect(text).not.toContain('\n');
    expect(text).not.toContain('  ');
    expect(text).toContain('"positions":[[1.2,-1.2],[2.3,2.2],[3,4]]');
  });

  it('parse は JSON を読み、検証結果を含むエラーを投げる', () => {
    expect(parseCoocFile(serializeCoocFile(validFile()))).toEqual(validFile());
    expect(() =>
      parseCoocFile(
        JSON.stringify({
          ...validFile(),
          spec: { ...validFile().spec, links: [[0, 0, 1]] },
        }),
      ),
    ).toThrow(/self-cooccurrence at spec\.links\.0/);
  });

  it('1,000 語・3,000 共起・座標つきでも 200KB 以内に収まる', () => {
    const nodeCount = 1000;
    const linkCount = 3000;
    // ラベルは日本語で作る。共起ネットワークの語は日本語であり、UTF-8 では 1 文字 3 バイトに
    // なる。ASCII の短い擬似ラベルで測ると最良ケースしか見ないため、予算を守れる根拠にならない。
    const nodes: CooccurrenceFile['spec']['nodes'] = Array.from({ length: nodeCount }, (_, i) => ({
      label: `共起語彙${i}`,
      frequency: i + 1,
    }));
    const links: CooccurrenceFile['spec']['links'] = Array.from({ length: linkCount }, (_, i) => [
      i % nodeCount,
      (i * 7 + 1) % nodeCount,
      (i % 100) / 10,
    ]);
    const positions: NonNullable<CooccurrenceFile['layout']>['positions'] = Array.from({ length: nodeCount }, (_, i) => [
      i * 1.234,
      -i * 0.987,
    ]);
    const file: CooccurrenceFile = {
      meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'mcp' },
      spec: { nodes, links },
      layout: {
        positions,
        specHash: computeSpecHash({ nodes, links }),
        algorithmVersion: 'cooccurrence-layout-v1',
      },
    };

    const bytes = Buffer.byteLength(serializeCoocFile(file), 'utf8');
    expect(bytes / 1024).toBeLessThanOrEqual(200);
    // 端点を語名で持つ表現に戻すと minify しても 243KB になり予算を割る（設計書 §2.3 の実測）。
    // 添字表現を保っていることを、上限とは別に「語名が本文へ繰り返し現れない」ことで押さえる。
    // 上限だけでは、語名表現へ退行しても語彙が短ければ通過してしまう。
    const text = serializeCoocFile(file);
    const firstLabelOccurrences = text.split('"共起語彙0"').length - 1;
    expect(firstLabelOccurrences).toBe(1);
  });
});

describe('保存時の版数', () => {
  const file = (links: CooccurrenceLinkTuple[]): CooccurrenceFile => ({
    meta: { schemaVersion: 1, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'A', frequency: 1 },
        { label: 'B', frequency: 1 },
      ],
      links,
    },
  });

  it('無向だけなら版数 1 で書く', () => {
    const json = JSON.parse(serializeCoocFile(file([[0, 1, 5]])));
    expect(json.meta.schemaVersion).toBe(1);
    expect(json.spec.links[0]).toEqual([0, 1, 5]);
  });

  it('向きがあれば版数 2 で書く', () => {
    const json = JSON.parse(serializeCoocFile(file([[0, 1, 5, LINK_DIRECTION.forward]])));
    expect(json.meta.schemaVersion).toBe(2);
    expect(json.spec.links[0]).toEqual([0, 1, 5, 1]);
  });

  it('無向へ戻せば版数 1 へ戻り 4 要素が残らない', () => {
    const json = JSON.parse(serializeCoocFile(file([[0, 1, 5, LINK_DIRECTION.none]])));
    expect(json.meta.schemaVersion).toBe(1);
    expect(json.spec.links[0]).toEqual([0, 1, 5]);
  });

  it('向きを 1 本でも持てば版数 2 になる', () => {
    const json = JSON.parse(
      serializeCoocFile(
        file([
          [0, 1, 5],
          [1, 0, 3, LINK_DIRECTION.both],
        ]),
      ),
    );
    expect(json.meta.schemaVersion).toBe(2);
    expect(json.spec.links[0]).toEqual([0, 1, 5]);
  });

  it('書き出したファイルは検証を通る', () => {
    const json = JSON.parse(serializeCoocFile(file([[0, 1, 5, LINK_DIRECTION.backward]])));
    expect(validateCooccurrenceFile(json)).toEqual([]);
  });
});

describe('specHash は向きを見ない', () => {
  const spec = (links: CooccurrenceLinkTuple[]): CooccurrenceFile['spec'] => ({
    nodes: [
      { label: 'A', frequency: 1 },
      { label: 'B', frequency: 1 },
    ],
    links,
  });

  it('向きだけが違う spec のハッシュは一致する', () => {
    expect(computeSpecHash(spec([[0, 1, 5, LINK_DIRECTION.forward]]))).toBe(computeSpecHash(spec([[0, 1, 5]])));
  });

  it('順方向と双方向のハッシュも一致する', () => {
    expect(computeSpecHash(spec([[0, 1, 5, LINK_DIRECTION.both]]))).toBe(
      computeSpecHash(spec([[0, 1, 5, LINK_DIRECTION.forward]])),
    );
  });

  it('強度が違えばハッシュは異なる', () => {
    expect(computeSpecHash(spec([[0, 1, 5]]))).not.toBe(computeSpecHash(spec([[0, 1, 6]])));
  });

  it('端点の順序が違えばハッシュは異なる', () => {
    expect(computeSpecHash(spec([[0, 1, 5]]))).not.toBe(computeSpecHash(spec([[1, 0, 5]])));
  });
});

describe('向きの検証', () => {
  const base = (links: unknown[], schemaVersion: number): unknown => ({
    meta: { schemaVersion, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'A', frequency: 1 },
        { label: 'B', frequency: 1 },
      ],
      links,
    },
  });

  it('版数 2 なら 4 要素の共起を受理する', () => {
    expect(validateCooccurrenceFile(base([[0, 1, 5, 1]], 2))).toEqual([]);
  });

  it('版数 1 に 4 要素の共起があれば拒否する', () => {
    const errors = validateCooccurrenceFile(base([[0, 1, 5, 1]], 1));
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('spec.links.0');
  });

  it('向きが範囲外なら拒否する', () => {
    const errors = validateCooccurrenceFile(base([[0, 1, 5, 4]], 2));
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('spec.links.0.3');
  });

  it('向きが整数でなければ拒否する', () => {
    expect(validateCooccurrenceFile(base([[0, 1, 5, 1.5]], 2))).toHaveLength(1);
  });

  it('版数 1 の 3 要素の共起は従来どおり受理する', () => {
    expect(validateCooccurrenceFile(base([[0, 1, 5]], 1))).toEqual([]);
  });

  it('版数 3 は拒否する', () => {
    const errors = validateCooccurrenceFile(base([[0, 1, 5]], 3));
    expect(errors.some((e) => e.path === 'meta.schemaVersion')).toBe(true);
  });

  it('要素数が 2 の共起は従来どおり拒否する', () => {
    expect(validateCooccurrenceFile(base([[0, 1]], 1))).toHaveLength(1);
  });

  // 内容の検証（自己共起・端点の範囲・負の強度）は構造の検証とは別のループにある。タプルの
  // 長さで早期 return すると、向き付きの共起だけが内容検証を素通りする。
  describe('向き付きでも内容の検証が効く', () => {
    it('自己共起を拒否する', () => {
      const errors = validateCooccurrenceFile(base([[0, 0, 5, 1]], 2));
      expect(errors.map((e) => e.code)).toContain('self-cooccurrence');
    });

    it('範囲外の端点を拒否する', () => {
      const errors = validateCooccurrenceFile(base([[0, 99, 5, 1]], 2));
      expect(errors.map((e) => e.code)).toContain('link-endpoint-out-of-range');
    });

    it('負の強度を拒否する', () => {
      const errors = validateCooccurrenceFile(base([[0, 1, -5, 2]], 2));
      expect(errors.map((e) => e.code)).toContain('negative-link-strength');
    });

    it('3 要素と 4 要素で同じ理由を返す', () => {
      const three = validateCooccurrenceFile(base([[0, 0, -5]], 1)).map((e) => e.code).sort();
      const four = validateCooccurrenceFile(base([[0, 0, -5, 1]], 2)).map((e) => e.code).sort();
      expect(four).toEqual(three);
    });
  });
});

describe('readLink / writeLink', () => {
  it('3 要素のタプルは無向として読む', () => {
    expect(readLink([0, 1, 8])).toEqual({ source: 0, target: 1, strength: 8, direction: 0 });
  });

  it('4 要素のタプルは向きを読む', () => {
    expect(readLink([0, 1, 8, 2])).toEqual({ source: 0, target: 1, strength: 8, direction: 2 });
  });

  it('無向は 3 要素で書く', () => {
    expect(writeLink({ source: 0, target: 1, strength: 8, direction: LINK_DIRECTION.none })).toEqual([0, 1, 8]);
  });

  it('向きがあれば 4 要素で書く', () => {
    expect(writeLink({ source: 0, target: 1, strength: 8, direction: LINK_DIRECTION.forward })).toEqual([0, 1, 8, 1]);
  });

  it('readLink と writeLink は往復する', () => {
    const tuples: CooccurrenceLinkTuple[] = [
      [0, 1, 8],
      [2, 3, 4, LINK_DIRECTION.forward],
      [5, 6, 7, LINK_DIRECTION.backward],
      [8, 9, 1, LINK_DIRECTION.both],
    ];
    for (const tuple of tuples) {
      expect(writeLink(readLink(tuple))).toEqual(tuple);
    }
  });
});
