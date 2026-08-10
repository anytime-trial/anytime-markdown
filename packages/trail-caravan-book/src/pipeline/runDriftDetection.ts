import type { CaravanDbConnection } from '../db/connection/types';
import type { CaravanLogger } from '../logger';
import { PipelineRunLedger } from './PipelineRunLedger';
import { randomUUID } from 'node:crypto';

import { detectThreeSourceDrifts } from '../drift/compare';
import { detectRegressionClusters, detectSpecViolationClusters } from '../drift/recurringBugs';
import { detectReviewUnfixed, detectReviewVsCode, detectRecurringReviewFindings } from '../drift/reviewClusters';
import { detectRecurringQuestions } from '../drift/recurringQuestions';
import { reportDriftEvents } from '../drift/report';
import { partitionByTargetExistence } from '../drift/targetExistence';
import { existsSync } from 'node:fs';
import { postProcessF22 } from '../drift/postProcessF22';
import type { DriftEventInput } from '../drift/report';
import { decideSeverity } from '../drift/policy';

const SCOPE = 'drift_detection';

export type DriftDetectionResult = {
  status: 'success' | 'partial' | 'error';
  events_inserted: number;
  events_updated: number;
  events_resolved: number;
  /** 自動解決されていた drift が再検出され、未解決へ戻された件数。 */
  events_reopened: number;
  /** 人手で解決された drift が再検出されたが、解決状態を維持した件数。 */
  events_redetect_suppressed: number;
  duration_ms: number;
};

