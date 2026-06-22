import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openDocDb, type DocDb } from '../../db/open';
import { ingestDocs } from '../../ingest/ingestDocs';
import { searchDocs } from '../searchDocs';

function writeDoc(root: string, rel: string, fm: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `---\n${fm}\n---\n\n${body}\n`, 'utf8');
}

describe('searchDocs (facet + keyword)', () => {
  let dir: string;
  let db: DocDb;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-core-facet-'));
    writeDoc(dir, 'spec/a.ja.md', 'title: spec-ja\ncategory: graph\ntype: spec\nlang: ja\nexcerpt: グラフエンジンの設計', 'graph engine spec');
    writeDoc(dir, 'spec/b.en.md', 'title: spec-en\ncategory: graph\ntype: spec\nlang: en', 'graph engine spec english');
    writeDoc(dir, 'spec/c.ja.md', 'title: plan-ja\ncategory: graph\ntype: plan\nlang: ja', 'graph migration plan');
    db = openDocDb(':memory:');
    await ingestDocs(db, dir, { updatedAt: '2026-06-21T00:00:00.000Z' });
  });

  afterAll(() => {
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('filters by type facet only', () => {
    const hits = searchDocs(db, { type: 'spec' }).map((h) => h.path).sort();
    expect(hits).toEqual(['spec/a.ja.md', 'spec/b.en.md']);
  });

  it('filters by lang facet only', () => {
    const hits = searchDocs(db, { lang: 'ja' }).map((h) => h.path).sort();
    expect(hits).toEqual(['spec/a.ja.md', 'spec/c.ja.md']);
  });

  it('combines facets (type AND lang)', () => {
    const hits = searchDocs(db, { type: 'spec', lang: 'ja' }).map((h) => h.path);
    expect(hits).toEqual(['spec/a.ja.md']);
  });

  it('combines keyword with facet', () => {
    const hits = searchDocs(db, { query: 'plan', category: 'graph' }).map((h) => h.path);
    expect(hits).toEqual(['spec/c.ja.md']);
  });

  it('keyword with non-matching facet yields nothing', () => {
    const hits = searchDocs(db, { query: 'graph', type: 'nonexistent' });
    expect(hits).toEqual([]);
  });

  it('no facet and no query returns all (path order)', () => {
    const hits = searchDocs(db, {}).map((h) => h.path);
    expect(hits).toEqual(['spec/a.ja.md', 'spec/b.en.md', 'spec/c.ja.md']);
  });

  it('keyword hit carries snippet and excerpt (B-1)', () => {
    const hit = searchDocs(db, { query: 'engine' }).find((h) => h.path === 'spec/a.ja.md');
    expect(hit).toBeDefined();
    expect(typeof hit!.snippet).toBe('string');
    expect(hit!.snippet).toMatch(/engine/i);
    expect(hit!.excerpt).toBe('グラフエンジンの設計');
  });

  it('facet-only hit carries excerpt but no snippet (B-1)', () => {
    const hit = searchDocs(db, { type: 'spec', lang: 'ja' })[0];
    expect(hit.path).toBe('spec/a.ja.md');
    expect(hit.excerpt).toBe('グラフエンジンの設計');
    expect(hit.snippet).toBeUndefined();
  });
});

describe('searchDocs default limit (B-4)', () => {
  let dir: string;
  let db: DocDb;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-core-limit-'));
    for (let i = 0; i < 10; i++) {
      writeDoc(dir, `spec/n${i}.ja.md`, `title: doc-${i}\ncategory: bulk`, `bulk doc ${i}`);
    }
    db = openDocDb(':memory:');
    await ingestDocs(db, dir, { updatedAt: '2026-06-21T00:00:00.000Z' });
  });

  afterAll(() => {
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('caps facet results at default limit 8', () => {
    expect(searchDocs(db, { category: 'bulk' }).length).toBe(8);
  });

  it('honors explicit limit', () => {
    expect(searchDocs(db, { category: 'bulk', limit: 3 }).length).toBe(3);
  });
});
