import type { MemoryDbConnection } from '../db/connection/types';
import { encodeEmbedding } from '../embedding/codec';
import { noopLogger, type MemoryLogger } from '../logger';
import { PipelineRunLedger } from './PipelineRunLedger';
import type { OllamaClient } from '@anytime-markdown/agent-core';

const SCOPE = 'embedding_backfill';
const DEFAULT_EMBED_MODEL = 'bge-m3';
const PROGRESS_LOG_INTERVAL = 50;

export interface EmbeddingBackfillResult {
  status: 'success' | 'partial' | 'error';
  items_processed: number;
  items_skipped: number;
  items_failed: number;
  /** 対象別の生成件数（entities / episodes / spec_documents） */
  processed_by_target: Record<EmbeddingTargetName, number>;
}

export type EmbeddingTargetName = 'entities' | 'episodes' | 'spec_documents';

interface EmbeddingTarget {
  name: EmbeddingTargetName;
  table: string;
  /** embedding を生成する元テキストを組み立てる SELECT（id, text の 2 列） */
  selectSql: string;
}

/**
 * embedding を持つ 3 テーブル。
 *
 * memory_entities だけを見ていた時期があり、memory_episodes 5,222 件と
 * memory_spec_documents 492 件が全件 NULL のまま「success」を報告し続けていた
 * （対象外なので失敗として数えられない）。対象はここに集約し、増えたテーブルを
 * 足し忘れたら型で気づけるようにする。
 */
const EMBEDDING_TARGETS: readonly EmbeddingTarget[] = [
  {
    name: 'entities',
    table: 'memory_entities',
    // 無効化済み（valid_until IS NOT NULL）は検索対象外なので埋めない
    selectSql: `SELECT id,
                       CASE WHEN summary <> '' THEN type || ': ' || display_name || '. ' || summary
                            ELSE type || ': ' || display_name END AS text
                  FROM memory_entities
                 WHERE embedding IS NULL AND valid_until IS NULL`,
  },
  {
    name: 'episodes',
    table: 'memory_episodes',
    selectSql: `SELECT id,
                       CASE WHEN summary <> '' THEN summary || '\n' || raw_excerpt
                            ELSE raw_excerpt END AS text
                  FROM memory_episodes
                 WHERE embedding IS NULL`,
  },
  {
    name: 'spec_documents',
    table: 'memory_spec_documents',
    selectSql: `SELECT id,
                       CASE WHEN summary <> '' THEN title || '\n' || summary ELSE title END AS text
                  FROM memory_spec_documents
                 WHERE embedding IS NULL`,
  },
];

/** 埋め込みへ渡すテキストの上限。長文エピソードで埋め込み生成が詰まるのを防ぐ。 */
const MAX_EMBED_CHARS = 8000;

function recordFailedItem(db: MemoryDbConnection, itemKey: string, reason: string, detail: string): void {
  const failedAt = new Date().toISOString();
  db.run(
    `INSERT INTO memory_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(scope, item_key) DO UPDATE SET
       attempt_count = attempt_count + 1,
       failed_at     = excluded.failed_at,
       detail        = excluded.detail`,
    [SCOPE, itemKey, failedAt, reason, detail]
  );
}

/**
 * Generates and stores embeddings for every row with `embedding IS NULL` across
 * {@link EMBEDDING_TARGETS}（entities / episodes / spec_documents）.
 * Safe to run multiple times — already-embedded rows are skipped.
 */
