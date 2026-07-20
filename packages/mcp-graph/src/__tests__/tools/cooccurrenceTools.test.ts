import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { parseCoocFile } from '@anytime-markdown/graph-core/src/presets/cooccurrenceFile';
import { writeCooccurrence } from '../../tools/writeCooccurrence';
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
      { source: 'alpha', target: 'gamma', strength: 0.8 },
      { source: 'beta', target: 'gamma', strength: 0.4 },
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
    expect(read.links).toEqual([{ source: 'alpha', target: 'beta', strength: 0.6 }]);
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
