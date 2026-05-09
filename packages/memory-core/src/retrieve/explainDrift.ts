import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';

export type DriftSourceEvidence = {
  source: 'conversation' | 'spec' | 'code' | 'bug_history' | 'review';
  items: Record<string, unknown>[];
};

export type ExplainDriftResult = {
  event_id: string;
  subject_entity_id: string;
  drift_type: string;
  severity: string;
  detail: Record<string, unknown>;
  sources: DriftSourceEvidence[];
};

export function explainDrift(input: {
  db: Database;
  event_id: string;
  logger: MemoryLogger;
}): ExplainDriftResult | null {
  const { db, event_id, logger } = input;

  let eventRows: ReturnType<Database['exec']>;
  try {
    eventRows = db.exec(
      `SELECT id, subject_entity_id, predicate, drift_type, severity,
              conversation_value, spec_value, code_value, detail_json
       FROM memory_drift_events WHERE id = ?`,
      [event_id],
    );
  } catch (err) {
    logger.error(
      `[explainDrift] event fetch failed event_id=${event_id}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return null;
  }

  if (!eventRows[0]?.values?.length) return null;

  const ev = eventRows[0].values[0];
  const subjectEntityId = ev[1] as string;
  const driftType = ev[3] as string;
  const severity = ev[4] as string;
  const convValue = ev[5] as string | null;
  const specValue = ev[6] as string | null;
  const codeValue = ev[7] as string | null;
  let detail: Record<string, unknown> = {};
  try {
    detail = JSON.parse(ev[8] as string);
  } catch {
    detail = {};
  }

  const sources: DriftSourceEvidence[] = [];

  // Conversation source: memory_episodes linked to the entity
  try {
    const epRows = db.exec(
      `SELECT me.content, me.recorded_at
       FROM memory_episodes me
       JOIN memory_episode_entities mee ON mee.episode_id = me.id
       WHERE mee.entity_id = ?
       ORDER BY me.recorded_at DESC LIMIT 3`,
      [subjectEntityId],
    );
    const items = (epRows[0]?.values ?? []).map((r) => ({
      content: r[0] as string,
      recorded_at: r[1] as string,
      excerpt: convValue ?? undefined,
    }));
    if (items.length > 0 || convValue) {
      sources.push({ source: 'conversation', items: convValue ? [{ value: convValue }, ...items] : items });
    }
  } catch (err) {
    logger.error(`[explainDrift] conversation fetch failed: ${String(err)}`);
  }

  // Spec source: memory_spec_doc_entities → memory_spec_documents
  try {
    const specRows = db.exec(
      `SELECT sd.rel_path, sd.title, sd.summary, sde.line_hint
       FROM memory_spec_documents sd
       JOIN memory_spec_doc_entities sde ON sde.spec_doc_id = sd.id
       WHERE sde.entity_id = ?
       LIMIT 3`,
      [subjectEntityId],
    );
    const items = (specRows[0]?.values ?? []).map((r) => ({
      rel_path: r[0] as string,
      title: r[1] as string,
      summary: r[2] as string,
      line_hint: r[3] as number | null,
      value: specValue ?? undefined,
    }));
    if (items.length > 0 || specValue) {
      sources.push({ source: 'spec', items: specValue && items.length === 0 ? [{ value: specValue }] : items });
    }
  } catch (err) {
    logger.error(`[explainDrift] spec fetch failed: ${String(err)}`);
  }

  // Code source: memory_code_facts linked to the entity
  try {
    const codeRows = db.exec(
      `SELECT cf.file_path, cf.fact_kind, cf.fact_value, cf.last_seen_at
       FROM memory_code_facts cf
       WHERE cf.entity_id = ?
       ORDER BY cf.last_seen_at DESC LIMIT 3`,
      [subjectEntityId],
    );
    const items = (codeRows[0]?.values ?? []).map((r) => ({
      file_path: r[0] as string,
      fact_kind: r[1] as string,
      fact_value: r[2] as string,
      last_seen_at: r[3] as string,
      value: codeValue ?? undefined,
    }));
    if (items.length > 0 || codeValue) {
      sources.push({ source: 'code', items: codeValue && items.length === 0 ? [{ value: codeValue }] : items });
    }
  } catch (err) {
    logger.error(`[explainDrift] code fetch failed: ${String(err)}`);
  }

  // Bug history source: memory_bug_fixes linked via memory_edges (caused_by)
  try {
    const bugRows = db.exec(
      `SELECT bf.id, bf.commit_sha, bf.subject_summary, bf.committed_at
       FROM memory_bug_fixes bf
       WHERE bf.bug_entity_id = ?
       ORDER BY bf.committed_at DESC LIMIT 3`,
      [subjectEntityId],
    );
    const items = (bugRows[0]?.values ?? []).map((r) => ({
      bug_fix_id: r[0] as string,
      commit_sha: r[1] as string,
      subject: r[2] as string,
      committed_at: r[3] as string,
    }));
    if (items.length > 0) {
      sources.push({ source: 'bug_history', items });
    }
  } catch (err) {
    logger.error(`[explainDrift] bug_history fetch failed: ${String(err)}`);
  }

  // Review source: memory_review_findings linked via entity
  try {
    const reviewRows = db.exec(
      `SELECT rf.id, rf.category, rf.severity, rf.finding_text, rf.recorded_at
       FROM memory_review_findings rf
       WHERE rf.finding_entity_id = ?
       ORDER BY rf.recorded_at DESC LIMIT 3`,
      [subjectEntityId],
    );
    const items = (reviewRows[0]?.values ?? []).map((r) => ({
      finding_id: r[0] as string,
      category: r[1] as string,
      severity: r[2] as string,
      finding_text: r[3] as string,
      recorded_at: r[4] as string,
    }));
    if (items.length > 0) {
      sources.push({ source: 'review', items });
    }
  } catch (err) {
    logger.error(`[explainDrift] review fetch failed: ${String(err)}`);
  }

  // Always include non-empty values even if no DB rows
  const presentSources = new Set(sources.map((s) => s.source));
  if (!presentSources.has('conversation') && convValue) {
    sources.push({ source: 'conversation', items: [{ value: convValue }] });
  }
  if (!presentSources.has('spec') && specValue) {
    sources.push({ source: 'spec', items: [{ value: specValue }] });
  }
  if (!presentSources.has('code') && codeValue) {
    sources.push({ source: 'code', items: [{ value: codeValue }] });
  }

  void driftType; // used in result only

  return {
    event_id,
    subject_entity_id: subjectEntityId,
    drift_type: driftType,
    severity,
    detail,
    sources,
  };
}
