import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openDocDb, type DocDb } from '../../db/open';
import { ingestDocs } from '../../ingest/ingestDocs';
import { embedDocs, type EmbedFn } from '../embedDocs';

/**
 * 止血(RC3): embed() の単発失敗(ollama到達不可・timeout等)でバッチ全体を中断せず、
 * 失敗件数と最初のエラーを返す回帰。従来は1件の throw が embedDocs 全体を巻き込み
 * doc_embedding=0 を招いていた。
 */
describe('embedDocs resilience on per-item embed failure', () => {
  let dir: string;
  let db: DocDb;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-core-resil-'));
    const write = (rel: string, title: string, body: string) => {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, `---\ntitle: ${title}\ncategory: sample\n---\n\n${body}\n`, 'utf8');
    };
    write('spec/a/a.ja.md', 'doc-a', 'alpha body');
    write('spec/b/b.ja.md', 'doc-b', 'bravo body BOOM');
    write('spec/c/c.ja.md', 'doc-c', 'charlie body');
    db = openDocDb(':memory:');
    await ingestDocs(db, dir, { updatedAt: '2026-06-22T00:00:00.000Z' });
  });

  afterEach(() => {
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('1件の embed 失敗でバッチを中断せず failed を数えて続行する', async () => {
    // 'BOOM' を含む doc(=doc-b)だけ embed が throw する。
    const embed: EmbedFn = (text: string) => {
      if (text.includes('BOOM')) return Promise.reject(new Error('ollama_unreachable'));
      return Promise.resolve([text.length % 5, 0.5, -0.25]);
    };
    const r = await embedDocs(db, embed, { model: 'test-model' });

    expect(r.embedded).toBe(2); // a, c は成功
    expect(r.failed).toBe(1); // b は失敗だが全体は止まらない
    expect(r.firstError).toContain('ollama_unreachable');
    // 成功分は実際に書き込まれている。
    const cnt = (db.prepare('SELECT COUNT(*) AS c FROM doc_embedding').get() as unknown as { c: number }).c;
    expect(cnt).toBe(2);
  });

  it('全件失敗でも throw せず failed=全件・embedded=0 を返す', async () => {
    const embed: EmbedFn = () => Promise.reject(new Error('ollama down'));
    const r = await embedDocs(db, embed, { model: 'test-model' });
    expect(r.embedded).toBe(0);
    expect(r.failed).toBe(3);
    expect(r.firstError).toContain('ollama down');
  });
});
