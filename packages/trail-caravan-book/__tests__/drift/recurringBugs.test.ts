import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../src/db/migrations/runner';
import {
  detectRegressionClusters,
  detectSpecViolationClusters,
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
    `INSERT INTO caravan_entities
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
    `INSERT INTO caravan_bug_fixes
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

  // '' は「別のワークスペース」ではなく「未解決」。数に入れると、未解決が 1 件混ざった
  // だけでクラスタ全体が未解決へ落ち、そのワークスペースで絞ったとき画面から消える。
  it('未解決（空文字）が混ざっても解決済みのワークスペースへ寄せる', () => {
    const db = makeDb();
    const e1 = insertEntity(db);
    const e2 = insertEntity(db);
    const recent = recentIso();

    insertBugFix(db, { commitSha: 'blank-sha1', bugEntityId: e1, category: 'regression', affectedPaths: ['src/foo.ts'], committedAt: recent, workspace: 'anytime-trade' });
    insertBugFix(db, { commitSha: 'blank-sha2', bugEntityId: e2, category: 'regression', affectedPaths: ['src/foo.ts'], committedAt: recent, workspace: '' });

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

});

