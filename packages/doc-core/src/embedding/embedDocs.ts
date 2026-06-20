/**
 * embedding backfill。embedding が無い/古い doc だけを再 embed して doc_embedding へ保存する。
 * 埋め込み生成は呼出側が注入する {@link EmbedFn}（daemon が ollama bge-m3 を供給。テストは fake）。
 */

import type { DocDb } from '../db/open';
import { float32ToBlob } from './blob';

/** テキスト → 埋め込みベクトル。daemon が ollama を、テストが fake を供給する。 */
export type EmbedFn = (text: string) => Promise<number[]>;

export interface EmbedOptions {
  /** 埋め込みモデル名（doc_embedding.model に記録。モデル変更で再 embed される）。 */
  model: string;
  /** 埋め込み対象テキストの最大文字数（既定 8000）。 */
  maxChars?: number;
}

export interface EmbedResult {
  embedded: number;
  skipped: number;
}

interface PendingRow {
  path: string;
  title: string | null;
  excerpt: string | null;
  body: string | null;
}

/** title / excerpt / body から埋め込み入力テキストを組み立てる。 */
function buildEmbedText(row: PendingRow, maxChars: number): string {
  return [row.title, row.excerpt, row.body].filter((s): s is string => !!s).join('\n\n').slice(0, maxChars);
}

/**
 * embedding が未生成・content_hash 不一致・model 変更の doc だけを再 embed する（差分 backfill）。
 *
 * @param db    doc-core.db
 * @param embed 埋め込み生成関数（注入）
 */
export async function embedDocs(db: DocDb, embed: EmbedFn, opts: EmbedOptions): Promise<EmbedResult> {
  const maxChars = opts.maxChars ?? 8000;
  const pending = db
    .prepare(
      `SELECT d.path AS path, d.title AS title, d.excerpt AS excerpt, f.body AS body
       FROM doc AS d
       LEFT JOIN doc_embedding AS e ON e.path = d.path
       LEFT JOIN doc_fts AS f ON f.path = d.path
       WHERE e.path IS NULL OR e.content_hash != d.content_hash OR e.model != ?`,
    )
    .all(opts.model) as PendingRow[];

  const hashOf = db.prepare('SELECT content_hash FROM doc WHERE path = ?');
  const upsert = db.prepare(
    `INSERT INTO doc_embedding (path, model, dim, vec, content_hash)
     VALUES (@path, @model, @dim, @vec, @hash)
     ON CONFLICT(path) DO UPDATE SET model = @model, dim = @dim, vec = @vec, content_hash = @hash`,
  );

  let embedded = 0;
  for (const row of pending) {
    const text = buildEmbedText(row, maxChars);
    if (!text) continue;
    const vec = await embed(text);
    if (!Array.isArray(vec) || vec.length === 0) continue;
    const hash = (hashOf.get(row.path) as { content_hash: string } | undefined)?.content_hash;
    if (!hash) continue; // doc が消えた等
    upsert.run({ path: row.path, model: opts.model, dim: vec.length, vec: float32ToBlob(vec), hash });
    embedded += 1;
  }
  return { embedded, skipped: pending.length - embedded };
}
