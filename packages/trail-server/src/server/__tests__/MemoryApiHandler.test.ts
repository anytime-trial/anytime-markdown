jest.mock('@anytime-markdown/memory-core', () => {
  // Real BetterSqlite3MemoryDb は使う (better-sqlite3 への依存を mock しない)
  const actual = jest.requireActual('@anytime-markdown/memory-core');
  return {
    ...actual,
    resolveDrift: jest.fn(() => ({ resolved: true })),
  };
});

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { BetterSqlite3MemoryDb, runMigrations, type MemoryDbSqlValue } from '@anytime-markdown/memory-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MemoryApiHandler } from '../MemoryApiHandler';

const TS = '2026-05-09T10:00:00.000Z';
const TS2 = '2026-05-09T11:00:00.000Z';

function buildTestDb(dbPath: string): void {
  const db = new BetterSqlite3MemoryDb({ filePath: dbPath });
  runMigrations(db);
  const run = (sql: string, params: readonly MemoryDbSqlValue[] = []): void => {
    db.run(sql, params);
  };

  // Seed: entity
  run(
    `INSERT INTO memory_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['ent-1', 'Package', 'trail-viewer', 'trail-viewer', TS, TS, TS],
  );

  // Seed: drift events
  run(
    `INSERT INTO memory_drift_events (id, subject_entity_id, predicate, drift_type, severity, detected_at, resolved_at, resolution_note, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, NULL, '', '{"key":"val"}')`,
    ['drift-1', 'ent-1', 'prefers', 'spec_vs_code', 'warn', TS],
  );
  run(
    `INSERT INTO memory_drift_events (id, subject_entity_id, predicate, drift_type, severity, detected_at, resolved_at, resolution_note, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'fixed', '{}')`,
    ['drift-2', 'ent-1', 'depends_on', 'conv_vs_code', 'error', TS2, TS2],
  );

  // Seed: recurring bug drift events
  run(
    `INSERT INTO memory_drift_events (id, subject_entity_id, predicate, drift_type, severity, detected_at, resolved_at, resolution_note, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, NULL, '', '{}')`,
    ['drift-3', 'ent-1', 'prefers', 'regression_cluster', 'error', TS],
  );

  // Seed: workspace 付きの drift / bug（ワークスペース絞り込みの検査用）
  run(
    `INSERT INTO memory_drift_events (id, subject_entity_id, predicate, drift_type, severity, detected_at, resolved_at, resolution_note, detail_json, workspace)
     VALUES (?, ?, ?, ?, ?, ?, NULL, '', '{}', ?)`,
    ['drift-ws', 'ent-1', 'uses', 'review_unfixed', 'warn', TS, 'anytime-trade'],
  );

  // Seed: bug fixes
  run(
    `INSERT INTO memory_bug_fixes (id, commit_sha, bug_entity_id, package, category, subject_summary, committed_at, recorded_at, workspace)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['bf-1', 'abc123', 'ent-1', 'trail-viewer', 'logic', 'Fix null ref', TS, TS, 'anytime-markdown'],
  );
  run(
    `INSERT INTO memory_bug_fixes (id, commit_sha, bug_entity_id, package, category, subject_summary, committed_at, recorded_at, related_session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['bf-2', 'def456', 'ent-1', 'trail-server', 'spec', 'Fix aggregation boundary', TS, TS, 'sess-1'],
  );

  // Seed: reviews and findings
  run(
    `INSERT INTO memory_reviews (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at, workspace)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['rev-1', 'review_doc', 'doc/r1.md', 'ent-1', 'code', 'Code Review 1', TS, TS, 'anytime-lab'],
  );
  run(
    `INSERT INTO memory_review_findings (id, review_id, finding_entity_id, finding_index, target_file_path, category, severity, finding_text, addressed_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    ['rf-1', 'rev-1', 'ent-1', 0, 'src/foo.ts', 'logic', 'warn', 'Missing null check', TS],
  );
  run(
    `INSERT INTO memory_review_findings (id, review_id, finding_entity_id, finding_index, target_file_path, category, severity, finding_text, addressed_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['rf-2', 'rev-1', 'ent-1', 1, 'src/bar.ts', 'perf', 'info', 'Slow loop', TS, TS],
  );

  // Seed: pipeline runs (multi-day, multi-scope for stats aggregation)
  run(
    `INSERT INTO pipeline_runs (id, scope, wave, tier, started_at, finished_at, status, items_processed, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['run-1', 'drift', 'memory', 3, TS, TS2, 'success', 5, 3_600_000],
  );
  // Same day, same scope, different status (partial) — worst_status should remain 'partial' (>success)
  run(
    `INSERT INTO pipeline_runs (id, scope, wave, tier, started_at, finished_at, status, items_processed, duration_ms, items_failed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['run-2', 'drift', 'memory', 3, '2026-05-09T12:00:00.000Z', '2026-05-09T12:30:00.000Z', 'partial', 3, 1_800_000, 1],
  );
  // Same day, different scope (review) — separate aggregation row
  run(
    `INSERT INTO pipeline_runs (id, scope, wave, tier, started_at, finished_at, status, items_processed, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['run-3', 'review', 'primary', 1, '2026-05-09T13:00:00.000Z', '2026-05-09T13:15:00.000Z', 'success', 10, 900_000],
  );
  // Different day, drift scope with error — worst status for that day
  run(
    `INSERT INTO pipeline_runs (id, scope, wave, tier, started_at, finished_at, status, items_processed, duration_ms, items_failed, error_detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['run-4', 'drift', 'memory', 3, '2026-05-10T09:00:00.000Z', '2026-05-10T09:45:00.000Z', 'error', 0, 2_700_000, 2, 'boom'],
  );

  // Seed: pipeline run logs
  run(
    `INSERT INTO pipeline_run_logs (run_id, timestamp, level, source, component, message, metadata, stack)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['run-4', '2026-05-10T09:01:00.000Z', 'info', 'daemon', 'lep', 'started', '{"step":1}', null],
  );
  run(
    `INSERT INTO pipeline_run_logs (run_id, timestamp, level, source, component, message, metadata, stack)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['run-4', '2026-05-10T09:02:00.000Z', 'error', 'extension', 'lep', 'failed', null, 'Error: boom'],
  );

  // Seed: failed items
  run(
    `INSERT INTO memory_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['drift', 'msg-abc', TS, 'timeout', 'request timed out', 2],
  );

  // Seed: edge + invalidation
  run(
    `INSERT INTO memory_edges (id, subject_entity_id, predicate, object_literal, valid_from, recorded_at, source_type, source_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['edge-1', 'ent-1', 'prefers', 'TypeScript', TS, TS, 'conversation', 'session-1'],
  );
  run(
    `INSERT INTO memory_edge_invalidations (id, edge_id, invalidated_at, reason, superseding_edge_id)
     VALUES (?, ?, ?, ?, NULL)`,
    ['inv-1', 'edge-1', TS2, 'rule_exclusive'],
  );

  db.close();
}

describe('MemoryApiHandler', () => {
  let tmpDir: string;
  let dbPath: string;
  let handler: MemoryApiHandler;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-api-test-'));
    dbPath = path.join(tmpDir, 'memory-core.db');
    await buildTestDb(dbPath);
    handler = new MemoryApiHandler(makeMockLogger(), dbPath);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('handleStatus', () => {
    it('returns exists:true when db file is present', async () => {
      const result = await handler.handleStatus();
      expect(result).toEqual({ exists: true });
    });

    it('returns exists:false when db file is absent', async () => {
      const h = new MemoryApiHandler(makeMockLogger(), path.join(tmpDir, 'no-such.db'));
      expect(await h.handleStatus()).toEqual({ exists: false });
    });
  });

  describe('listDriftEvents', () => {
    it('returns only unresolved events by default', async () => {
      const rows = await handler.listDriftEvents({});
      expect(rows.length).toBeGreaterThanOrEqual(2); // drift-1, drift-3
      expect(rows.every((r) => r.resolvedAt === null)).toBe(true);
    });

    it('returns all events when unresolvedOnly=false', async () => {
      const rows = await handler.listDriftEvents({ unresolvedOnly: false });
      expect(rows.length).toBe(4);
    });

    it('workspace で絞ると他ワークスペースの乖離が落ちる', async () => {
      const rows = await handler.listDriftEvents({ unresolvedOnly: false, workspace: 'anytime-trade' });
      expect(rows.map((r) => r.id)).toEqual(['drift-ws']);
    });

    it('workspace 未指定なら絞り込まない（未解決の行も混在したまま返る）', async () => {
      const rows = await handler.listDriftEvents({ unresolvedOnly: false });
      expect(rows.map((r) => r.workspace)).toContain('anytime-trade');
      expect(rows.map((r) => r.workspace)).toContain('');
    });

    it('filters by severity', async () => {
      const rows = await handler.listDriftEvents({ unresolvedOnly: false, severity: 'error' });
      expect(rows.every((r) => r.severity === 'error')).toBe(true);
    });

    it('returns empty array when db is absent', async () => {
      const h = new MemoryApiHandler(makeMockLogger(), path.join(tmpDir, 'no-such.db'));
      expect(await h.listDriftEvents({})).toEqual([]);
    });
  });

  describe('getDriftEventDetail', () => {
    it('returns drift event detail with parsed detailJson', async () => {
      const detail = await handler.getDriftEventDetail('drift-1');
      expect(detail).not.toBeNull();
      expect(detail?.id).toBe('drift-1');
      expect(detail?.driftType).toBe('spec_vs_code');
      expect(detail?.detailJson).toEqual({ key: 'val' });
    });

    it('returns null for unknown id', async () => {
      expect(await handler.getDriftEventDetail('nonexistent')).toBeNull();
    });
  });

  describe('listRecurringBugs', () => {
    it('returns only cluster-type drift events (unresolved)', async () => {
      const rows = await handler.listRecurringBugs({});
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const types = new Set(rows.map((r) => r.driftType));
      const allowed = new Set(['regression_cluster', 'spec_violation_cluster']);
      for (const t of types) expect(allowed.has(t)).toBe(true);
    });
  });

  describe('getBugHistory', () => {
    it('returns bug fix records', async () => {
      const rows = await handler.getBugHistory({ package: 'trail-viewer' });
      expect(rows.length).toBe(1);
      expect(rows[0]?.commitSha).toBe('abc123');
      expect(rows[0]?.package).toBe('trail-viewer');
    });

    it('filters by package', async () => {
      const rows = await handler.getBugHistory({ package: 'no-such' });
      expect(rows).toEqual([]);
    });

    it('filters by sessionIds (Flight Record の指示単位の絞り込み)', async () => {
      const rows = await handler.getBugHistory({ sessionIds: ['sess-1'] });
      expect(rows.map((r) => r.commitSha)).toEqual(['def456']);
    });

    // 空配列は「絞り込み対象が 0 件」。条件を落として全件返すと、セッション不明の指示が
    // 全バグを自分の成果として表示してしまう。
    it('sessionIds が空配列なら 0 件を返す（絞り込み無しに退行しない）', async () => {
      const rows = await handler.getBugHistory({ sessionIds: [] });
      expect(rows).toEqual([]);
    });

    it('sessionIds 未指定なら絞り込まない', async () => {
      const rows = await handler.getBugHistory({});
      expect(rows.length).toBe(2);
    });

    it('workspace で絞ると他ワークスペースのバグが落ちる', async () => {
      const rows = await handler.getBugHistory({ workspace: 'anytime-markdown' });
      expect(rows.map((r) => r.commitSha)).toEqual(['abc123']);
    });

    it('未解決（workspace 空文字）の行は workspace 指定で落ちる', async () => {
      const rows = await handler.getBugHistory({ workspace: 'anytime-trade' });
      expect(rows).toEqual([]);
    });
  });

  describe('listWorkspaces', () => {
    it('レビュー・バグ・乖離の 3 テーブルから統合して重複なく返す', async () => {
      expect(await handler.listWorkspaces()).toEqual(['anytime-lab', 'anytime-markdown', 'anytime-trade']);
    });

    it('未解決（空文字）は選択肢に出さない', async () => {
      expect(await handler.listWorkspaces()).not.toContain('');
    });

    it('DB が無ければ空配列を返す', async () => {
      const h = new MemoryApiHandler(makeMockLogger(), path.join(tmpDir, 'no-such.db'));
      expect(await h.listWorkspaces()).toEqual([]);
    });
  });

  describe('listUnaddressedReviewFindings', () => {
    it('returns only unaddressed findings', async () => {
      const rows = await handler.listUnaddressedReviewFindings({});
      expect(rows.length).toBe(1);
      expect(rows[0]?.id).toBe('rf-1');
    });
  });

  describe('getReviewHistory', () => {
    it('returns all findings with review info', async () => {
      const rows = await handler.getReviewHistory({});
      expect(rows.length).toBe(2);
      expect(rows[0]?.reviewId).toBe('rev-1');
    });

    it('filters by targetFilePath', async () => {
      const rows = await handler.getReviewHistory({ targetFilePath: 'src/bar.ts' });
      expect(rows.length).toBe(1);
      expect(rows[0]?.id).toBe('rf-2');
    });
  });

  describe('listPipelineRunStatsByDay', () => {
    it('groups runs by (day, scope) and sums duration', async () => {
      const rows = await handler.listPipelineRunStatsByDay({});
      const byKey = new Map(rows.map((r) => [`${r.day}|${r.scope}|${r.wave}`, r]));

      // 2026-05-09 / drift: run-1 (3,600,000ms success) + run-2 (1,800,000ms partial)
      const drift0509 = byKey.get('2026-05-09|drift|memory');
      expect(drift0509).toBeDefined();
      expect(drift0509?.runs).toBe(2);
      expect(drift0509?.durationSec).toBe(5400);
      expect(drift0509?.itemsProcessed).toBe(8);
      expect(drift0509?.worstStatus).toBe('partial');

      // 2026-05-09 / review: run-3 only
      const review0509 = byKey.get('2026-05-09|review|primary');
      expect(review0509?.runs).toBe(1);
      expect(review0509?.worstStatus).toBe('success');

      // 2026-05-10 / drift: run-4 error
      const drift0510 = byKey.get('2026-05-10|drift|memory');
      expect(drift0510?.runs).toBe(1);
      expect(drift0510?.worstStatus).toBe('error');
    });

    it('filters by since (started_at >= since)', async () => {
      const rows = await handler.listPipelineRunStatsByDay({ since: '2026-05-10T00:00:00.000Z' });
      expect(rows.map((r) => r.day)).toEqual(['2026-05-10']);
    });

    it('returns rows ordered by day desc, scope asc', async () => {
      const rows = await handler.listPipelineRunStatsByDay({});
      expect(rows.map((r) => `${r.day}|${r.scope}|${r.wave}`)).toEqual([
        '2026-05-10|drift|memory',
        '2026-05-09|drift|memory',
        '2026-05-09|review|primary',
      ]);
    });
  });

  describe('listPipelineRuns', () => {
    it('returns individual runs ordered by started_at desc', async () => {
      const rows = await handler.listPipelineRuns({});
      expect(rows.map((r) => r.id)).toEqual(['run-4', 'run-3', 'run-2', 'run-1']);
      expect(rows[0]).toMatchObject({
        id: 'run-4',
        scope: 'drift',
        wave: 'memory',
        tier: 3,
        status: 'error',
        startedAt: '2026-05-10T09:00:00.000Z',
        finishedAt: '2026-05-10T09:45:00.000Z',
        durationMs: 2_700_000,
        itemsProcessed: 0,
        itemsFailed: 2,
        errorDetail: 'boom',
      });
    });

    it('filters by since, wave, and status', async () => {
      const rows = await handler.listPipelineRuns({
        since: '2026-05-09T12:30:00.000Z',
        wave: 'memory',
        status: 'error',
      });
      expect(rows.map((r) => r.id)).toEqual(['run-4']);
    });

    it('applies limit', async () => {
      const rows = await handler.listPipelineRuns({ limit: 2 });
      expect(rows.map((r) => r.id)).toEqual(['run-4', 'run-3']);
    });
  });

  describe('listPipelineRunLogs', () => {
    it('returns logs for a run ordered by timestamp then id', async () => {
      const rows = await handler.listPipelineRunLogs({ runId: 'run-4' });
      expect(rows).toEqual([
        {
          id: 1,
          timestamp: '2026-05-10T09:01:00.000Z',
          level: 'info',
          source: 'daemon',
          component: 'lep',
          message: 'started',
          metadata: '{"step":1}',
          stack: null,
        },
        {
          id: 2,
          timestamp: '2026-05-10T09:02:00.000Z',
          level: 'error',
          source: 'extension',
          component: 'lep',
          message: 'failed',
          metadata: null,
          stack: 'Error: boom',
        },
      ]);
    });

    it('returns empty array for unknown run id', async () => {
      expect(await handler.listPipelineRunLogs({ runId: 'no-such' })).toEqual([]);
    });
  });

  describe('listFailedItems', () => {
    it('returns failed items', async () => {
      const rows = await handler.listFailedItems({});
      expect(rows.length).toBe(1);
      expect(rows[0]?.itemKey).toBe('msg-abc');
      expect(rows[0]?.detail).toBe('request timed out');
      expect(rows[0]?.attemptCount).toBe(2);
    });
  });

  describe('listInvalidations', () => {
    it('returns edge invalidation records', async () => {
      const rows = await handler.listInvalidations({});
      expect(rows.length).toBe(1);
      expect(rows[0]?.id).toBe('inv-1');
      expect(rows[0]?.reason).toBe('rule_exclusive');
      expect(rows[0]?.supersedingEdgeId).toBeNull();
    });
  });
});
