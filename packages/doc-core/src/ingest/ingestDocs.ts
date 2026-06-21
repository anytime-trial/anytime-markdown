/**
 * ドキュメント ingest のオーケストレーション（discover → extract → 増分判定 → persist）。
 * 純粋 fs/DB 操作のみ（ollama embedding は別段＝Phase 2 の backfill が担う）。
 */

import * as fsp from 'node:fs/promises';
import type { DocDb } from '../db/open';
import { withTx } from '../db/tx';
import { discoverDocs } from './discoverDocs';
import { extractDoc } from './extractDoc';
import { getStoredHash, persistDoc } from './persist';

export interface IngestResult {
  scanned: number;
  ingested: number;
  skipped: number;
  removed: number;
}

export interface IngestOptions {
  /** 走査サブディレクトリ（既定 `spec`）。 */
  subDir?: string;
  /** updated_at の固定値（テスト用・既定 now）。 */
  updatedAt?: string;
  /** 消えた/除外された doc を DB から削除する（既定 false）。 */
  prune?: boolean;
}

/**
 * docsRoot 配下を ingest して doc-core.db を更新する。content_hash 不変はスキップ。
 *
 * @param db   doc-core.db コネクション
 * @param docsRoot ドキュメントリポジトリのルート（relPath の基準）
 */
export async function ingestDocs(db: DocDb, docsRoot: string, opts: IngestOptions = {}): Promise<IngestResult> {
  const discovered = await discoverDocs(docsRoot, opts.subDir);
  const seen = new Set<string>();
  let ingested = 0;
  let skipped = 0;

  for (const d of discovered) {
    let content: string;
    try {
      content = await fsp.readFile(d.absPath, 'utf8');
    } catch {
      continue;
    }
    const doc = extractDoc(d.relPath, content);
    if (!doc) continue; // title なし / graph:false / 解析不能
    seen.add(doc.path);
    if (getStoredHash(db, doc.path) === doc.contentHash) {
      skipped += 1;
      continue;
    }
    persistDoc(db, doc, opts.updatedAt);
    ingested += 1;
  }

  let removed = 0;
  if (opts.prune) {
    const existing = (db.prepare('SELECT path FROM doc').all() as unknown as { path: string }[]).map((r) => r.path);
    const delDoc = db.prepare('DELETE FROM doc WHERE path = ?'); // doc_embedding は FK CASCADE
    const delRel = db.prepare('DELETE FROM doc_relation WHERE from_path = ?');
    const delFts = db.prepare('DELETE FROM doc_fts WHERE path = ?');
    withTx(db, () => {
      for (const p of existing) {
        if (seen.has(p)) continue;
        delDoc.run(p);
        delRel.run(p);
        delFts.run(p);
        removed += 1;
      }
    });
  }

  return { scanned: discovered.length, ingested, skipped, removed };
}
