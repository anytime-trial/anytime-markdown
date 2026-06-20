import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openDocDb, type DocDb } from '../db/open';
import { ingestDocs } from '../ingest/ingestDocs';
import { backlinks, forwardLinks, neighbors, byCategory } from '../retrieve/structural';
import { searchFts } from '../retrieve/fts';

function writeDoc(root: string, rel: string, fm: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `---\n${fm}\n---\n\n${body}\n`, 'utf8');
}

describe('doc-core ingest + retrieve (integration)', () => {
  let dir: string;
  let db: DocDb;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-core-'));
    writeDoc(dir, 'spec/51.graph-core/graph-core.ja.md', 'title: graph-core\ncategory: graph', 'graph core engine and state');
    writeDoc(
      dir,
      'spec/54.graph-viewer/graph-viewer.ja.md',
      'title: graph-viewer\ncategory: graph\nrelated:\n  - to: "spec/51.graph-core/graph-core.ja.md"\n    type: depends-on',
      'graph viewer UI built on graph-core',
    );
    writeDoc(
      dir,
      'spec/55.mindmap-viewer/mindmap-viewer.ja.md',
      'title: mindmap-viewer\ncategory: mindmap\nrelated:\n  - to: "spec/51.graph-core/graph-core.ja.md"\n    type: depends-on',
      'mindmap web component over graph-core canvas',
    );
    writeDoc(dir, 'spec/skip.ja.md', 'title: skip\ngraph: false', 'should be excluded');

    db = openDocDb(':memory:');
  });

  afterAll(() => {
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('ingests title-bearing docs and excludes graph:false', async () => {
    const r = await ingestDocs(db, dir, { updatedAt: '2026-06-20T00:00:00.000Z' });
    expect(r.scanned).toBe(4);
    expect(r.ingested).toBe(3); // skip.ja.md excluded
    const count = (db.prepare('SELECT COUNT(*) AS n FROM doc').get() as { n: number }).n;
    expect(count).toBe(3);
  });

  it('is incremental on second run (no changes → all skipped)', async () => {
    const r = await ingestDocs(db, dir, { updatedAt: '2026-06-20T00:00:00.000Z' });
    expect(r.ingested).toBe(0);
    expect(r.skipped).toBe(3);
  });

  it('answers backlinks (who depends-on graph-core)', () => {
    const bl = backlinks(db, 'spec/51.graph-core/graph-core.ja.md', 'depends-on').map((e) => e.path).sort();
    expect(bl).toEqual(
      ['spec/54.graph-viewer/graph-viewer.ja.md', 'spec/55.mindmap-viewer/mindmap-viewer.ja.md'].sort(),
    );
  });

  it('answers forward links and neighbors (undirected BFS)', () => {
    const fwd = forwardLinks(db, 'spec/54.graph-viewer/graph-viewer.ja.md').map((e) => e.path);
    expect(fwd).toEqual(['spec/51.graph-core/graph-core.ja.md']);

    const n1 = neighbors(db, 'spec/51.graph-core/graph-core.ja.md', { hops: 1 }).sort();
    // 1 ホップ: 自身 + バックリンク 2 件
    expect(n1).toEqual(
      [
        'spec/51.graph-core/graph-core.ja.md',
        'spec/54.graph-viewer/graph-viewer.ja.md',
        'spec/55.mindmap-viewer/mindmap-viewer.ja.md',
      ].sort(),
    );
  });

  it('filters neighbors by category', () => {
    expect(byCategory(db, 'graph').sort()).toEqual(
      ['spec/51.graph-core/graph-core.ja.md', 'spec/54.graph-viewer/graph-viewer.ja.md'].sort(),
    );
  });

  it('keyword search via FTS5', () => {
    const hits = searchFts(db, 'mindmap canvas').map((h) => h.path);
    expect(hits).toContain('spec/55.mindmap-viewer/mindmap-viewer.ja.md');
    const none = searchFts(db, 'nonexistentkeyword');
    expect(none).toEqual([]);
  });
});
