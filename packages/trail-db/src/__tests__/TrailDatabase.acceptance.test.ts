import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';
import type { AcceptanceRecordInput } from '@anytime-markdown/trail-core';

const T0 = '2026-07-18T10:00:00.000Z';

function rawRun(db: TrailDatabase, sql: string, params?: unknown[]): void {
  const inner = (db as unknown as { ensureDb(): { run(sql: string, params?: unknown[]): void } }).ensureDb();
  inner.run(sql, params);
}

function recordInput(overrides: Partial<AcceptanceRecordInput> = {}): AcceptanceRecordInput {
  return {
    commitSha: 'aaaa111',
    route: 'machine',
    verdict: 'pass',
    decidedBy: 'farm',
    decidedAt: T0,
    ...overrides,
  };
}

function seedCommit(
  db: TrailDatabase,
  hash: string,
  message: string,
  committedAt: string,
  files: string[],
  repoId = 0,
): void {
  rawRun(
    db,
    `INSERT INTO session_commits (session_id, commit_hash, commit_message, author, committed_at, repo_id)
     VALUES ('sess-seed', ?, ?, 'tester', ?, ?)`,
    [hash, message, committedAt, repoId],
  );
  for (const file of files) {
    rawRun(db, `INSERT INTO commit_files (commit_hash, file_path, repo_id) VALUES (?, ?, ?)`, [hash, file, repoId]);
  }
}

