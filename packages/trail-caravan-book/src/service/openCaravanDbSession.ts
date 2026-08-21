/**
 * ファイルベースの trail-caravan-book DB セッションを 1 回だけ open する。
 *
 * `runCaravanBookPipeline` の冒頭セットアップ (世代バックアップ・openCaravanBookDb・
 * activity.db ATTACH・watchdog・OllamaClient 生成・PipelineStatusWriter 初期化) を
 * 切り出し、{@link CaravanDbSession} を返す。sql.js / better-sqlite3 / Ollama などの
 * 重い依存をロードするため、index からは遅延 require される。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { createOllamaClient, resolveOllamaBaseUrl } from '@anytime-markdown/agent-core';
import type { OllamaClient } from '@anytime-markdown/agent-core';

import { openCaravanBookDb } from '../db/connection';
import { attachTrailDbReadOnly } from '../db/attach';
import { backupCaravanBookDbFile } from '../db/backup';
import { getCaravanBookDbPath } from '../db/paths';
import { runAgentRunWatchdog } from '../ingest/review/agentRunWatchdog';
import { countForeignKeyViolations } from '../maintenance/repairDanglingReferences';
import { runPipelineWatchdog } from '../pipeline/pipelineWatchdog';
import { PipelineStatusWriter } from '../status/PipelineStatusWriter';
import { CaravanDbSession } from './CaravanDbSession';
import { PIPELINE_SCOPES } from './pipelineScopes';
import type { PipelineRunnerContext } from './types';

export { PIPELINE_SCOPES };

export interface OpenCaravanDbSessionOptions {
  /** Ollama クライアント生成口 (テストで mock 注入)。省略時 `createOllamaClient()`。 */
  ollamaFactory?: () => OllamaClient;
  /** status writer を生成するか (既定 true)。false で status を書かない。 */
  writeStatus?: boolean;
}

/**
 * trail-caravan-book DB を open し、activity.db を read-only ATTACH した {@link CaravanDbSession}
 * を返す。activity.db が存在しない場合は `null` を返す (呼び出し側で skip する)。
 *
 * Wave 3 のライフサイクルで 1 回だけ呼び、返ったセッションを全 memory analyzer で共有する。
 * 終了時は `session.close()` を呼ぶこと。
 */
export async function openCaravanDbSession(
  ctx: PipelineRunnerContext,
  opts: OpenCaravanDbSessionOptions = {},
): Promise<CaravanDbSession | null> {
  const { logger } = ctx;

  if (!fs.existsSync(ctx.trailDbPath)) {
    logger.error(`Trail DB not found: ${ctx.trailDbPath}`);
    return null;
  }

  // 世代バックアップを open 前にローテート (best-effort)。
  const caravanDbPath = ctx.dbPath ?? getCaravanBookDbPath(ctx.gitRoot);
  try {
    const created = backupCaravanBookDbFile(caravanDbPath, {
      backupGenerations: ctx.backupGenerations,
      backupIntervalDays: ctx.backupIntervalDays,
    });
    if (created) logger.info(`trail-caravan-book backup rotated: ${caravanDbPath}.bak.1.gz`);
  } catch (err) {
    logger.error('trail-caravan-book backup failed (continuing pipeline)', err);
  }

  logger.info('Opening trail-caravan-book DB');
  // バックアップ対象（caravanDbPath）と同じパスを開く。以前は ctx.dbPath を素通ししており、
  // 未指定時にバックアップは gitRoot 基準・open は cwd 基準となって別ファイルを指し得た。
  const memDb = await openCaravanBookDb(caravanDbPath, { nativeBinding: ctx.nativeBinding });

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

    // 参照先を失った行の常設検知。実測 55ms（380MB / 45k エンティティ）なので毎 run 回せる。
    // 2026-06-20〜08-05 に 163 件が 1.5 か月かけて溜まり、その間 1 件も検知されなかった
    // （症状が「エラー」ではなく「レビュー 162 件が静かにグラフから消える」形のため）。
    // 直すのは `caravan repair-references`。ここは気づくための計測に徹する。
    try {
      const fkViolations = countForeignKeyViolations(memDb.db);
      if (fkViolations > 0) {
        logger.error(
          `[anytime-memory] foreign_key_check: 参照先を失った行が ${fkViolations} 件あります。` +
            `\`anytime-trail-server caravan repair-references\` で内訳を確認してください`,
        );
      }
    } catch (err) {
      // 計測の失敗でパイプラインを止めない。ただし黙って飛ばさない。
      logger.error('[anytime-memory] foreign_key_check の実行に失敗（取込は継続）', err);
    }
  } catch (err) {
    // セットアップ中の失敗は DB を確実に閉じてから re-throw。
    memDb.close();
    throw err;
  }

  // ingest の ollama 接続先を health-check と同一に解決する (split-brain 防止)。
  // env OLLAMA_BASE_URL > lep.json baseUrl > Dev Container 自動検出 / localhost。
  // 優先順: ctx.ollamaFactory (daemon が throttle 用に注入) > opts.ollamaFactory (テスト) >
  // 既定 (createOllamaClient + resolveOllamaBaseUrl)。
  const ollamaFactory = ctx.ollamaFactory ?? opts.ollamaFactory;
  const ollama = ollamaFactory
    ? ollamaFactory()
    : createOllamaClient({ baseUrl: resolveOllamaBaseUrl(ctx.llm?.baseUrl) });

  let statusWriter: PipelineStatusWriter | undefined;
  if (opts.writeStatus !== false) {
    const statusPath = path.join(path.dirname(ctx.trailDbPath), 'pipeline-status.json');
    statusWriter = new PipelineStatusWriter(statusPath, randomUUID(), [...PIPELINE_SCOPES]);
    statusWriter.initialize();
  }

  return new CaravanDbSession({
    memDb,
    ollama,
    logger,
    statusWriter,
    gitRoot: ctx.gitRoot ?? process.cwd(),
    docsRoot: ctx.docsRoot,
    backfillDays: ctx.backfillDays,
    workspaceScopeMode: ctx.workspaceScopeMode,
    chatModel: ctx.llm?.chatModel,
    embedModel: ctx.llm?.embedModel,
  });
}
