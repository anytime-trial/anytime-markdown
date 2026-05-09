import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';
import { randomUUID } from 'crypto';

import { detectThreeSourceDrifts } from '../drift/compare';
import { detectRegressionClusters, detectSpecViolationClusters, detectRecurringRootCauses } from '../drift/recurringBugs';
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
  db: Database;
  logger: MemoryLogger;
}): Promise<DriftDetectionResult> {
  const { db, logger } = input;
  const startedAt = new Date().toISOString();
  const runId = randomUUID();

  try {
    db.run(
      `INSERT INTO memory_pipeline_runs
         (id, scope, started_at, status,
          items_processed, entities_inserted, entities_updated,
          edges_inserted, edges_invalidated, drifts_detected,
          items_failed, duration_ms)
       VALUES (?, ?, ?, 'running', 0, 0, 0, 0, 0, 0, 0, 0)`,
      [runId, SCOPE, startedAt],
    );
  } catch (err) {
    logger.error(
      `[runDriftDetection] pipeline_run insert failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
  }

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
        severity: decideSeverity(c.drift_type, c.predicate, 1.0),
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
      try { return detectRecurringRootCauses({ db, logger }); }
      catch (err) { logger.error(`[runDriftDetection] detectRecurringRootCauses: ${String(err)}`); hasPartialError = true; return []; }
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

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - new Date(startedAt).getTime();
  const status = hasPartialError ? 'partial' : 'success';
  const totalDrifts = reportResult.events_inserted + reportResult.events_updated;

  try {
    db.run(
      `UPDATE memory_pipeline_runs SET
         finished_at    = ?,
         status         = ?,
         drifts_detected = ?,
         duration_ms    = ?
       WHERE id = ?`,
      [finishedAt, status, totalDrifts, durationMs, runId],
    );
  } catch (err) {
    logger.error(`[runDriftDetection] finalize pipeline_run failed: ${String(err)}`);
  }

  return {
    status,
    events_inserted: reportResult.events_inserted,
    events_updated: reportResult.events_updated,
    events_resolved: reportResult.events_resolved,
    duration_ms: durationMs,
  };
}
