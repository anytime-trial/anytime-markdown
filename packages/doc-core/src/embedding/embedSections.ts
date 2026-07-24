/**
 * 節単位埋め込みの差分 backfill（FR-2〜FR-4）。
 *
 * 差分判定は doc の content_hash（節の安定 ID は持たない）。doc が変わったら
 * その doc の節埋め込みを洗い替える。1 doc 内の永続化は all-or-nothing
 * （一部の節の embed 失敗時は何も書かず、次回 backfill で doc ごと再試行）と
 * することで、「hash 一致 = 全節が埋め込み済み」の不変条件を保つ。
 */

import type { DocDb } from '../db/open';
import { float32ToBlob } from './blob';
import { selectEmbedSections } from './selectEmbedSections';
import { DEFAULT_MAX_EMBED_CHARS, type EmbedFn, type EmbedOptions } from './embedDocs';

export interface EmbedSectionsResult {
  /** 節埋め込みを永続化した doc 数。 */
  docsEmbedded: number;
  /** 永続化した節数。 */
  sectionsEmbedded: number;
  /** pending だが対象節が無い等でスキップした doc 数。 */
  skipped: number;
  /** embed() が throw し永続化しなかった doc 数（次回再試行）。 */
  failed: number;
  /** 最初の失敗のメッセージ。観測用（silent failure 撲滅）。失敗が無ければ未設定。 */
  firstError?: string;
}

interface PendingRow {
  path: string;
  body: string | null;
}

/**
 * 節埋め込みが未生成・doc の content_hash 不一致・model 変更の doc だけを
 * 節単位で再埋め込みする（差分 backfill）。
 *
 * @param db    doc-core.db
 * @param embed 埋め込み生成関数（注入。daemon が ollama を、テストが fake を供給する）
 */
export async function embedSections(db: DocDb, embed: EmbedFn, opts: EmbedOptions): Promise<EmbedSectionsResult> {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_EMBED_CHARS;
  // all-or-nothing 永続化により同一 path の hash / model は常に均一（MIN は代表値の取得）。
  const pending = db
    .prepare(
      `SELECT d.path AS path, f.body AS body
       FROM doc AS d
       LEFT JOIN (
         SELECT path, MIN(content_hash) AS content_hash, MIN(model) AS model
         FROM doc_section_embedding GROUP BY path
       ) AS e ON e.path = d.path
       LEFT JOIN doc_fts AS f ON f.path = d.path
       WHERE e.path IS NULL OR e.content_hash != d.content_hash OR e.model != ?`,
    )
    .all(opts.model) as unknown as PendingRow[];

  const hashOf = db.prepare('SELECT content_hash FROM doc WHERE path = ?');
  const del = db.prepare('DELETE FROM doc_section_embedding WHERE path = ?');
  const ins = db.prepare(
    `INSERT INTO doc_section_embedding (path, section_idx, heading, level, model, dim, vec, content_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  let docsEmbedded = 0;
  let sectionsEmbedded = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (const row of pending) {
    const sections = selectEmbedSections(row.body ?? '');
    if (sections.length === 0) {
      // body が空へ遷移した doc の旧節を残さない（洗い替えの対称性。残すと削除済み内容が
      // granularity: section の検索に無期限に返り続ける）。
      del.run(row.path);
      continue; // skipped（対象節なし。pending のままだが embed コストはゼロ）
    }

    const vecs: number[][] = [];
    let docFailed = false;
    for (const s of sections) {
      try {
        const vec = await embed(s.text.slice(0, maxChars));
        if (!Array.isArray(vec) || vec.length === 0) {
          docFailed = true;
          break;
        }
        vecs.push(vec);
      } catch (err) {
        // 1 節の失敗（ollama 到達不可・timeout 等）で doc を未完了扱いにし、他 doc へ続行。
        docFailed = true;
        if (firstError === undefined) firstError = err instanceof Error ? err.message : String(err);
        break;
      }
    }
    if (docFailed) {
      failed += 1;
      continue;
    }

    const hash = (hashOf.get(row.path) as unknown as { content_hash: string } | undefined)?.content_hash;
    if (!hash) continue; // doc が消えた等（skipped）

    db.exec('BEGIN');
    try {
      del.run(row.path);
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        ins.run(row.path, s.sectionIdx, s.heading, s.level, opts.model, vecs[i].length, float32ToBlob(vecs[i]), hash);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    docsEmbedded += 1;
    sectionsEmbedded += sections.length;
  }

  return {
    docsEmbedded,
    sectionsEmbedded,
    skipped: pending.length - docsEmbedded - failed,
    failed,
    ...(firstError === undefined ? {} : { firstError }),
  };
}
