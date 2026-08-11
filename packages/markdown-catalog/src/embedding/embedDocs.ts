/**
 * embedding backfill。embedding が無い/古い doc だけを再 embed して catalog_doc_embedding へ保存する。
 * 埋め込み生成は呼出側が注入する {@link EmbedFn}（daemon が ollama bge-m3 を供給。テストは fake）。
 */

import type { DocDb } from '../db/open';
import { splitSections } from '../ingest/splitSections';
import { float32ToBlob } from './blob';

/** テキスト → 埋め込みベクトル。daemon が ollama を、テストが fake を供給する。 */
export type EmbedFn = (text: string) => Promise<number[]>;

/**
 * 埋め込み入力テキストの既定最大文字数。
 *
 * bge-m3 のコンテキスト上限は 8192 トークンで、超過すると ollama が
 * `HTTP 500 {"error":"the input length exceeds the context length"}` を返す
 * （num_ctx を上げてもモデル上限のため解消しない）。日本語 spec は文字あたりの
 * トークン数が高く（実測で ~6000 文字 ≈ 8192 トークン、密度の高い表・漢字主体の
 * doc は 4000 文字でも超過）、全 spec を 3000 文字に切り詰めると実測で 91/91 が成功した。
 * 安全余裕を見て 3000 を既定とする。長文の全体を埋め込むにはチャンク分割が必要（別課題）。
 */
export const DEFAULT_MAX_EMBED_CHARS = 3000;

export interface EmbedOptions {
  /** 埋め込みモデル名（catalog_doc_embedding.model に記録。モデル変更で再 embed される）。 */
  model: string;
  /** 埋め込み対象テキストの最大文字数（既定 {@link DEFAULT_MAX_EMBED_CHARS}）。 */
  maxChars?: number;
}

export interface EmbedResult {
  embedded: number;
  skipped: number;
  /** embed() が throw した件数（ollama 到達不可・timeout 等）。1 件の失敗でバッチ全体を中断しない（止血）。 */
  failed: number;
  /** 最初の失敗のメッセージ。観測用（silent failure 撲滅）。失敗が無ければ未設定。 */
  firstError?: string;
}

interface PendingRow {
  path: string;
  title: string | null;
  excerpt: string | null;
  body: string | null;
}

/**
 * title / excerpt / 見出しアウトライン / body から埋め込み入力テキストを組み立てる。
 * アウトラインは maxChars 切り詰めで溢れる後半のトピック語を埋め込みへ乗せるための
 * 圧縮表現（FR-1。本文詳細の死角は節単位埋め込み側が担う）。
 */
function buildEmbedText(row: PendingRow, maxChars: number): string {
  const outline = row.body
    ? splitSections(row.body)
        .map((s) => s.heading)
        .filter((h) => h.length > 0)
        .join('\n')
    : '';
  return [row.title, row.excerpt, outline || null, row.body]
    .filter((s): s is string => !!s)
    .join('\n\n')
    .slice(0, maxChars);
}

/** 1 doc の embed 結果。空ベクトル（empty）と例外（failed）は呼出側で扱いが違うため分ける。 */
type DocVector =
  | { kind: 'ok'; vec: number[] }
  | { kind: 'empty' }
  | { kind: 'failed'; errorMessage: string };

/** 1 doc を embed する。例外は failed として返し、バッチ全体を中断させない。 */
async function embedOneDoc(text: string, embed: EmbedFn): Promise<DocVector> {
  let vec: number[];
  try {
    vec = await embed(text);
  } catch (err) {
    return { kind: 'failed', errorMessage: err instanceof Error ? err.message : String(err) };
  }
  if (!Array.isArray(vec) || vec.length === 0) return { kind: 'empty' };
  return { kind: 'ok', vec };
}

/**
 * embedding が未生成・content_hash 不一致・model 変更の doc だけを再 embed する（差分 backfill）。
 *
 * @param db    catalog.db
 * @param embed 埋め込み生成関数（注入）
 */
export async function embedDocs(db: DocDb, embed: EmbedFn, opts: EmbedOptions): Promise<EmbedResult> {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_EMBED_CHARS;
  const pending = db
    .prepare(
      `SELECT d.path AS path, d.title AS title, d.excerpt AS excerpt, f.body AS body
       FROM catalog_doc AS d
       LEFT JOIN catalog_doc_embedding AS e ON e.path = d.path
       LEFT JOIN catalog_doc_fts AS f ON f.path = d.path
       WHERE e.path IS NULL OR e.content_hash != d.content_hash OR e.model != ?`,
    )
    .all(opts.model) as unknown as PendingRow[];

  const hashOf = db.prepare('SELECT content_hash FROM catalog_doc WHERE path = ?');
  const upsert = db.prepare(
    `INSERT INTO catalog_doc_embedding (path, model, dim, vec, content_hash)
     VALUES (@path, @model, @dim, @vec, @hash)
     ON CONFLICT(path) DO UPDATE SET model = @model, dim = @dim, vec = @vec, content_hash = @hash`,
  );

  let embedded = 0;
  let failed = 0;
  let firstError: string | undefined;
  for (const row of pending) {
    const text = buildEmbedText(row, maxChars);
    if (!text) continue;
    const result = await embedOneDoc(text, embed);
    if (result.kind === 'failed') {
      // 1 件の embed 失敗（ollama 到達不可・timeout 等）でバッチ全体を中断しない。
      // 失敗を握り潰さず件数と最初のエラーを呼出側へ返す（止血＋観測）。
      failed += 1;
      if (firstError === undefined) firstError = result.errorMessage;
      continue;
    }
    if (result.kind === 'empty') continue;
    const vec = result.vec;
    const hash = (hashOf.get(row.path) as unknown as { content_hash: string } | undefined)?.content_hash;
    if (!hash) continue; // doc が消えた等
    upsert.run({ path: row.path, model: opts.model, dim: vec.length, vec: float32ToBlob(vec), hash });
    embedded += 1;
  }
  return {
    embedded,
    skipped: pending.length - embedded - failed,
    failed,
    ...(firstError === undefined ? {} : { firstError }),
  };
}
