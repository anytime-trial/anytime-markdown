import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openDocDb, type DocDb } from '../../db/open';
import { ingestDocs } from '../../ingest/ingestDocs';
import { embedDocs, type EmbedFn } from '../embedDocs';
import { searchSemantic } from '../../retrieve/semantic';

/**
 * node:sqlite 下での embedding BLOB ラウンドトリップ回帰。
 * float32ToBlob(書込) → SELECT vec(読出) → blobToFloat32 が node:sqlite の
 * Uint8Array 返却で壊れないことを固定する（trail-server の semantic 経路を担保）。
 */
describe('doc-core embedding BLOB round-trip (node:sqlite)', () => {
  let dir: string;
  let db: DocDb;
  // 決定的な擬似 embedding（文字数で 1 次元目を変える簡易ベクトル）。
  const fakeEmbed: EmbedFn = (text: string) => Promise.resolve([text.length % 7, 0.5, -0.25]);

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-core-emb-'));
    const abs = path.join(dir, 'spec/x.ja.md');
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '---\ntitle: emb-doc\ncategory: graph\n---\n\nembedding round trip body\n', 'utf8');
    db = openDocDb(':memory:');
    await ingestDocs(db, dir, { updatedAt: '2026-06-21T00:00:00.000Z' });
  });

  afterAll(() => {
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes and reads embedding vectors via BLOB', async () => {
    const r = await embedDocs(db, fakeEmbed, { model: 'test-model' });
    expect(r.embedded).toBe(1);

    const stored = db
      .prepare('SELECT dim, vec FROM doc_embedding WHERE path = ?')
      .get('spec/x.ja.md') as unknown as { dim: number; vec: Uint8Array };
    expect(stored.dim).toBe(3);
    expect(stored.vec.byteLength).toBe(12); // 3 × Float32

    const hits = await searchSemantic(db, fakeEmbed, 'embedding round trip', 5);
    expect(hits.map((h) => h.path)).toContain('spec/x.ja.md');
  });
});
