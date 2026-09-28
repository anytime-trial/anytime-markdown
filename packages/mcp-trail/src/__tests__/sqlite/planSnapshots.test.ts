import BetterSqlite3, { type Database } from 'better-sqlite3';
import {
  diffPlanSections,
  fingerprintPlanSections,
  latestPlanSnapshotDirect,
  recordPlanSnapshotDirect,
} from '../../sqlite/planSnapshots';

const PLAN = [
  '---',
  'title: plan',
  '---',
  '',
  '# 計画',
  '',
  '前文。',
  '',
  '## タスク',
  '',
  '### T1: 型を直す',
  '',
  '- [ ] 作業 A',
  '',
  '```ts',
  '## フェンス内の見出しは無視',
  '```',
  '',
  '### T2: テスト',
  '',
  '- [ ] 作業 B',
  '',
  '### T2: テスト',
  '',
  '同名 2 つ目',
].join('\n');

describe('fingerprintPlanSections', () => {
  it('フェンス外の見出しで分割し、下位見出しを親に含めず、同名見出しを出現順で区別する', () => {
    const sections = fingerprintPlanSections(PLAN);
    expect(sections.map((s) => `${s.heading}#${s.occurrence}`)).toEqual([
      '# 計画#1',
      '## タスク#1',
      '### T1: 型を直す#1',
      '### T2: テスト#1',
      '### T2: テスト#2',
    ]);
    // 親「## タスク」の本文は空（下位見出しを含まない）
    const empty = fingerprintPlanSections('## タスク\n')[0].hash;
    expect(sections[1].hash).toBe(empty);
  });

  it('末尾空白と末尾の空行の差はハッシュに影響しない', () => {
    const a = fingerprintPlanSections('## A\n\nbody\n');
    const b = fingerprintPlanSections('## A  \n\nbody   \n\n\n');
    expect(a[0].hash).toBe(b[0].hash);
    expect(fingerprintPlanSections('## A\n\nbody 2\n')[0].hash).not.toBe(a[0].hash);
  });
});

describe('diffPlanSections', () => {
  it('changed / removed / added / unchanged を見出し＋出現順で返す', () => {
    const before = fingerprintPlanSections(PLAN);
    const after = fingerprintPlanSections(
      PLAN.replace('- [ ] 作業 A', '- [x] 作業 A（人間が完了に変更）').replace('\n### T2: テスト\n\n同名 2 つ目', '') +
        '\n\n### T3: 追加\n\n新規',
    );
    const diff = diffPlanSections(before, after);
    expect(diff.changed).toEqual([{ heading: '### T1: 型を直す', occurrence: 1 }]);
    expect(diff.removed).toEqual([{ heading: '### T2: テスト', occurrence: 2 }]);
    expect(diff.added).toEqual([{ heading: '### T3: 追加', occurrence: 1 }]);
    expect(diff.unchanged).toBe(3);
  });
});

describe('plan snapshot rows', () => {
  let db: Database;
  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
  });
  afterEach(() => {
    db.close();
  });

  it('テーブル不在では latest が null（ensure を起動しない）', () => {
    expect(latestPlanSnapshotDirect(db, '/plans/p.md')).toBeNull();
    expect(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all()).toEqual([]);
  });

  it('記録は追記で、最新の 1 件を plan_path ごとに返す', () => {
    const sections = fingerprintPlanSections(PLAN);
    recordPlanSnapshotDirect(db, {
      sessionId: 's1',
      instructionId: 'i1',
      planPath: '/plans/p.md',
      sections,
      recordedAt: '2026-09-28T10:00:00.000Z',
    });
    recordPlanSnapshotDirect(db, {
      sessionId: 's2',
      instructionId: null,
      planPath: '/plans/p.md',
      sections: sections.slice(0, 2),
      recordedAt: '2026-09-28T11:00:00.000Z',
    });
    recordPlanSnapshotDirect(db, { sessionId: 's3', instructionId: null, planPath: '/plans/q.md', sections });
    const latest = latestPlanSnapshotDirect(db, '/plans/p.md');
    expect(latest?.sessionId).toBe('s2');
    expect(latest?.instructionId).toBeNull();
    expect(latest?.sections).toHaveLength(2);
    expect(db.prepare('SELECT COUNT(*) AS n FROM caravan_plan_snapshots').get()).toEqual({ n: 3 });
  });
});
