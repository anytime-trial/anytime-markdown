/**
 * embedSections の差分 backfill 仕様（FR-4 / AC-2・AC-3）:
 * - doc の content_hash 変更でその doc の節埋め込みだけが洗い替えられる
 * - 一部の節が embed 失敗した doc は何も永続化されず次回 backfill で再試行される
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openDocDb, type DocDb } from '../../db/open';
import { ingestDocs } from '../../ingest/ingestDocs';
import { embedSections } from '../embedSections';
import type { EmbedFn } from '../embedDocs';

const DOC_A = 'spec/a.ja.md';
const DOC_B = 'spec/b.ja.md';

function writeDoc(dir: string, rel: string, body: string): void {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `---\ntitle: ${path.basename(rel)}\n---\n\n${body}\n`, 'utf8');
}

function sectionRows(db: DocDb, p: string): Array<{ section_idx: number; heading: string }> {
  return db
    .prepare('SELECT section_idx, heading FROM doc_section_embedding WHERE path = ? ORDER BY section_idx')
    .all(p) as unknown as Array<{ section_idx: number; heading: string }>;
}

describe('embedSections', () => {
  let dir: string;
  let db: DocDb;
  const okEmbed: EmbedFn = (text: string) => Promise.resolve([text.length % 7, 0.5, -0.25]);

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-core-sec-emb-'));
    writeDoc(dir, DOC_A, ['# 親', 'p', '## 子1', 'c1', '## 子2', 'c2'].join('\n'));
    writeDoc(dir, DOC_B, ['# 単独', 'b 本文'].join('\n'));
    db = openDocDb(':memory:');
    await ingestDocs(db, dir, { updatedAt: '2026-07-24T00:00:00.000Z' });
  });

  afterEach(() => {
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('葉節のみ埋め込まれ、2 回目は差分ゼロでスキップされる', async () => {
    const r1 = await embedSections(db, okEmbed, { model: 'test-model' });
    expect(r1.docsEmbedded).toBe(2);
    expect(r1.sectionsEmbedded).toBe(3); // A: 子1・子2 / B: 単独
    expect(sectionRows(db, DOC_A).map((s) => s.heading)).toEqual(['子1', '子2']);

    const r2 = await embedSections(db, okEmbed, { model: 'test-model' });
    expect(r2.docsEmbedded).toBe(0);
    expect(r2.sectionsEmbedded).toBe(0);
  });

  test('doc の content_hash 変更でその doc だけ洗い替えられる (AC-2)', async () => {
    await embedSections(db, okEmbed, { model: 'test-model' });
    const beforeB = db
      .prepare('SELECT content_hash FROM doc_section_embedding WHERE path = ?')
      .get(DOC_B) as unknown as { content_hash: string };

    // A のみ変更（節構成も変わる）して再 ingest → A だけ再埋め込み。
    writeDoc(dir, DOC_A, ['# 新章', '本文だけ'].join('\n'));
    await ingestDocs(db, dir, { updatedAt: '2026-07-24T01:00:00.000Z' });
    const r = await embedSections(db, okEmbed, { model: 'test-model' });
    expect(r.docsEmbedded).toBe(1);
    expect(sectionRows(db, DOC_A).map((s) => s.heading)).toEqual(['新章']);
    const afterB = db
      .prepare('SELECT content_hash FROM doc_section_embedding WHERE path = ?')
      .get(DOC_B) as unknown as { content_hash: string };
    expect(afterB.content_hash).toBe(beforeB.content_hash);
  });

  test('model 変更で全 doc が再埋め込みされる', async () => {
    await embedSections(db, okEmbed, { model: 'model-v1' });
    const r = await embedSections(db, okEmbed, { model: 'model-v2' });
    expect(r.docsEmbedded).toBe(2);
    const models = db
      .prepare('SELECT DISTINCT model FROM doc_section_embedding')
      .all() as unknown as Array<{ model: string }>;
    expect(models.map((m) => m.model)).toEqual(['model-v2']);
  });

  test('一部の節が失敗した doc は何も永続化されず次回再試行される (AC-3)', async () => {
    // A の 2 節目（c1 を含む）だけ失敗させる。
    const flaky: EmbedFn = (text: string) =>
      text.includes('c2') ? Promise.reject(new Error('ollama_unreachable')) : okEmbed(text);
    const r1 = await embedSections(db, flaky, { model: 'test-model' });
    expect(r1.failed).toBe(1);
    expect(r1.firstError).toContain('ollama_unreachable');
    expect(r1.docsEmbedded).toBe(1); // B は成功
    expect(sectionRows(db, DOC_A)).toEqual([]); // 部分永続化しない

    // 復旧後の再実行で A が完了する。
    const r2 = await embedSections(db, okEmbed, { model: 'test-model' });
    expect(r2.docsEmbedded).toBe(1);
    expect(sectionRows(db, DOC_A).map((s) => s.heading)).toEqual(['子1', '子2']);
  });

  test('切り詰め: maxChars を超える節は先頭のみ embed に渡る', async () => {
    const seen: string[] = [];
    const spy: EmbedFn = (text: string) => {
      seen.push(text);
      return Promise.resolve([1, 0, 0]);
    };
    await embedSections(db, spy, { model: 'test-model', maxChars: 5 });
    expect(seen.every((t) => t.length <= 5)).toBe(true);
  });
});
