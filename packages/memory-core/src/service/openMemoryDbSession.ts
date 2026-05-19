/**
 * ファイルベースの memory-core DB セッションを 1 回だけ open する。
 *
 * `runMemoryCorePipeline` の冒頭セットアップ (世代バックアップ・openMemoryCoreDb・
 * trail.db ATTACH・watchdog・OllamaClient 生成・PipelineStatusWriter 初期化) を
 * 切り出し、{@link MemoryDbSession} を返す。sql.js / better-sqlite3 / Ollama などの
 * 重い依存をロードするため、index からは遅延 require される。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { createOllamaClient } from '@anytime-markdown/agent-core';
import type { OllamaClient } from '@anytime-markdown/agent-core';

import { openMemoryCoreDb } from '../db/connection';
import { attachTrailDbReadOnly } from '../db/attach';
import { backupMemoryCoreDbFile } from '../db/backup';
import { getMemoryCoreDbPath } from '../db/paths';
import { runAgentRunWatchdog } from '../ingest/review/agentRunWatchdog';
import { runPipelineWatchdog } from '../pipeline/pipelineWatchdog';
import { PipelineStatusWriter } from '../status/PipelineStatusWriter';
import { MemoryDbSession } from './MemoryDbSession';
import type { PipelineRunnerContext } from './types';

/** `pipeline-status.json` に書き出す 9 scope。analyzer→scope は 1:N (conversation→2 等)。 */
export const PIPELINE_SCOPES = [
  'conversation_incremental',
  'conversation_failed_items_retry',
  'code_incremental',
  'code_reconciliation',
  'bug_history_incremental',
  'review_incremental',
  'spec_incremental',
  'drift_detection',
  'embedding_backfill',
] as const;

export interface OpenMemoryDbSessionOptions {
  /** Ollama クライアント生成口 (テストで mock 注入)。省略時 `createOllamaClient()`。 */
  ollamaFactory?: () => OllamaClient;
  /** status writer を生成するか (既定 true)。false で status を書かない。 */
  writeStatus?: boolean;
}

/**
 * memory-core DB を open し、trail.db を read-only ATTACH した {@link MemoryDbSession}
 * を返す。trail.db が存在しない場合は `null` を返す (呼び出し側で skip する)。
 *
 * Wave 3 のライフサイクルで 1 回だけ呼び、返ったセッションを全 memory analyzer で共有する。
 * 終了時は `session.close()` を呼ぶこと。
 */
export async function openMemoryDbSession(
  ctx: PipelineRunnerContext,
  opts: OpenMemoryDbSessionOptions = {},
): Promise<MemoryDbSession | null> {
  const { logger } = ctx;

  if (!fs.existsSync(ctx.trailDbPath)) {
    logger.error(`Trail DB not found: ${ctx.trailDbPath}`);
    return null;
  }

  // 世代バックアップを open 前にローテート (best-effort)。
  const memoryDbPath = ctx.dbPath ?? getMemoryCoreDbPath(ctx.gitRoot);
  try {
    const created = backupMemoryCoreDbFile(memoryDbPath, {
      backupGenerations: ctx.backupGenerations,
      backupIntervalDays: ctx.backupIntervalDays,
    });
    if (created) logger.info(`memory-core backup rotated: ${memoryDbPath}.bak.1.gz`);
  } catch (err) {
    logger.error('memory-core backup failed (continuing pipeline)', err);
  }

  logger.info('Opening memory-core DB');
  const memDb = await openMemoryCoreDb(ctx.dbPath, { nativeBinding: ctx.nativeBinding });

  try {
    logger.info(`Attaching trail DB: ${ctx.trailDbPath}`);
    await attachTrailDbReadOnly(memDb.db, ctx.trailDbPath);

    // crash / reload で 'running' のまま残った agent run / pipeline state を回収。
    const watchdogResult = runAgentRunWatchdog({ db: memDb.db, logger });
    if (watchdogResult.stale_count > 0) {
      logger.info(`Agent watchdog: ${watchdogResult.stale_count} stale run(s) timed out`);
    }
    const pipelineWd = runPipelineWatchdog({ db: memDb.db, logger });
    if (pipelineWd.stale_runs > 0 || pipelineWd.stale_states > 0) {
      logger.info(
        `Pipeline watchdog: ${pipelineWd.stale_runs} stale run(s), ${pipelineWd.stale_states} orphan state(s) cleaned`,
      );
    }
  } catch (err) {
    // セットアップ中の失敗は DB を確実に閉じてから re-throw。
    memDb.close();
    throw err;
  }

  const ollama = (opts.ollamaFactory ?? createOllamaClient)();

  let statusWriter: PipelineStatusWriter | undefined;
  if (opts.writeStatus !== false) {
    const statusPath = path.join(path.dirname(ctx.trailDbPath), 'pipeline-status.json');
    statusWriter = new PipelineStatusWriter(statusPath, randomUUID(), [...PIPELINE_SCOPES]);
    statusWriter.initialize();
  }

  return new MemoryDbSession({
    memDb,
    ollama,
    logger,
    statusWriter,
    gitRoot: ctx.gitRoot ?? process.cwd(),
    backfillDays: ctx.backfillDays,
  });
}
