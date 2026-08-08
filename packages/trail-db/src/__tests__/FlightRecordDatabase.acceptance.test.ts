// 受入台帳（caravan_acceptance_records）は 2026-08-07 に activity.db から caravan-book.db
// （FlightRecordDatabase）へ移設した。旧 TrailDatabase.acceptance.test.ts の移行版。
// コミット・リポジトリ情報（session_commits / commit_files / repos）は activity.db 残留の
// ため ctx.trailRun でシードする。

import type { AcceptanceRecordInput } from '@anytime-markdown/trail-activity';

import {
  createTestFlightRecordDatabase,
  type FlightRecordTestContext,
} from './support/createTestFlightRecordDb';

const T0 = '2026-07-18T10:00:00.000Z';

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
  ctx: FlightRecordTestContext,
  hash: string,
  message: string,
  committedAt: string,
  files: string[],
  repoId = 0,
): void {
  ctx.trailRun(
    `INSERT INTO session_commits (session_id, commit_hash, commit_message, author, committed_at, repo_id)
     VALUES ('sess-seed', ?, ?, 'tester', ?, ?)`,
    [hash, message, committedAt, repoId],
  );
  for (const file of files) {
    ctx.trailRun(`INSERT INTO commit_files (commit_hash, file_path, repo_id) VALUES (?, ?, ?)`, [hash, file, repoId]);
  }
}

