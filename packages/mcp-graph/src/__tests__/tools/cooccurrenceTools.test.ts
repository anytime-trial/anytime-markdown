import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { parseCoocFile } from '@anytime-markdown/graph-core/src/presets/cooccurrenceFile';
import { writeCooccurrence, type WriteCooccurrenceInput } from '../../tools/writeCooccurrence';
import { readCooccurrence } from '../../tools/readCooccurrence';

describe('cooccurrence tools', () => {
  let tmpDir: string;
  const testFile = 'network.cooc.json';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-cooc-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  async function readSaved() {
    return parseCoocFile(await fs.readFile(path.join(tmpDir, testFile), 'utf-8'));
  }

  it('should create a .cooc.json file and save label endpoints as indexes', async () => {
    const result = await writeCooccurrence({
      path: testFile,
      mode: 'replace',
      title: 'Network',
      subject: 'alpha',
      terms: [
        { label: 'alpha', frequency: 3 },
        { label: 'beta', frequency: 2 },
        { label: 'gamma', frequency: 1 },
      ],
      links: [
        { source: 'alpha', target: 'gamma', strength: 0.8 },
        { source: 'beta', target: 'gamma', strength: 0.4 },
      ],
      clusters: [{ label: 'Group', members: ['alpha', 'gamma'] }],
    }, tmpDir);

    expect(result.ok).toBe(true);
    expect(result.links).toEqual([
      { source: 'alpha', target: 'gamma', strength: 0.8, direction: 'none' },
      { source: 'beta', target: 'gamma', strength: 0.4, direction: 'none' },
    ]);
    expect(JSON.stringify(result)).not.toContain('[0,2');
    const saved = await readSaved();
    expect(saved.meta.origin).toBe('mcp');
    expect(saved.meta.schemaVersion).toBe(1);
    expect(saved.spec.subject).toBe(0);
    expect(saved.spec.nodes.map((node) => node.label)).toEqual(['alpha', 'beta', 'gamma']);
    expect(saved.spec.links).toEqual([[0, 2, 0.8], [1, 2, 0.4]]);
    expect(saved.spec.clusters).toEqual([{ label: 'Group', members: [0, 2] }]);
  });

  it('should replace an existing cooccurrence file', async () => {
    await writeCooccurrence({
      path: testFile,
      mode: 'replace',
      terms: [
        { label: 'old', frequency: 1 },
        { label: 'keep-out', frequency: 1 },
      ],
      links: [{ source: 'old', target: 'keep-out', strength: 1 }],
    }, tmpDir);

    await writeCooccurrence({
      path: testFile,
      mode: 'replace',
      terms: [
        { label: 'new', frequency: 4 },
        { label: 'fresh', frequency: 5 },
      ],
      links: [{ source: 'fresh', target: 'new', strength: 2 }],
    }, tmpDir);

    const saved = await readSaved();
    expect(saved.spec.nodes).toEqual([
      { label: 'new', frequency: 4 },
      { label: 'fresh', frequency: 5 },
    ]);
    expect(saved.spec.links).toEqual([[1, 0, 2]]);
  });

  it('should append terms and links while updating same-label existing terms', async () => {
    await writeCooccurrence({
      path: testFile,
      mode: 'replace',
      terms: [
        { label: 'alpha', frequency: 1 },
        { label: 'beta', frequency: 2 },
      ],
      links: [{ source: 'alpha', target: 'beta', strength: 0.5 }],
    }, tmpDir);

    await writeCooccurrence({
      path: testFile,
      mode: 'append',
      terms: [
        { label: 'beta', frequency: 7 },
        { label: 'gamma', frequency: 3 },
      ],
      links: [{ source: 'beta', target: 'gamma', strength: 0.9 }],
      clusters: [{ label: 'Added', members: ['beta', 'gamma'] }],
    }, tmpDir);

    const saved = await readSaved();
    expect(saved.spec.nodes).toEqual([
      { label: 'alpha', frequency: 1 },
      { label: 'beta', frequency: 7 },
      { label: 'gamma', frequency: 3 },
    ]);
    expect(saved.spec.links).toEqual([[0, 1, 0.5], [1, 2, 0.9]]);
    expect(saved.spec.clusters).toEqual([{ label: 'Added', members: [1, 2] }]);
  });

  it('should read cooccurrence files with label endpoints and members', async () => {
    await writeCooccurrence({
      path: testFile,
      mode: 'replace',
      terms: [
        { label: 'alpha', frequency: 3 },
        { label: 'beta', frequency: 2 },
      ],
      links: [{ source: 'alpha', target: 'beta', strength: 0.6 }],
      clusters: [{ label: 'Pair', members: ['alpha', 'beta'] }],
    }, tmpDir);

    const read = await readCooccurrence({ path: testFile }, tmpDir);
    expect(read.terms).toEqual([
      { label: 'alpha', frequency: 3 },
      { label: 'beta', frequency: 2 },
    ]);
    expect(read.links).toEqual([{ source: 'alpha', target: 'beta', strength: 0.6, direction: 'none' }]);
    expect(read.clusters).toEqual([{ label: 'Pair', members: ['alpha', 'beta'] }]);
    expect(JSON.stringify(read)).not.toContain('"source":0');
    expect(JSON.stringify(read)).not.toContain('"members":[0');
  });

  it.each([
    [
      'self cooccurrence',
      {
        terms: [{ label: 'alpha', frequency: 1 }],
        links: [{ source: 'alpha', target: 'alpha', strength: 1 }],
      },
    ],
    [
      'duplicate term labels',
      {
        terms: [
          { label: 'alpha', frequency: 1 },
          { label: 'alpha', frequency: 2 },
        ],
        links: [],
      },
    ],
    [
      'negative values',
      {
        terms: [
          { label: 'alpha', frequency: -1 },
          { label: 'beta', frequency: 1 },
        ],
        links: [{ source: 'alpha', target: 'beta', strength: -0.1 }],
      },
    ],
  ])('should not rewrite the file on invalid input: %s', async (_name, invalidInput) => {
    await writeCooccurrence({
      path: testFile,
      mode: 'replace',
      terms: [
        { label: 'stable', frequency: 1 },
        { label: 'base', frequency: 2 },
      ],
      links: [{ source: 'stable', target: 'base', strength: 1 }],
    }, tmpDir);
    const before = await fs.readFile(path.join(tmpDir, testFile), 'utf-8');

    const result = await writeCooccurrence({
      path: testFile,
      mode: 'replace',
      ...invalidInput,
    }, tmpDir);

    expect(result.ok).toBe(false);
    expect(result.errors).toBeDefined();
    expect(await fs.readFile(path.join(tmpDir, testFile), 'utf-8')).toBe(before);
  });

  describe('共起の向き', () => {
    const terms = [
      { label: 'alpha', frequency: 1 },
      { label: 'beta', frequency: 1 },
    ];

    async function write(direction?: 'none' | 'forward' | 'backward' | 'both') {
      return writeCooccurrence(
        {
          path: testFile,
          mode: 'replace',
          terms,
          links: [{ source: 'alpha', target: 'beta', strength: 5, ...(direction ? { direction } : {}) }],
        },
        tmpDir,
      );
    }

    it('名前で書き込むと数値コードで保存される', async () => {
      await write('forward');
      const saved = await readSaved();

      expect(saved.meta.schemaVersion).toBe(2);
      expect(saved.spec.links[0]).toEqual([0, 1, 5, 1]);
    });

    it('逆方向と双方向も保存される', async () => {
      await write('backward');
      expect((await readSaved()).spec.links[0]).toEqual([0, 1, 5, 2]);

      await write('both');
      expect((await readSaved()).spec.links[0]).toEqual([0, 1, 5, 3]);
    });

    it('省略すると無向として保存され版数は 1 のままになる', async () => {
      await write();
      const saved = await readSaved();

      expect(saved.meta.schemaVersion).toBe(1);
      expect(saved.spec.links[0]).toEqual([0, 1, 5]);
    });

    it('読み出すと名前で返る', async () => {
      await write('both');
      const result = await readCooccurrence({ path: testFile }, tmpDir);

      expect(result.links[0]).toMatchObject({ source: 'alpha', target: 'beta', strength: 5, direction: 'both' });
    });

    it('無向は direction: none で返る', async () => {
      await write();
      const result = await readCooccurrence({ path: testFile }, tmpDir);

      expect(result.links[0].direction).toBe('none');
    });

    it('向き付きでも自己共起を拒否しファイルを書き換えない', async () => {
      await write('forward');
      const before = await fs.readFile(path.join(tmpDir, testFile), 'utf-8');
      const result = await writeCooccurrence(
        {
          path: testFile,
          mode: 'replace',
          terms,
          links: [{ source: 'alpha', target: 'alpha', strength: 5, direction: 'forward' }],
        },
        tmpDir,
      );

      expect(result.ok).toBe(false);
      expect(await fs.readFile(path.join(tmpDir, testFile), 'utf-8')).toBe(before);
    });

    it('向き付きでも負の強度を拒否する', async () => {
      const result = await writeCooccurrence(
        {
          path: testFile,
          mode: 'replace',
          terms,
          links: [{ source: 'alpha', target: 'beta', strength: -1, direction: 'both' }],
        },
        tmpDir,
      );

      expect(result.ok).toBe(false);
    });

    it('追記でも向きが保たれる', async () => {
      await write('forward');
      await writeCooccurrence(
        {
          path: testFile,
          mode: 'append',
          terms: [{ label: 'gamma', frequency: 1 }],
          links: [{ source: 'beta', target: 'gamma', strength: 2, direction: 'backward' }],
        },
        tmpDir,
      );
      const saved = await readSaved();

      expect(saved.spec.links).toEqual([
        [0, 1, 5, 1],
        [1, 2, 2, 2],
      ]);
    });
  });

  describe('メモ', () => {
    const terms = [
      { label: 'alpha', frequency: 1 },
      { label: 'beta', frequency: 1 },
    ];

    it('語・共起・クラスタのメモが保存され、版数が 3 になる', async () => {
      await writeCooccurrence(
        {
          path: testFile,
          mode: 'replace',
          terms: [{ ...terms[0], note: '語のメモ\n二行目' }, terms[1]],
          links: [{ source: 'alpha', target: 'beta', strength: 5, note: '共起のメモ' }],
          clusters: [{ label: 'c1', members: ['alpha'], note: 'クラスタのメモ' }],
        },
        tmpDir,
      );
      const saved = await readSaved();

      expect(saved.meta.schemaVersion).toBe(3);
      expect(saved.spec.notes).toEqual({
        nodes: [[0, '語のメモ\n二行目']],
        links: [[0, '共起のメモ']],
        clusters: [[0, 'クラスタのメモ']],
      });
    });

    it('省略するとメモが書かれず版数は 1 のままになる', async () => {
      await writeCooccurrence(
        { path: testFile, mode: 'replace', terms, links: [{ source: 'alpha', target: 'beta', strength: 5 }] },
        tmpDir,
      );
      const saved = await readSaved();

      expect(saved.meta.schemaVersion).toBe(1);
      expect(saved.spec.notes).toBeUndefined();
    });

    it('読み出すとメモが対象に添えて返る', async () => {
      await writeCooccurrence(
        {
          path: testFile,
          mode: 'replace',
          terms: [{ ...terms[0], note: '語のメモ' }, terms[1]],
          links: [{ source: 'alpha', target: 'beta', strength: 5, note: '共起のメモ' }],
          clusters: [{ label: 'c1', members: ['alpha'], note: 'クラスタのメモ' }],
        },
        tmpDir,
      );
      const result = await readCooccurrence({ path: testFile }, tmpDir);

      expect(result.terms[0].note).toBe('語のメモ');
      expect(result.terms[1].note).toBeUndefined();
      expect(result.links[0].note).toBe('共起のメモ');
      expect(result.clusters?.[0].note).toBe('クラスタのメモ');
    });

    it('上限を超えるメモを拒否し、ファイルを書き換えない', async () => {
      await writeCooccurrence(
        { path: testFile, mode: 'replace', terms, links: [{ source: 'alpha', target: 'beta', strength: 5 }] },
        tmpDir,
      );
      const before = await fs.readFile(path.join(tmpDir, testFile), 'utf-8');

      const result = await writeCooccurrence(
        {
          path: testFile,
          mode: 'replace',
          terms: [{ ...terms[0], note: 'あ'.repeat(2001) }, terms[1]],
          links: [{ source: 'alpha', target: 'beta', strength: 5 }],
        },
        tmpDir,
      );

      expect(result.ok).toBe(false);
      expect(result.errors?.some((error) => error.code === 'note-too-long')).toBe(true);
      expect(await fs.readFile(path.join(tmpDir, testFile), 'utf-8')).toBe(before);
    });

    it('空文字のメモを拒否する', async () => {
      const result = await writeCooccurrence(
        {
          path: testFile,
          mode: 'replace',
          terms: [{ ...terms[0], note: '' }, terms[1]],
          links: [{ source: 'alpha', target: 'beta', strength: 5 }],
        },
        tmpDir,
      );

      expect(result.ok).toBe(false);
      expect(result.errors?.some((error) => error.code === 'empty-note')).toBe(true);
    });

    it('追記した語のメモが既存の語のメモを上書きしない', async () => {
      await writeCooccurrence(
        {
          path: testFile,
          mode: 'replace',
          terms: [{ ...terms[0], note: 'alpha のメモ' }, terms[1]],
          links: [{ source: 'alpha', target: 'beta', strength: 5 }],
        },
        tmpDir,
      );
      await writeCooccurrence(
        {
          path: testFile,
          mode: 'append',
          terms: [{ label: 'gamma', frequency: 1, note: 'gamma のメモ' }],
          links: [],
        },
        tmpDir,
      );
      const saved = await readSaved();

      expect(saved.spec.notes?.nodes).toEqual([
        [0, 'alpha のメモ'],
        [2, 'gamma のメモ'],
      ]);
    });
  });

  it('should reject paths outside the root directory', async () => {
    await expect(writeCooccurrence({
      path: '../outside.cooc.json',
      mode: 'replace',
      terms: [{ label: 'alpha', frequency: 1 }],
      links: [],
    }, tmpDir)).rejects.toThrow('Access denied');

    await expect(readCooccurrence({ path: '../outside.cooc.json' }, tmpDir)).rejects.toThrow('Access denied');
  });
});

