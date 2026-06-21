import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openDocDb, persistDoc, getDocCoreDbPath } from '@anytime-markdown/doc-core';
import { handleSearchDocs } from '../searchDocs';

describe('handleSearchDocs', () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-docs-'));
    process.env.TRAIL_HOME = dir;
    const db = openDocDb(getDocCoreDbPath());
    persistDoc(db, {
      path: 'spec/a.md',
      title: 'Alpha',
      category: 'x',
      body: 'alpha graph engine',
      related: [{ fromPath: 'spec/a.md', toPath: 'spec/b.md', type: 'depends-on' }],
      sections: [],
      contentHash: 'h1',
    });
    persistDoc(db, { path: 'spec/b.md', title: 'Beta', category: 'x', body: 'beta core module', related: [], sections: [], contentHash: 'h2' });
    db.close();
  });

  afterAll(() => {
    delete process.env.TRAIL_HOME;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keyword mode finds by FTS', async () => {
    const r = (await handleSearchDocs({ mode: 'keyword', query: 'graph' })) as { results: { path: string }[] };
    expect(r.results.map((h) => h.path)).toContain('spec/a.md');
  });

  it('backlinks mode finds who depends-on the target', async () => {
    const r = (await handleSearchDocs({ mode: 'backlinks', path: 'spec/b.md' })) as { results: { path: string }[] };
    expect(r.results.map((e) => e.path)).toContain('spec/a.md');
  });

  it('neighbors mode returns the undirected neighborhood', async () => {
    const r = (await handleSearchDocs({ mode: 'neighbors', path: 'spec/a.md', hops: 1 })) as { results: string[] };
    expect(r.results).toContain('spec/b.md');
  });

  it('semantic mode without embeddings returns empty + note (no ollama call)', async () => {
    const r = (await handleSearchDocs({ mode: 'semantic', query: 'graph' })) as { results: unknown[]; note?: string };
    expect(r.results).toEqual([]);
    expect(r.note).toBeDefined();
  });

  it('requires path for backlinks / neighbors', async () => {
    expect((await handleSearchDocs({ mode: 'backlinks' })) as { error?: string }).toHaveProperty('error');
    expect((await handleSearchDocs({ mode: 'neighbors' })) as { error?: string }).toHaveProperty('error');
  });
});
