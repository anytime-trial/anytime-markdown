/**
 * 抽出済みドキュメントを doc-core.db へ永続化する（doc / doc_relation / doc_fts）。
 * doc_relation・doc_fts は当該 path で洗い替え（DELETE→INSERT）して冪等にする。
 */

import type { DocDb } from '../db/open';
import type { ExtractedDoc } from '../types';

/** 1 ドキュメントを upsert する（related・FTS も同一トランザクションで更新）。 */
export function persistDoc(db: DocDb, doc: ExtractedDoc, updatedAt = new Date().toISOString()): void {
  const upsertDoc = db.prepare(
    `INSERT INTO doc (path, title, category, type, lang, excerpt, content_hash, updated_at)
     VALUES (@path, @title, @category, @type, @lang, @excerpt, @contentHash, @updatedAt)
     ON CONFLICT(path) DO UPDATE SET
       title = @title, category = @category, type = @type, lang = @lang,
       excerpt = @excerpt, content_hash = @contentHash, updated_at = @updatedAt`,
  );
  const delRel = db.prepare('DELETE FROM doc_relation WHERE from_path = ?');
  const insRel = db.prepare('INSERT OR IGNORE INTO doc_relation (from_path, to_path, type) VALUES (?, ?, ?)');
  const delFts = db.prepare('DELETE FROM doc_fts WHERE path = ?');
  const insFts = db.prepare('INSERT INTO doc_fts (path, title, excerpt, body) VALUES (?, ?, ?, ?)');

  const tx = db.transaction(() => {
    upsertDoc.run({
      path: doc.path,
      title: doc.title ?? null,
      category: doc.category ?? null,
      type: doc.type ?? null,
      lang: doc.lang ?? null,
      excerpt: doc.excerpt ?? null,
      contentHash: doc.contentHash,
      updatedAt,
    });
    delRel.run(doc.path);
    for (const r of doc.related) insRel.run(r.fromPath, r.toPath, r.type);
    delFts.run(doc.path);
    insFts.run(doc.path, doc.title ?? '', doc.excerpt ?? '', doc.body);
  });
  tx();
}

/** 既存 doc の content_hash を返す（未登録なら undefined）。増分判定用。 */
export function getStoredHash(db: DocDb, path: string): string | undefined {
  const row = db.prepare('SELECT content_hash FROM doc WHERE path = ?').get(path) as
    | { content_hash: string }
    | undefined;
  return row?.content_hash;
}
