import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openDocDb, type DocDb } from '../../db/open';
import { ingestDocs } from '../../ingest/ingestDocs';
import { searchSections } from '../searchSections';

function writeDoc(root: string, rel: string, fm: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `---\n${fm}\n---\n\n${body}\n`, 'utf8');
}

describe('searchSections (heading-granular FTS)', () => {
  let dir: string;
  let db: DocDb;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-core-sections-'));
    writeDoc(
      dir,
      'spec/a.ja.md',
      'title: doc-a\ncategory: graph\ntype: spec\nlang: ja',
      '# Overview\nintro about graph\n## Rendering pipeline\ncanvas rendering details here\n## Storage layer\nsqlite storage notes',
    );
    writeDoc(
      dir,
      'spec/b.ja.md',
      'title: doc-b\ncategory: viewer\ntype: spec\nlang: ja',
      '# Viewer\n## Rendering pipeline\nviewer rendering canvas',
    );
    db = openDocDb(':memory:');
    await ingestDocs(db, dir, { updatedAt: '2026-06-21T00:00:00.000Z' });
  });

  afterAll(() => {
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns heading + snippet for matching sections', () => {
    const hits = searchSections(db, { query: 'rendering' });
    expect(hits.length).toBeGreaterThan(0);
    const headings = hits.map((h) => h.heading);
    expect(headings).toContain('Rendering pipeline');
    const hit = hits.find((h) => h.path === 'spec/a.ja.md' && h.heading === 'Rendering pipeline');
    expect(hit).toBeDefined();
    expect(hit!.level).toBe(2);
    expect(typeof hit!.snippet).toBe('string');
    expect(hit!.snippet).toMatch(/rendering/i);
  });

  it('matches against heading text too', () => {
    const hits = searchSections(db, { query: 'Storage' });
    expect(hits.map((h) => h.heading)).toContain('Storage layer');
  });

  it('honors facets (category) alongside the query', () => {
    const hits = searchSections(db, { query: 'rendering', category: 'viewer' });
    expect(hits.every((h) => h.path === 'spec/b.ja.md')).toBe(true);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('returns empty array for a query with no FTS terms', () => {
    expect(searchSections(db, { query: '   ' })).toEqual([]);
  });

  it('caps results at default limit 8', async () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-core-sections-limit-'));
    const sections = Array.from({ length: 12 }, (_, i) => `## Section ${i}\nrepeated keyword zebra body ${i}`).join('\n');
    writeDoc(dir2, 'spec/big.ja.md', 'title: big', `# Top\n${sections}`);
    const db2 = openDocDb(':memory:');
    await ingestDocs(db2, dir2, { updatedAt: '2026-06-21T00:00:00.000Z' });
    expect(searchSections(db2, { query: 'zebra' }).length).toBe(8);
    expect(searchSections(db2, { query: 'zebra', limit: 3 }).length).toBe(3);
    db2.close();
    fs.rmSync(dir2, { recursive: true, force: true });
  });
});
