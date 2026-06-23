import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openDocDb, type DocDb } from '../../db/open';
import { ingestDocs } from '../../ingest/ingestDocs';
import { embedDocs, DEFAULT_MAX_EMBED_CHARS, type EmbedFn } from '../embedDocs';

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

/**
 * RC3 続: bge-m3 の 8192 トークン上限超過(HTTP 500)を防ぐため、埋め込み入力を
 * 既定 DEFAULT_MAX_EMBED_CHARS(=3000) に切り詰める回帰。旧既定 8000 では密度の高い
 * 日本語 doc が context length 超過で 500 になり doc_embedding が空になっていた。
 */
describe('embedDocs truncates input to maxChars (bge-m3 context guard)', () => {
  let dir: string;
  let db: DocDb;
  const longBody = 'あ'.repeat(20000); // 20k 文字の日本語本文

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-core-trunc-'));
    const abs = path.join(dir, 'spec/long/long.ja.md');
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `---\ntitle: long\ncategory: s\n---\n\n${longBody}\n`, 'utf8');
    db = openDocDb(':memory:');
    await ingestDocs(db, dir, { updatedAt: '2026-06-22T00:00:00.000Z' });
  });

  afterEach(() => {
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('既定では embed に渡るテキストが DEFAULT_MAX_EMBED_CHARS 以下', async () => {
    expect(DEFAULT_MAX_EMBED_CHARS).toBe(3000);
    let seenLen = -1;
    const spy: EmbedFn = (text) => {
      seenLen = text.length;
      return Promise.resolve([1, 0.5, -0.25]);
    };
    const r = await embedDocs(db, spy, { model: 'test-model' });
    expect(r.embedded).toBe(1);
    expect(seenLen).toBeLessThanOrEqual(DEFAULT_MAX_EMBED_CHARS);
  });

  it('maxChars override が効く', async () => {
    let seenLen = -1;
    const spy: EmbedFn = (text) => {
      seenLen = text.length;
      return Promise.resolve([1, 0.5, -0.25]);
    };
    await embedDocs(db, spy, { model: 'test-model', maxChars: 500 });
    expect(seenLen).toBeLessThanOrEqual(500);
  });
});