describe('cooccurrence timeline tools', () => {
  let tmpDir: string;
  const testFile = 'timeline.cooc.json';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-cooc-timeline-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  async function readSaved() {
    return parseCoocFile(await fs.readFile(path.join(tmpDir, testFile), 'utf-8'));
  }

  const INPUT: WriteCooccurrenceInput = {
    path: 'timeline.cooc.json',
    mode: 'replace' as const,
    slices: [
      { label: '1月', at: '2026-01-01' },
      { label: '2月', at: '2026-02-01' },
    ],
    terms: [
      { label: 'alpha', sliceValues: { '1月': 6, '2月': 4 } },
      { label: 'beta', sliceValues: { '1月': 4 } },
    ],
    links: [{ source: 'alpha', target: 'beta', sliceValues: { '1月': 0.9 } }],
  };

  it('スライスの定義とスライス別の値を書き込み、版数 4 で保存する', async () => {
    const result = await writeCooccurrence(INPUT, tmpDir);
    expect(result.ok).toBe(true);

    const saved = await readSaved();
    expect(saved.meta.schemaVersion).toBe(4);
    expect(saved.spec.timeline?.slices).toEqual([
      { label: '1月', at: '2026-01-01' },
      { label: '2月', at: '2026-02-01' },
    ]);
    expect(saved.spec.timeline?.nodes).toEqual([
      [
        [0, 6],
        [1, 4],
      ],
      [[0, 4]],
    ]);
    expect(saved.spec.timeline?.links).toEqual([[[0, 0.9]], []]);
  });

  it('全体値はスライス値の合計から導出する（書き手は指定しない）', async () => {
    await writeCooccurrence(INPUT, tmpDir);
    const saved = await readSaved();
    expect(saved.spec.nodes.map((node) => node.frequency)).toEqual([10, 4]);
    expect(saved.spec.links[0][2]).toBe(0.9);
  });

  it('スライス名の打ち間違いは黙って捨てず、誤りとして返す', async () => {
    const result = await writeCooccurrence(
      { ...INPUT, terms: [{ label: 'alpha', sliceValues: { '3月': 5 } }], links: [] },
      tmpDir,
    );
    expect(result.ok).toBe(false);
    expect(result.errors?.some((error) => error.message.includes('"3月"'))).toBe(true);
  });

  it('読み出しはスライスと、ラベル対応のスライス別の値を返す', async () => {
    await writeCooccurrence(INPUT, tmpDir);
    const result = await readCooccurrence({ path: testFile }, tmpDir);
    expect(result.slices).toEqual([
      { label: '1月', at: '2026-01-01' },
      { label: '2月', at: '2026-02-01' },
    ]);
    expect(result.terms[0]).toEqual({ label: 'alpha', frequency: 10, sliceValues: { '1月': 6, '2月': 4 } });
    expect(result.terms[1]).toEqual({ label: 'beta', frequency: 4, sliceValues: { '1月': 4 } });
    expect(result.links[0].sliceValues).toEqual({ '1月': 0.9 });
  });

  it('時間軸を持たない図では slices も sliceValues も返さない', async () => {
    await writeCooccurrence(
      {
        path: testFile,
        mode: 'replace',
        terms: [{ label: 'alpha', frequency: 3 }],
        links: [],
      },
      tmpDir,
    );
    const result = await readCooccurrence({ path: testFile }, tmpDir);
    expect(result.slices).toBeUndefined();
    expect(result.terms[0]).toEqual({ label: 'alpha', frequency: 3 });
  });

  it('追記で同じスライス名を渡すと、そのスライスの既存の値を残す', async () => {
    await writeCooccurrence(INPUT, tmpDir);
    const result = await writeCooccurrence(
      {
        path: testFile,
        mode: 'append',
        slices: INPUT.slices,
        terms: [{ label: 'gamma', sliceValues: { '2月': 7 } }],
        links: [],
      },
      tmpDir,
    );
    expect(result.ok).toBe(true);
    const saved = await readSaved();
    // 既存の alpha・beta の値が残り、gamma が 2 月へ足される。
    expect(saved.spec.nodes.map((node) => node.frequency)).toEqual([10, 4, 7]);
    expect(saved.spec.timeline?.nodes[1]).toEqual([
      [0, 4],
      [2, 7],
    ]);
  });

  it('日付の並びが時間順でなければ書き込まない', async () => {
    const result = await writeCooccurrence(
      {
        ...INPUT,
        slices: [
          { label: '1月', at: '2026-03-01' },
          { label: '2月', at: '2026-02-01' },
        ],
      },
      tmpDir,
    );
    expect(result.ok).toBe(false);
    expect(result.errors?.map((error) => error.code)).toContain('slice-order-not-chronological');
    await expect(fs.readFile(path.join(tmpDir, testFile), 'utf-8')).rejects.toThrow();
  });
});