export async function runEmbeddingBackfill(opts: {
  db: MemoryDbConnection;
  ollama: OllamaClient;
  embedModel?: string;
  logger?: MemoryLogger;
  /** 進捗 callback (total を初回・以降 processed/failed を更新) */
  onTotal?: (total: number) => void;
  progress?: (processed: number, failed: number) => void;
}): Promise<EmbeddingBackfillResult> {
  const { db, ollama, embedModel = DEFAULT_EMBED_MODEL, logger = noopLogger } = opts;
  const onTotal = opts.onTotal;
  const progress = opts.progress;

  const startedAt = new Date().toISOString();
  const ledger = new PipelineRunLedger({ db, scope: SCOPE, wave: 'memory', tier: 3, logger });

  // Count totals for logging（3 テーブル合算）
  const countOf = (sql: string): number => (db.exec(sql)[0]?.values[0]?.[0] as number) ?? 0;
  let totalNull = 0;
  let totalSkip = 0;
  for (const target of EMBEDDING_TARGETS) {
    totalNull += countOf(`SELECT COUNT(*) FROM (${target.selectSql})`);
    totalSkip += countOf(`SELECT COUNT(*) FROM ${target.table} WHERE embedding IS NOT NULL`);
  }

  logger.info(
    `[anytime-memory] embedding backfill: ${totalNull} to process, ${totalSkip} already embedded`
  );
  if (onTotal) onTotal(totalNull);

  // Start pipeline run
  ledger.start(startedAt);

  const counters = { processed: 0, failed: 0 };
  const processedByTarget: Record<EmbeddingTargetName, number> = {
    entities: 0,
    episodes: 0,
    spec_documents: 0,
  };

  for (const target of EMBEDDING_TARGETS) {
    const idRows = db.exec(target.selectSql);
    const rows = (idRows[0]?.values ?? []) as [string, string][];
    logger.info(`[anytime-memory] embedding backfill: ${target.table} — ${rows.length} rows`);

    for (const [rowId, rawText] of rows) {
      // item_key はテーブル名で修飾する。id は sha1 の先頭 16 桁で、
      // テーブルをまたぐと衝突しうるため（memory_failed_items の主キーは scope+item_key）。
      const itemKey = `${target.name}:${rowId}`;
      const text = (rawText ?? '').slice(0, MAX_EMBED_CHARS);
      if (text.trim().length === 0) {
        // 空テキストを埋め込んでもゼロ距離のノイズにしかならない
        recordFailedItem(db, itemKey, 'empty_text', `${target.table} row has no embeddable text`);
        counters.failed++;
        continue;
      }

      try {
        const { embedding } = await ollama.embeddings({ model: embedModel, prompt: text });
        const blob = encodeEmbedding(embedding);
        db.run(`UPDATE ${target.table} SET embedding = ? WHERE id = ?`, [blob, rowId]);
        db.run('DELETE FROM memory_failed_items WHERE scope = ? AND item_key = ?', [SCOPE, itemKey]);
        counters.processed++;
        processedByTarget[target.name]++;
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        recordFailedItem(db, itemKey, 'embedding_failed', detail);
        counters.failed++;
        logger.warn?.(`[anytime-memory] embedding backfill: failed ${itemKey} — ${detail}`);
      }

      const done = counters.processed + counters.failed;
      if (done % PROGRESS_LOG_INTERVAL === 0) {
        logger.info(`[anytime-memory] embedding backfill progress: ${done}/${totalNull} (${counters.failed} failed)`);
        progress?.(counters.processed, counters.failed);
      }
    }
  }

  const finishedAt = new Date().toISOString();
  const durationMs = Date.parse(finishedAt) - Date.parse(startedAt);
  const partialOrError: EmbeddingBackfillResult['status'] = counters.processed > 0 ? 'partial' : 'error';
  const status: EmbeddingBackfillResult['status'] =
    counters.failed === 0 ? 'success' : partialOrError;

  ledger.finish(
    status,
    { items_processed: counters.processed, items_failed: counters.failed },
    counters.failed > 0 ? `${counters.failed} entity embedding(s) failed` : '',
  );

  logger.info(
    `[anytime-memory] embedding backfill complete: status=${status}, processed=${counters.processed} ` +
    `(entities=${processedByTarget.entities}, episodes=${processedByTarget.episodes}, ` +
    `spec_documents=${processedByTarget.spec_documents}), failed=${counters.failed}, duration=${durationMs}ms`
  );

  return {
    status,
    items_processed: counters.processed,
    items_skipped: totalSkip,
    items_failed: counters.failed,
    processed_by_target: processedByTarget,
  };
}