describe('FlightRecordDatabase acceptance records (caravan_acceptance_records)', () => {
  let ctx: FlightRecordTestContext;

  beforeEach(() => {
    ctx = createTestFlightRecordDatabase();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('受入記録を既定値込みで保存し取得できる', () => {
    ctx.db.upsertAcceptanceRecord(recordInput({ failedTests: ['spec A'], vrtDiff: true, quarantinedCount: 2 }));

    const records = ctx.db.listAcceptanceRecords();
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
    ctx.db.upsertAcceptanceRecord(recordInput({ verdict: 'pending', decidedAt: null }));
    ctx.db.upsertAcceptanceRecord(recordInput({ verdict: 'pass' }));
    ctx.db.upsertAcceptanceRecord(recordInput({ route: 'human', verdict: 'pending', decidedAt: null }));

    const records = ctx.db.listAcceptanceRecords();
    expect(records).toHaveLength(2);
    const machine = records.find((r) => r.route === 'machine');
    expect(machine?.verdict).toBe('pass');
    expect(machine?.decidedAt).toBe(T0);
  });

  it('route / since / until フィルタが decided_at に対して効く', () => {
    ctx.db.upsertAcceptanceRecord(recordInput({ commitSha: 'c1', decidedAt: '2026-07-10T00:00:00.000Z' }));
    ctx.db.upsertAcceptanceRecord(recordInput({ commitSha: 'c2', decidedAt: '2026-07-15T00:00:00.000Z' }));
    ctx.db.upsertAcceptanceRecord(recordInput({ commitSha: 'c3', route: 'human', decidedAt: '2026-07-16T00:00:00.000Z' }));

    expect(ctx.db.listAcceptanceRecords({ route: 'human' })).toHaveLength(1);
    expect(ctx.db.listAcceptanceRecords({ since: '2026-07-14T00:00:00.000Z' })).toHaveLength(2);
    expect(ctx.db.listAcceptanceRecords({ until: '2026-07-14T00:00:00.000Z' })).toHaveLength(1);
  });

  describe('computeAcceptanceMissRate', () => {
    it('合格コミットと同一ファイルへ窓内の regression 系 fix が触れたら missed に数える', () => {
      ctx.db.upsertAcceptanceRecord(recordInput({ commitSha: 'pass-a', route: 'machine', decidedAt: T0 }));
      seedCommit(ctx, 'pass-a', 'feat: add feature', '2026-07-18T09:00:00.000Z', ['src/a.ts']);
      // 窓内（+2 日）の regression fix が同一ファイルに触れる
      seedCommit(ctx, 'fix-a', 'fix(web-app/regression): broken feature', '2026-07-20T10:00:00.000Z', ['src/a.ts']);

      const rates = ctx.db.computeAcceptanceMissRate(14);
      const machine = rates.find((r) => r.route === 'machine');
      expect(machine?.acceptedCount).toBe(1);
      expect(machine?.missedCount).toBe(1);
      expect(machine?.missRate).toBe(1);
    });

    it('別ファイル・窓外・非 fix・regression 以外の fix は missed に数えない', () => {
      ctx.db.upsertAcceptanceRecord(recordInput({ commitSha: 'pass-b', route: 'human', decidedAt: T0 }));
      seedCommit(ctx, 'pass-b', 'feat: another', '2026-07-18T09:00:00.000Z', ['src/b.ts']);
      seedCommit(ctx, 'fix-other', 'fix(web-app/regression): unrelated', '2026-07-19T00:00:00.000Z', ['src/other.ts']);
      seedCommit(ctx, 'fix-late', 'fix(regression): too late', '2026-08-10T00:00:00.000Z', ['src/b.ts']);
      seedCommit(ctx, 'feat-b', 'feat: touches same file', '2026-07-19T00:00:00.000Z', ['src/b.ts']);
      // 同一ファイル・窓内でも regression 系でない fix は対象外（要件書 §5.2）
      seedCommit(ctx, 'fix-logic', 'fix(logic): same file in window', '2026-07-19T12:00:00.000Z', ['src/b.ts']);

      const rates = ctx.db.computeAcceptanceMissRate(14);
      const human = rates.find((r) => r.route === 'human');
      expect(human?.acceptedCount).toBe(1);
      expect(human?.missedCount).toBe(0);
      expect(human?.missRate).toBe(0);
    });

    it('repo_name を解決できる場合は同一リポジトリ内でのみ照合する', () => {
      ctx.trailRun(`INSERT INTO repos (repo_id, repo_name, created_at) VALUES (1, 'repoA', '${T0}'), (2, 'repoB', '${T0}')`);
      ctx.db.upsertAcceptanceRecord(recordInput({ commitSha: 'pass-r', route: 'machine', decidedAt: T0, repoName: 'repoA' }));
      seedCommit(ctx, 'pass-r', 'feat: repoA feature', '2026-07-18T09:00:00.000Z', ['src/shared.ts'], 1);
      // 別リポジトリ（repoB）の regression fix が同名ファイルに触れても missed にしない
      seedCommit(ctx, 'fix-b-repo', 'fix(repoB/regression): other repo', '2026-07-19T00:00:00.000Z', ['src/shared.ts'], 2);

      const before = ctx.db.computeAcceptanceMissRate(14).find((r) => r.route === 'machine');
      expect(before?.missedCount).toBe(0);

      // 同一リポジトリ（repoA）の regression fix なら missed
      seedCommit(ctx, 'fix-a-repo', 'fix(repoA/regression): same repo', '2026-07-19T06:00:00.000Z', ['src/shared.ts'], 1);
      const after = ctx.db.computeAcceptanceMissRate(14).find((r) => r.route === 'machine');
      expect(after?.missedCount).toBe(1);
    });

    it('合格レコードが無い route は missRate=null（0 除算を率 0 と区別する）', () => {
      const rates = ctx.db.computeAcceptanceMissRate();
      expect(rates).toHaveLength(3);
      for (const rate of rates) {
        expect(rate.acceptedCount).toBe(0);
        expect(rate.missRate).toBeNull();
      }
    });

    it('verdict が pass 以外のレコードは母数に入らない', () => {
      ctx.db.upsertAcceptanceRecord(recordInput({ commitSha: 'fail-c', verdict: 'fail' }));
      ctx.db.upsertAcceptanceRecord(recordInput({ commitSha: 'notrun-d', verdict: 'not_run' }));

      const rates = ctx.db.computeAcceptanceMissRate();
      const machine = rates.find((r) => r.route === 'machine');
      expect(machine?.acceptedCount).toBe(0);
    });

    it('activity.db 未 ATTACH では missRate=null に縮退する（0 と区別する）', () => {
      const standalone = createTestFlightRecordDatabase();
      // activity.db を消して再オープン（ATTACH 不成立の構成を作る）
      standalone.db.close();
      const fs = require('node:fs') as typeof import('node:fs');
      fs.rmSync(standalone.trailDbPath);
      standalone.db.init();
      try {
        standalone.db.upsertAcceptanceRecord(recordInput({ commitSha: 'pass-x', route: 'machine', decidedAt: T0 }));
        const rates = standalone.db.computeAcceptanceMissRate(14);
        const machine = rates.find((r) => r.route === 'machine');
        expect(machine?.acceptedCount).toBe(1);
        expect(machine?.missRate).toBeNull();
      } finally {
        standalone.cleanup();
      }
    });
  });
});