describe('TrailDatabase acceptance records (acceptance_records)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('受入記録を既定値込みで保存し取得できる', () => {
    db.upsertAcceptanceRecord(recordInput({ failedTests: ['spec A'], vrtDiff: true, quarantinedCount: 2 }));

    const records = db.listAcceptanceRecords();
    expect(records).toHaveLength(1);
    const rec = records[0];
    expect(rec?.commitSha).toBe('aaaa111');
    expect(rec?.route).toBe('machine');
    expect(rec?.verdict).toBe('pass');
    expect(rec?.decidedBy).toBe('farm');
    expect(rec?.decidedAt).toBe(T0);
    expect(rec?.failedTests).toBe('["spec A"]');
    expect(rec?.vrtDiff).toBe(true);
    expect(rec?.quarantinedCount).toBe(2);
    expect(rec?.repoName).toBe('');
    expect(rec?.notes).toBe('');
  });

  it('(commit_sha, route) キーで冪等 UPSERT され、別 route は別行になる', () => {
    db.upsertAcceptanceRecord(recordInput({ verdict: 'pending', decidedAt: null }));
    db.upsertAcceptanceRecord(recordInput({ verdict: 'pass' }));
    db.upsertAcceptanceRecord(recordInput({ route: 'human', verdict: 'pending', decidedAt: null }));

    const records = db.listAcceptanceRecords();
    expect(records).toHaveLength(2);
    const machine = records.find((r) => r.route === 'machine');
    expect(machine?.verdict).toBe('pass');
    expect(machine?.decidedAt).toBe(T0);
  });

  it('route / since / until フィルタが decided_at に対して効く', () => {
    db.upsertAcceptanceRecord(recordInput({ commitSha: 'c1', decidedAt: '2026-07-10T00:00:00.000Z' }));
    db.upsertAcceptanceRecord(recordInput({ commitSha: 'c2', decidedAt: '2026-07-15T00:00:00.000Z' }));
    db.upsertAcceptanceRecord(recordInput({ commitSha: 'c3', route: 'human', decidedAt: '2026-07-16T00:00:00.000Z' }));

    expect(db.listAcceptanceRecords({ route: 'human' })).toHaveLength(1);
    expect(db.listAcceptanceRecords({ since: '2026-07-14T00:00:00.000Z' })).toHaveLength(2);
    expect(db.listAcceptanceRecords({ until: '2026-07-14T00:00:00.000Z' })).toHaveLength(1);
  });

  describe('computeAcceptanceMissRate', () => {
    it('合格コミットと同一ファイルへ窓内の regression 系 fix が触れたら missed に数える', () => {
      db.upsertAcceptanceRecord(recordInput({ commitSha: 'pass-a', route: 'machine', decidedAt: T0 }));
      seedCommit(db, 'pass-a', 'feat: add feature', '2026-07-18T09:00:00.000Z', ['src/a.ts']);
      // 窓内（+2 日）の regression fix が同一ファイルに触れる
      seedCommit(db, 'fix-a', 'fix(web-app/regression): broken feature', '2026-07-20T10:00:00.000Z', ['src/a.ts']);

      const rates = db.computeAcceptanceMissRate(14);
      const machine = rates.find((r) => r.route === 'machine');
      expect(machine?.acceptedCount).toBe(1);
      expect(machine?.missedCount).toBe(1);
      expect(machine?.missRate).toBe(1);
    });

    it('別ファイル・窓外・非 fix・regression 以外の fix は missed に数えない', () => {
      db.upsertAcceptanceRecord(recordInput({ commitSha: 'pass-b', route: 'human', decidedAt: T0 }));
      seedCommit(db, 'pass-b', 'feat: another', '2026-07-18T09:00:00.000Z', ['src/b.ts']);
      seedCommit(db, 'fix-other', 'fix(web-app/regression): unrelated', '2026-07-19T00:00:00.000Z', ['src/other.ts']);
      seedCommit(db, 'fix-late', 'fix(regression): too late', '2026-08-10T00:00:00.000Z', ['src/b.ts']);
      seedCommit(db, 'feat-b', 'feat: touches same file', '2026-07-19T00:00:00.000Z', ['src/b.ts']);
      // 同一ファイル・窓内でも regression 系でない fix は対象外（要件書 §5.2）
      seedCommit(db, 'fix-logic', 'fix(logic): same file in window', '2026-07-19T12:00:00.000Z', ['src/b.ts']);

      const rates = db.computeAcceptanceMissRate(14);
      const human = rates.find((r) => r.route === 'human');
      expect(human?.acceptedCount).toBe(1);
      expect(human?.missedCount).toBe(0);
      expect(human?.missRate).toBe(0);
    });

    it('repo_name を解決できる場合は同一リポジトリ内でのみ照合する', () => {
      rawRun(db, `INSERT INTO repos (repo_id, repo_name, created_at) VALUES (1, 'repoA', '${T0}'), (2, 'repoB', '${T0}')`);
      db.upsertAcceptanceRecord(recordInput({ commitSha: 'pass-r', route: 'machine', decidedAt: T0, repoName: 'repoA' }));
      seedCommit(db, 'pass-r', 'feat: repoA feature', '2026-07-18T09:00:00.000Z', ['src/shared.ts'], 1);
      // 別リポジトリ（repoB）の regression fix が同名ファイルに触れても missed にしない
      seedCommit(db, 'fix-b-repo', 'fix(repoB/regression): other repo', '2026-07-19T00:00:00.000Z', ['src/shared.ts'], 2);

      const before = db.computeAcceptanceMissRate(14).find((r) => r.route === 'machine');
      expect(before?.missedCount).toBe(0);

      // 同一リポジトリ（repoA）の regression fix なら missed
      seedCommit(db, 'fix-a-repo', 'fix(repoA/regression): same repo', '2026-07-19T06:00:00.000Z', ['src/shared.ts'], 1);
      const after = db.computeAcceptanceMissRate(14).find((r) => r.route === 'machine');
      expect(after?.missedCount).toBe(1);
    });

    it('合格レコードが無い route は missRate=null（0 除算を率 0 と区別する）', () => {
      const rates = db.computeAcceptanceMissRate();
      expect(rates).toHaveLength(3);
      for (const rate of rates) {
        expect(rate.acceptedCount).toBe(0);
        expect(rate.missRate).toBeNull();
      }
    });

    it('verdict が pass 以外のレコードは母数に入らない', () => {
      db.upsertAcceptanceRecord(recordInput({ commitSha: 'fail-c', verdict: 'fail' }));
      db.upsertAcceptanceRecord(recordInput({ commitSha: 'notrun-d', verdict: 'not_run' }));

      const rates = db.computeAcceptanceMissRate();
      const machine = rates.find((r) => r.route === 'machine');
      expect(machine?.acceptedCount).toBe(0);
    });
  });
});