describe('時間軸を持つ図への全体値の直接指定', () => {
  let tmpDir: string;
  const testFile = 'timeline.cooc.json';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-cooc-total-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  const BASE: WriteCooccurrenceInput = {
    path: testFile,
    mode: 'replace',
    slices: [{ label: '1月' }, { label: '2月' }],
    terms: [{ label: 'alpha', sliceValues: { '1月': 6, '2月': 4 } }],
    links: [],
  };

  async function savedText(): Promise<string> {
    return fs.readFile(path.join(tmpDir, testFile), 'utf-8');
  }

  it('sliceValues を書かずに frequency だけを渡した追記は拒否し、ファイルを書き換えない', async () => {
    await writeCooccurrence(BASE, tmpDir);
    const before = await savedText();

    const result = await writeCooccurrence(
      {
        path: testFile,
        mode: 'append',
        slices: BASE.slices,
        terms: [{ label: 'gamma', frequency: 5 }],
        links: [],
      },
      tmpDir,
    );

    // 導出に任せると合計 0 へ潰れ、ok:true でどのレイヤーにも現れない語が書き込まれる。
    expect(result.ok).toBe(false);
    expect(result.errors?.map((error) => error.code)).toContain('slice-values-required');
    expect(await savedText()).toBe(before);
  });

  it('replace でも sliceValues を書かずに frequency だけを渡せば拒否する', async () => {
    const result = await writeCooccurrence(
      { ...BASE, terms: [{ label: 'alpha', frequency: 10 }] },
      tmpDir,
    );
    expect(result.ok).toBe(false);
    expect(result.errors?.map((error) => error.code)).toContain('slice-values-required');
  });

  it('共起の strength だけを渡した場合も拒否する', async () => {
    const result = await writeCooccurrence(
      {
        ...BASE,
        terms: [
          { label: 'alpha', sliceValues: { '1月': 6 } },
          { label: 'beta', sliceValues: { '1月': 4 } },
        ],
        links: [{ source: 'alpha', target: 'beta', strength: 0.9 }],
      },
      tmpDir,
    );
    expect(result.ok).toBe(false);
    expect(result.errors?.map((error) => error.code)).toContain('slice-values-required');
  });

  it('frequency と sliceValues の合計が食い違えば、黙って上書きせず拒否する', async () => {
    const result = await writeCooccurrence(
      { ...BASE, terms: [{ label: 'alpha', frequency: 99, sliceValues: { '1月': 6, '2月': 4 } }] },
      tmpDir,
    );
    expect(result.ok).toBe(false);
    expect(result.errors?.map((error) => error.code)).toContain('total-not-editable');
  });

  it('frequency が合計と一致していれば受理する（呼び出し側の確認として書ける）', async () => {
    const result = await writeCooccurrence(
      { ...BASE, terms: [{ label: 'alpha', frequency: 10, sliceValues: { '1月': 6, '2月': 4 } }] },
      tmpDir,
    );
    expect(result.ok).toBe(true);
  });

  it('時間軸を持たない図では従来どおり frequency だけで書ける', async () => {
    const result = await writeCooccurrence(
      { path: testFile, mode: 'replace', terms: [{ label: 'alpha', frequency: 3 }], links: [] },
      tmpDir,
    );
    expect(result.ok).toBe(true);
  });
});