export async function runDriftDetection(input: {
  db: CaravanDbConnection;
  logger: CaravanLogger;
  /**
   * ワークスペース名 → リポジトリルート絶対パス（不明なら null）。
   * 渡すと、対象ファイルが消滅した drift 候補を検出から外し、既存イベントを
   * MISSING_TARGET_RESOLUTION_NOTE で解決する。省略時は実在チェックをしない（従来動作）。
   */
  resolveWorkspaceRoot?: (workspace: string) => string | null;
  /** テスト用 DI。省略時は fs.existsSync。 */
  fileExists?: (absolutePath: string) => boolean;
}): Promise<DriftDetectionResult> {
  const { db, logger, resolveWorkspaceRoot, fileExists = existsSync } = input;
  const startedAt = new Date().toISOString();
  const ledger = new PipelineRunLedger({ db, scope: SCOPE, wave: 'memory', tier: 3, logger });
  ledger.start(startedAt);

  const candidates: DriftEventInput[] = [];
  let hasPartialError = false;

  // detectThreeSourceDrifts returns DriftCandidate[] — convert to DriftEventInput[]
  try {
    const rawCandidates = detectThreeSourceDrifts({ db, logger });
    for (const c of rawCandidates) {
      candidates.push({
        subject_entity_id: c.subject_entity_id,
        predicate: c.predicate,
        conversation_value: c.conversation_value,
        spec_value: c.spec_value,
        code_value: c.code_value,
        drift_type: c.drift_type,
        severity: decideSeverity(c.drift_type, c.predicate, 1),
        // 三源比較は caravan_edges 由来でワークスペースを持たない（推測で埋めない）。
        workspace: '',
        detail: {
          conversation_value: c.conversation_value,
          spec_value: c.spec_value,
          code_value: c.code_value,
        },
      });
    }
  } catch (err) {
    logger.error(`[runDriftDetection] detectThreeSourceDrifts: ${String(err)}`);
    hasPartialError = true;
  }

  const detectors: Array<() => DriftEventInput[]> = [
    () => {
      try { return detectRegressionClusters({ db, logger }); }
      catch (err) { logger.error(`[runDriftDetection] detectRegressionClusters: ${String(err)}`); hasPartialError = true; return []; }
    },
    () => {
      try { return detectSpecViolationClusters({ db, logger }); }
      catch (err) { logger.error(`[runDriftDetection] detectSpecViolationClusters: ${String(err)}`); hasPartialError = true; return []; }
    },
    () => {
      try { return detectReviewUnfixed({ db, logger }); }
      catch (err) { logger.error(`[runDriftDetection] detectReviewUnfixed: ${String(err)}`); hasPartialError = true; return []; }
    },
    () => {
      try { return detectReviewVsCode({ db, logger }); }
      catch (err) { logger.error(`[runDriftDetection] detectReviewVsCode: ${String(err)}`); hasPartialError = true; return []; }
    },
    () => {
      try { return detectRecurringReviewFindings({ db, logger }); }
      catch (err) { logger.error(`[runDriftDetection] detectRecurringReviewFindings: ${String(err)}`); hasPartialError = true; return []; }
    },
    () => {
      try { return detectRecurringQuestions({ db, logger }); }
      catch (err) { logger.error(`[runDriftDetection] detectRecurringQuestions: ${String(err)}`); hasPartialError = true; return []; }
    },
  ];

  for (const detect of detectors) {
    const results = detect();
    candidates.push(...results);
  }

  // 対象ファイル実在ゲート: 消滅した対象を指す候補を upsert から外し、既存イベントを
  // 「auto: target file missing」で解決へ回す（resolveWorkspaceRoot 未指定なら素通し）。
  let keptCandidates = candidates;
  let missingTargetCandidates: DriftEventInput[] = [];
  if (resolveWorkspaceRoot) {
    const partitioned = partitionByTargetExistence({
      candidates,
      resolveWorkspaceRoot,
      fileExists,
      logger,
    });
    keptCandidates = partitioned.kept;
    missingTargetCandidates = partitioned.missingTarget;
    if (missingTargetCandidates.length > 0) {
      logger.info(
        `[runDriftDetection] missing-target candidates excluded=${missingTargetCandidates.length}`,
      );
    }
  }

  let reportResult = {
    events_inserted: 0,
    events_updated: 0,
    events_resolved: 0,
    events_reopened: 0,
    events_redetect_suppressed: 0,
  };
  try {
    reportResult = reportDriftEvents({
      db,
      candidates: keptCandidates,
      missingTargetCandidates,
      recordedAt: startedAt,
      logger,
    });
  } catch (err) {
    logger.error(`[runDriftDetection] reportDriftEvents failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
    hasPartialError = true;
  }

  try {
    postProcessF22({ db, driftEvents: keptCandidates, recordedAt: startedAt, logger });
  } catch (err) {
    logger.error(`[runDriftDetection] postProcessF22 failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
    hasPartialError = true;
  }

  const durationMs = Date.now() - new Date(startedAt).getTime();
  const status = hasPartialError ? 'partial' : 'success';
  // reopen も「いま出ている drift」なので検出件数に含める（除くと再発が 0 件に見える）。
  const totalDrifts =
    reportResult.events_inserted + reportResult.events_updated + reportResult.events_reopened;

  // 内訳をログへ残す。合算値だけだと「今回の実行で何件が再発だったか」が後から読めない。
  // 台帳（caravan_pipeline_runs）側へ内訳列を足すにはスキーマ migration が要るため、
  // ここでは PipelineRunTotals の既存列を崩さずログで観測できる状態にとどめる。
  // SHORTCUT: 再発の内訳をログにだけ出す. ceiling: 集計や画面から件数を引けない.
  // upgrade: 再発件数を継続して見たくなったら caravan_pipeline_runs へ内訳列を足す.
  logger.info(
    `[runDriftDetection] drifts detected=${totalDrifts} (inserted=${reportResult.events_inserted}, ` +
      `updated=${reportResult.events_updated}, reopened=${reportResult.events_reopened}), ` +
      `resolved=${reportResult.events_resolved}, redetect_suppressed=${reportResult.events_redetect_suppressed}`,
  );

  ledger.finish(
    status,
    { drifts_detected: totalDrifts },
    hasPartialError ? 'postProcessF22 or report step failed (see logs)' : '',
  );

  return {
    status,
    events_inserted: reportResult.events_inserted,
    events_updated: reportResult.events_updated,
    events_resolved: reportResult.events_resolved,
    events_reopened: reportResult.events_reopened,
    events_redetect_suppressed: reportResult.events_redetect_suppressed,
    duration_ms: durationMs,
  };
}
