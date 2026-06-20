import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openDocDb, type DocDb } from '../db/open';
import { ingestDocs } from '../ingest/ingestDocs';
import { embedDocs, type EmbedFn } from '../embedding/embedDocs';
import { searchSemantic } from '../retrieve/semantic';

// 固定語彙のカウントベクトルを返す決定論的 fake embedder（ollama 非依存）。
const VOCAB = ['graph', 'mindmap', 'spreadsheet', 'core', 'viewer', 'engine', 'canvas'];
const fakeEmbed: EmbedFn = async (text: string) => {
  const lower = text.toLowerCase();
  return VOCAB.map((w) => {
    let n = 0;
    let i = lower.indexOf(w);
    while (i !== -1) {
      n += 1;
      i = lower.indexOf(w, i + w.length);
    }
    return n;
  });
};

function writeDoc(root: string, rel: string, fm: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `---\n${fm}\n---\n\n${body}\n`, 'utf8');
}

describe('doc-core semantic search (fake embedder)', () => {
  let dir: string;
  let db: DocDb;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-core-sem-'));
    writeDoc(dir, 'spec/graph-core.ja.md', 'title: graph-core\ncategory: graph', 'graph core rendering engine and state');
    writeDoc(dir, 'spec/mindmap.ja.md', 'title: mindmap-viewer\ncategory: mindmap', 'mindmap web component over canvas');
    writeDoc(dir, 'spec/sheet.ja.md', 'title: spreadsheet-core\ncategory: spreadsheet', 'spreadsheet core sheet adapter');
    db = openDocDb(':memory:');
    await ingestDocs(db, dir, { updatedAt: '2026-06-20T00:00:00.000Z' });
  });

  afterAll(() => {
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('embeds only docs lacking up-to-date embeddings (incremental)', async () => {
    const first = await embedDocs(db, fakeEmbed, { model: 'fake-v1' });
    expect(first.embedded).toBe(3);
    const second = await embedDocs(db, fakeEmbed, { model: 'fake-v1' });
    expect(second.embedded).toBe(0); // content_hash unchanged
    const count = (db.prepare('SELECT COUNT(*) AS n FROM doc_embedding').get() as { n: number }).n;
    expect(count).toBe(3);
  });

  it('re-embeds when the model changes', async () => {
    const r = await embedDocs(db, fakeEmbed, { model: 'fake-v2' });
    expect(r.embedded).toBe(3);
  });

  it('ranks the semantically closest doc first', async () => {
    const hits = await searchSemantic(db, fakeEmbed, 'mindmap canvas', 3);
    expect(hits[0].path).toBe('spec/mindmap.ja.md');

    const sheetHits = await searchSemantic(db, fakeEmbed, 'spreadsheet sheet', 3);
    expect(sheetHits[0].path).toBe('spec/sheet.ja.md');
  });
});
