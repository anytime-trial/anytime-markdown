import type { MemoryDbConnection } from '../db/connection/types';
import type { MemoryLogger } from '../logger';
import { PipelineRunLedger } from './PipelineRunLedger';
import { randomUUID } from 'node:crypto';

import { detectThreeSourceDrifts } from '../drift/compare';
import { detectRegressionClusters, detectSpecViolationClusters } from '../drift/recurringBugs';
import { detectReviewUnfixed, detectReviewVsCode, detectRecurringReviewFindings } from '../drift/reviewClusters';
import { detectRecurringQuestions } from '../drift/recurringQuestions';
import { reportDriftEvents } from '../drift/report';
import { postProcessF22 } from '../drift/postProcessF22';
import type { DriftEventInput } from '../drift/report';
import { decideSeverity } from '../drift/policy';

const SCOPE = 'drift_detection';

export type DriftDetectionResult = {
  status: 'success' | 'partial' | 'error';
  events_inserted: number;
  events_updated: number;
  events_resolved: number;
  duration_ms: number;
};

export async function runDriftDetection(input: {
  db: MemoryDbConnection;
  logger: MemoryLogger;
}): Promise<DriftDetectionResult> {
  const { db, logger } = input;
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
        // 三源比較は memory_edges 由来でワークスペースを持たない（推測で埋めない）。
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

  let reportResult = { events_inserted: 0, events_updated: 0, events_resolved: 0 };
  try {
    reportResult = reportDriftEvents({ db, candidates, recordedAt: startedAt, logger });
  } catch (err) {
    logger.error(`[runDriftDetection] reportDriftEvents failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
    hasPartialError = true;
  }

  try {
    postProcessF22({ db, driftEvents: candidates, recordedAt: startedAt, logger });
  } catch (err) {
    logger.error(`[runDriftDetection] postProcessF22 failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
    hasPartialError = true;
  }

  const durationMs = Date.now() - new Date(startedAt).getTime();
  const status = hasPartialError ? 'partial' : 'success';
  const totalDrifts = reportResult.events_inserted + reportResult.events_updated;

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
    duration_ms: durationMs,
  };
}
