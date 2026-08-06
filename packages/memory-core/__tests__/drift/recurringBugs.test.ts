import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../src/db/migrations/runner';
import {
  detectRegressionClusters,
  detectSpecViolationClusters,
  detectRecurringRootCauses,
} from '../../src/drift/recurringBugs';
import type { MemoryLogger } from '../../src/logger';

const silentLogger: MemoryLogger = { info: () => {}, error: () => {} };

function makeDb(): BetterSqlite3MemoryDb {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

const TS = '2026-01-01T00:00:00.000Z';
let seq = 0;

function insertEntity(db: BetterSqlite3MemoryDb, id?: string): string {
  const eid = id ?? `ent-${++seq}`;
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Bug', ?, ?, ?, ?, ?)`,
    [eid, eid, eid, TS, TS, TS],
  );
  return eid;
}

function insertBugFix(
  db: BetterSqlite3MemoryDb,
  opts: {
    id?: string;
    commitSha: string;
    bugEntityId: string;
    package?: string;
    category: string;
    affectedPaths?: string[];
    committedAt?: string;
    workspace?: string;
  },
): void {
  const id = opts.id ?? `bf-${opts.commitSha}`;
  const paths = JSON.stringify(opts.affectedPaths ?? []);
  const committedAt = opts.committedAt ?? TS;
  db.run(
    `INSERT INTO memory_bug_fixes
       (id, commit_sha, bug_entity_id, package, category, subject_summary, affected_file_paths_json, committed_at, recorded_at, workspace)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, opts.commitSha, opts.bugEntityId, opts.package ?? 'web-app', opts.category, 'summary', paths, committedAt, TS, opts.workspace ?? ''],
  );
}

/** 直近（ウィンドウ内）の committed_at。 */
function recentIso(daysAgo = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

describe('detectRegressionClusters', () => {
  it('I12: 同 file_path に regression 2 件 → drift_event 1 行 (severity=error)', () => {
    const db = makeDb();
    const e1 = insertEntity(db);
    const e2 = insertEntity(db);
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    insertBugFix(db, { commitSha: 'sha1', bugEntityId: e1, category: 'regression', affectedPaths: ['src/foo.ts'], committedAt: recent });
    insertBugFix(db, { commitSha: 'sha2', bugEntityId: e2, category: 'regression', affectedPaths: ['src/foo.ts'], committedAt: recent });

    const results = detectRegressionClusters({ db, windowDays: 90, minCount: 2, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].drift_type).toBe('regression_cluster');
    expect(results[0].severity).toBe('error');
    expect(results[0].subject_entity_id).toBe('file:src/foo.ts');
  });

  it('regression 1 件のみ → 検知なし', () => {
    const db = makeDb();
    const e1 = insertEntity(db);
    insertBugFix(db, { commitSha: 'sha3', bugEntityId: e1, category: 'regression', affectedPaths: ['src/bar.ts'], committedAt: TS });

    const results = detectRegressionClusters({ db, windowDays: 90, minCount: 2, logger: silentLogger });
    expect(results).toHaveLength(0);
  });

  it('期間外のコミット → 検知なし', () => {
    const db = makeDb();
    const e1 = insertEntity(db);
    const e2 = insertEntity(db);
    const oldDate = '2020-01-01T00:00:00.000Z';
    insertBugFix(db, { commitSha: 'sha4', bugEntityId: e1, category: 'regression', affectedPaths: ['src/old.ts'], committedAt: oldDate });
    insertBugFix(db, { commitSha: 'sha5', bugEntityId: e2, category: 'regression', affectedPaths: ['src/old.ts'], committedAt: oldDate });

    const results = detectRegressionClusters({ db, windowDays: 30, minCount: 2, logger: silentLogger });
    expect(results).toHaveLength(0);
  });
});

describe('detectSpecViolationClusters', () => {
  it('I13: 同 package で spec 3 件以上 + 全体 30% 以上 → drift_event 1 行', () => {
    const db = makeDb();
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    // web-app: spec x3, logic x1 → 3/4 = 75%
    for (let i = 0; i < 3; i++) {
      const e = insertEntity(db);
      insertBugFix(db, { commitSha: `spec-sha${i}`, bugEntityId: e, package: 'web-app', category: 'spec', affectedPaths: [], committedAt: recent });
    }
    const e4 = insertEntity(db);
    insertBugFix(db, { commitSha: 'logic-sha', bugEntityId: e4, package: 'web-app', category: 'logic', affectedPaths: [], committedAt: recent });

    const results = detectSpecViolationClusters({ db, windowDays: 90, minCount: 3, minRatio: 0.3, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].drift_type).toBe('spec_violation_cluster');
    expect(results[0].severity).toBe('warn');
  });

  it('spec 2 件のみ → minCount=3 未満で検知なし', () => {
    const db = makeDb();
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    for (let i = 0; i < 2; i++) {
      const e = insertEntity(db);
      insertBugFix(db, { commitSha: `spec2-sha${i}`, bugEntityId: e, package: 'pkg-a', category: 'spec', affectedPaths: [], committedAt: recent });
    }

    const results = detectSpecViolationClusters({ db, windowDays: 90, minCount: 3, minRatio: 0.3, logger: silentLogger });
    expect(results).toHaveLength(0);
  });
});

describe('detectRecurringRootCauses', () => {
  it('I14: 同 caused_by 先 entity に Bug 2 件 → drift_event 1 行', () => {
    const db = makeDb();
    // root cause entity
    const rootCause = insertEntity(db, 'root-concept-1');

    // Bug entity 2件
    const bug1 = insertEntity(db, 'bug-entity-1');
    const bug2 = insertEntity(db, 'bug-entity-2');

    // caused_by edges
    db.run(
      `INSERT INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id, source_type, source_ref, confidence, confidence_label, modality, valid_from, recorded_at)
       VALUES (?, ?, 'caused_by', ?, 'bug_history', 'ref-1', 0.8, 'EXTRACTED', 'asserted', ?, ?)`,
      ['edge-1', bug1, rootCause, TS, TS],
    );
    db.run(
      `INSERT INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id, source_type, source_ref, confidence, confidence_label, modality, valid_from, recorded_at)
       VALUES (?, ?, 'caused_by', ?, 'bug_history', 'ref-2', 0.8, 'EXTRACTED', 'asserted', ?, ?)`,
      ['edge-2', bug2, rootCause, TS, TS],
    );

    const results = detectRecurringRootCauses({ db, minBugs: 2, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].drift_type).toBe('recurring_root_cause');
    expect(results[0].subject_entity_id).toBe(rootCause);
    expect(results[0].severity).toBe('warn');
  });

  it('AMBIGUOUS edge は除外される', () => {
    const db = makeDb();
    const rootCause = insertEntity(db, 'root-concept-2');
    const bug1 = insertEntity(db, 'bug-entity-3');
    const bug2 = insertEntity(db, 'bug-entity-4');

    db.run(
      `INSERT INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id, source_type, source_ref, confidence, confidence_label, modality, valid_from, recorded_at)
       VALUES (?, ?, 'caused_by', ?, 'bug_history', 'ref-amb-1', 0.3, 'AMBIGUOUS', 'asserted', ?, ?)`,
      ['edge-amb-1', bug1, rootCause, TS, TS],
    );
    db.run(
      `INSERT INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id, source_type, source_ref, confidence, confidence_label, modality, valid_from, recorded_at)
       VALUES (?, ?, 'caused_by', ?, 'bug_history', 'ref-amb-2', 0.3, 'AMBIGUOUS', 'asserted', ?, ?)`,
      ['edge-amb-2', bug2, rootCause, TS, TS],
    );

    const results = detectRecurringRootCauses({ db, minBugs: 2, logger: silentLogger });
    expect(results).toHaveLength(0);
  });
});

describe('ワークスペースの解決', () => {
  it('regression クラスタのバグが 1 ワークスペースへ収束すれば workspace が付く', () => {
    const db = makeDb();
    const e1 = insertEntity(db);
    const e2 = insertEntity(db);
    const recent = recentIso();

    insertBugFix(db, { commitSha: 'ws-sha1', bugEntityId: e1, category: 'regression', affectedPaths: ['src/foo.ts'], committedAt: recent, workspace: 'anytime-trade' });
    insertBugFix(db, { commitSha: 'ws-sha2', bugEntityId: e2, category: 'regression', affectedPaths: ['src/foo.ts'], committedAt: recent, workspace: 'anytime-trade' });

    const results = detectRegressionClusters({ db, windowDays: 90, minCount: 2, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].workspace).toBe('anytime-trade');
  });

  it('regression クラスタが 2 ワークスペースに跨るなら workspace は未解決のまま', () => {
    const db = makeDb();
    const e1 = insertEntity(db);
    const e2 = insertEntity(db);
    const recent = recentIso();

    insertBugFix(db, { commitSha: 'mix-sha1', bugEntityId: e1, category: 'regression', affectedPaths: ['src/foo.ts'], committedAt: recent, workspace: 'anytime-trade' });
    insertBugFix(db, { commitSha: 'mix-sha2', bugEntityId: e2, category: 'regression', affectedPaths: ['src/foo.ts'], committedAt: recent, workspace: 'anytime-markdown' });

    const results = detectRegressionClusters({ db, windowDays: 90, minCount: 2, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].workspace).toBe('');
  });

  it('spec_violation クラスタは対象パッケージのバグから workspace を引く', () => {
    const db = makeDb();
    const recent = recentIso();
    for (let i = 0; i < 3; i++) {
      const e = insertEntity(db, `ws-spec-bug-${i}`);
      insertBugFix(db, { commitSha: `ws-spec-sha${i}`, bugEntityId: e, package: 'web-app', category: 'spec', affectedPaths: [], committedAt: recent, workspace: 'anytime-lab' });
    }

    const results = detectSpecViolationClusters({ db, windowDays: 90, minCount: 3, minRatio: 0.3, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].workspace).toBe('anytime-lab');
  });

  it('recurring_root_cause は紐づくバグ修正から workspace を引く', () => {
    const db = makeDb();
    const rootCause = insertEntity(db, 'ws-root-concept');
    const bug1 = insertEntity(db, 'ws-bug-entity-1');
    const bug2 = insertEntity(db, 'ws-bug-entity-2');

    insertBugFix(db, { commitSha: 'ws-rc-sha1', bugEntityId: bug1, category: 'logic', workspace: 'anytime-trade' });
    insertBugFix(db, { commitSha: 'ws-rc-sha2', bugEntityId: bug2, category: 'logic', workspace: 'anytime-trade' });

    for (const [edgeId, bug] of [['ws-edge-1', bug1], ['ws-edge-2', bug2]] as const) {
      db.run(
        `INSERT INTO memory_edges
           (id, subject_entity_id, predicate, object_entity_id, source_type, source_ref, confidence, confidence_label, modality, valid_from, recorded_at)
         VALUES (?, ?, 'caused_by', ?, 'bug_history', ?, 0.8, 'EXTRACTED', 'asserted', ?, ?)`,
        [edgeId, bug, rootCause, `ref-${edgeId}`, TS, TS],
      );
    }

    const results = detectRecurringRootCauses({ db, minBugs: 2, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].workspace).toBe('anytime-trade');
  });
});

/**
 * 会話由来の caused_by エッジ（実データではこれがほぼ全件）は memory-core 単独では
 * ワークスペースを決められず、episode → セッション → リポジトリの解決に trail.db が要る。
 * ここでは最小の trail スキーマを ATTACH して、その経路が効くことを確かめる。
 */
describe('detectRecurringRootCauses（trail.db ATTACH 時）', () => {
  const tmpFiles: string[] = [];

  afterAll(() => {
    for (const f of tmpFiles) {
      try { fs.rmSync(f, { force: true }); } catch { /* 後片付けの失敗はテスト結果に影響しない */ }
    }
  });

  function makeTrailDb(rows: ReadonlyArray<{ sessionId: string; repoName: string }>): string {
    const file = path.join(os.tmpdir(), `drift-trail-${process.pid}-${tmpFiles.length}-${Math.random()}.db`);
    tmpFiles.push(file);
    const trail = new BetterSqlite3MemoryDb({ filePath: file });
    trail.run('CREATE TABLE repos (repo_id INTEGER PRIMARY KEY, repo_name TEXT NOT NULL)');
    trail.run('CREATE TABLE sessions (id TEXT PRIMARY KEY, repo_id INTEGER)');
    const repoIds = new Map<string, number>();
    for (const r of rows) {
      if (!repoIds.has(r.repoName)) {
        const id = repoIds.size + 1;
        repoIds.set(r.repoName, id);
        trail.run('INSERT INTO repos (repo_id, repo_name) VALUES (?, ?)', [id, r.repoName]);
      }
      trail.run('INSERT INTO sessions (id, repo_id) VALUES (?, ?)', [r.sessionId, repoIds.get(r.repoName)!]);
    }
    trail.close();
    return file;
  }

  function insertEpisode(db: BetterSqlite3MemoryDb, id: string, sessionId: string): string {
    db.run(
      `INSERT INTO memory_episodes
         (id, session_id, message_uuid_start, message_uuid_end, agent_runtime, model, valid_from, recorded_at, raw_excerpt)
       VALUES (?, ?, 'u1', 'u2', 'claude_code', 'opus', ?, ?, '')`,
      [id, sessionId, TS, TS],
    );
    return id;
  }

  function insertCausedByEdge(
    db: BetterSqlite3MemoryDb,
    opts: { id: string; bugEntityId: string; rootCause: string; episodeId: string },
  ): void {
    db.run(
      `INSERT INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id, source_type, source_ref, confidence, confidence_label, modality, valid_from, recorded_at)
       VALUES (?, ?, 'caused_by', ?, 'conversation', ?, 0.8, 'EXTRACTED', 'asserted', ?, ?)`,
      [opts.id, opts.bugEntityId, opts.rootCause, opts.episodeId, TS, TS],
    );
  }

  it('会話由来のエッジでも episode → セッション → リポジトリで workspace を解決する', () => {
    const db = makeDb();
    const trailPath = makeTrailDb([
      { sessionId: 'sess-a', repoName: 'anytime-trade' },
      { sessionId: 'sess-b', repoName: 'anytime-trade' },
    ]);
    db.attach(trailPath, 'trail', true);

    const rootCause = insertEntity(db, 'conv-root-1');
    const bug1 = insertEntity(db, 'conv-bug-1');
    const bug2 = insertEntity(db, 'conv-bug-2');
    insertEpisode(db, 'ep-a', 'sess-a');
    insertEpisode(db, 'ep-b', 'sess-b');
    insertCausedByEdge(db, { id: 'ce-1', bugEntityId: bug1, rootCause, episodeId: 'ep-a' });
    insertCausedByEdge(db, { id: 'ce-2', bugEntityId: bug2, rootCause, episodeId: 'ep-b' });

    const results = detectRecurringRootCauses({ db, minBugs: 2, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].workspace).toBe('anytime-trade');
  });

  it('根本原因が 2 ワークスペースに跨るなら未解決のまま', () => {
    const db = makeDb();
    const trailPath = makeTrailDb([
      { sessionId: 'sess-a', repoName: 'anytime-trade' },
      { sessionId: 'sess-b', repoName: 'anytime-markdown' },
    ]);
    db.attach(trailPath, 'trail', true);

    const rootCause = insertEntity(db, 'conv-root-2');
    const bug1 = insertEntity(db, 'conv-bug-3');
    const bug2 = insertEntity(db, 'conv-bug-4');
    insertEpisode(db, 'ep-c', 'sess-a');
    insertEpisode(db, 'ep-d', 'sess-b');
    insertCausedByEdge(db, { id: 'ce-3', bugEntityId: bug1, rootCause, episodeId: 'ep-c' });
    insertCausedByEdge(db, { id: 'ce-4', bugEntityId: bug2, rootCause, episodeId: 'ep-d' });

    const results = detectRecurringRootCauses({ db, minBugs: 2, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].workspace).toBe('');
  });

  // trail.db が無い文脈（memory-core 単独・ユニットテスト）で trail. を参照すると
  // クエリごと落ちて検出結果が 0 件になる。参照しないことを結果で確かめる。
  it('trail.db が ATTACH されていなくても検出自体は動く（未解決になるだけ）', () => {
    const db = makeDb();
    const rootCause = insertEntity(db, 'conv-root-3');
    const bug1 = insertEntity(db, 'conv-bug-5');
    const bug2 = insertEntity(db, 'conv-bug-6');
    insertEpisode(db, 'ep-e', 'sess-x');
    insertCausedByEdge(db, { id: 'ce-5', bugEntityId: bug1, rootCause, episodeId: 'ep-e' });
    insertCausedByEdge(db, { id: 'ce-6', bugEntityId: bug2, rootCause, episodeId: 'ep-e' });

    const results = detectRecurringRootCauses({ db, minBugs: 2, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].workspace).toBe('');
  });
});
