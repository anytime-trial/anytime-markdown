import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';

const TS = '2026-07-17T10:00:00.000Z';

function rawRun(db: TrailDatabase, sql: string): void {
  const inner = (db as unknown as { ensureDb(): { run(sql: string, params?: unknown[]): void } }).ensureDb();
  inner.run(sql);
}

function machineInput(overrides: Partial<Parameters<TrailDatabase['upsertFlightReviewFromMachine']>[0]> = {}) {
  return {
    sessionId: 'sess-1',
    workspacePath: '/ws',
    startedAt: '2026-07-17T09:00:00.000Z',
    endedAt: TS,
    durationSeconds: 3600,
    toolCallCount: 10,
    toolFailureCount: 1,
    reworkCount: 2,
    ...overrides,
  };
}

describe('TrailDatabase flight reviews (flight_reviews)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('機械集計行を outcome=unknown / outcome_source=machine の既定値で記録する', () => {
    db.upsertFlightReviewFromMachine(machineInput());

    const reviews = db.listFlightReviews();
    expect(reviews).toHaveLength(1);
    const review = reviews[0];
    expect(review?.sessionId).toBe('sess-1');
    expect(review?.outcome).toBe('unknown');
    expect(review?.outcomeSource).toBe('machine');
    expect(review?.toolCallCount).toBe(10);
    expect(review?.toolFailureCount).toBe(1);
    expect(review?.reworkCount).toBe(2);
    expect(review?.unresolvedItems).toBe('[]');
    expect(review?.tags).toBe('[]');
    expect(review?.notes).toBe('');
  });

  it('同一 session_id の再送で行が重複せず、機械集計列のみ更新される', () => {
    db.upsertFlightReviewFromMachine(machineInput({ toolCallCount: 10 }));
    db.upsertFlightReviewFromMachine(machineInput({ toolCallCount: 15, endedAt: '2026-07-17T11:00:00.000Z' }));

    const reviews = db.listFlightReviews();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.toolCallCount).toBe(15);
    expect(reviews[0]?.endedAt).toBe('2026-07-17T11:00:00.000Z');
  });

  it('再送が手動訂正済みの outcome / tags / notes を上書きしない', () => {
    db.upsertFlightReviewFromMachine(machineInput());
    // S3 の手動訂正を模擬（直接 UPDATE）
    rawRun(
      db,
      `UPDATE flight_reviews SET outcome = 'achieved', outcome_source = 'manual', tags = '["release"]', notes = 'ok' WHERE session_id = 'sess-1'`,
    );
    db.upsertFlightReviewFromMachine(machineInput({ toolCallCount: 20 }));

    const review = db.listFlightReviews()[0];
    expect(review?.outcome).toBe('achieved');
    expect(review?.outcomeSource).toBe('manual');
    expect(review?.tags).toBe('["release"]');
    expect(review?.notes).toBe('ok');
    expect(review?.toolCallCount).toBe(20);
  });

  it('started_at null（transcript 読取不能）の最小行を受け入れる', () => {
    db.upsertFlightReviewFromMachine(
      machineInput({ startedAt: null, durationSeconds: null, toolCallCount: 0, toolFailureCount: 0, reworkCount: 0 }),
    );
    const review = db.listFlightReviews()[0];
    expect(review?.startedAt).toBeNull();
    expect(review?.durationSeconds).toBeNull();
  });

  it('不正な outcome 値は CHECK 制約で拒否される（STRICT + CHECK の担保確認）', () => {
    db.upsertFlightReviewFromMachine(machineInput());
    expect(() =>
      rawRun(db, `UPDATE flight_reviews SET outcome = 'great' WHERE session_id = 'sess-1'`),
    ).toThrow();
  });

  it('sessionId / 期間フィルタと limit が効く', () => {
    db.upsertFlightReviewFromMachine(machineInput({ sessionId: 's1', endedAt: '2026-07-17T09:00:00.000Z' }));
    db.upsertFlightReviewFromMachine(machineInput({ sessionId: 's2', endedAt: '2026-07-17T10:00:00.000Z' }));
    db.upsertFlightReviewFromMachine(machineInput({ sessionId: 's3', endedAt: '2026-07-17T11:00:00.000Z' }));

    expect(db.listFlightReviews({ sessionId: 's2' })).toHaveLength(1);
    expect(db.listFlightReviews({ since: '2026-07-17T10:00:00.000Z' })).toHaveLength(2);
    expect(db.listFlightReviews({ until: '2026-07-17T09:30:00.000Z' })).toHaveLength(1);
    const limited = db.listFlightReviews({ limit: 2 });
    expect(limited).toHaveLength(2);
    // ended_at 降順
    expect(limited[0]?.sessionId).toBe('s3');
  });
});

describe('TrailDatabase flight reviews S2 (self assessment / lesson candidates / user feedback)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    db.close();
  });

  const assessment = {
    outcome: 'achieved' as const,
    unresolvedItems: ['S3 の UI'],
    nextConcerns: ['フック発火率'],
  };

  it('自己評価を反映すると outcome_source=self になり unresolved/nextConcerns が入る（FR-6）', () => {
    db.upsertFlightReviewFromMachine(machineInput());
    db.applySelfAssessmentToFlightReview('sess-1', assessment);

    const review = db.listFlightReviews()[0];
    expect(review?.outcome).toBe('achieved');
    expect(review?.outcomeSource).toBe('self');
    expect(review?.unresolvedItems).toBe('["S3 の UI"]');
    expect(review?.nextConcerns).toBe('["フック発火率"]');
  });

  it('outcome_source=manual の行は self が上書きしない（FR-8）', () => {
    db.upsertFlightReviewFromMachine(machineInput());
    rawRun(
      db,
      `UPDATE flight_reviews SET outcome = 'unachieved', outcome_source = 'manual' WHERE session_id = 'sess-1'`,
    );
    db.applySelfAssessmentToFlightReview('sess-1', assessment);

    const review = db.listFlightReviews()[0];
    expect(review?.outcome).toBe('unachieved');
    expect(review?.outcomeSource).toBe('manual');
  });

  it('機械集計の再送は self 反映済みの outcome を上書きしない（S1 セマンティクスの回帰確認）', () => {
    db.upsertFlightReviewFromMachine(machineInput());
    db.applySelfAssessmentToFlightReview('sess-1', assessment);
    db.upsertFlightReviewFromMachine(machineInput({ toolCallCount: 99 }));

    const review = db.listFlightReviews()[0];
    expect(review?.outcome).toBe('achieved');
    expect(review?.outcomeSource).toBe('self');
    expect(review?.toolCallCount).toBe(99);
  });

  it('学習候補を保存し listFlightReviews で読める（FR-11）', () => {
    db.upsertFlightReviewFromMachine(machineInput());
    db.saveFlightReviewLessonCandidates('sess-1', [
      { kind: 'tool_failure_chain', summary: 'ツール失敗が 2 回連続した', evidence: 'Bash' },
    ]);

    const review = db.listFlightReviews()[0];
    const candidates = JSON.parse(review?.lessonCandidates ?? '[]') as Array<{ kind: string }>;
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.kind).toBe('tool_failure_chain');
  });

  it('user feedback は内容キーで冪等（再送で重複しない。FR-9）', () => {
    const input = {
      sessionId: 'sess-1',
      occurredAt: '2026-07-17T10:00:00.000Z',
      promptExcerpt: 'A ではなく B で実装して',
      matchedPattern: 'ではなく',
    };
    db.recordUserFeedbackEntry(input);
    db.recordUserFeedbackEntry(input);
    db.recordUserFeedbackEntry({ ...input, occurredAt: '2026-07-17T11:00:00.000Z' });

    const entries = db.listUserFeedbackEntries({ sessionId: 'sess-1' });
    expect(entries).toHaveLength(2);
    // occurred_at 降順
    expect(entries[0]?.occurredAt).toBe('2026-07-17T11:00:00.000Z');
  });
});

describe('TrailDatabase flight reviews S3 (manual update / filter extension)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('手動訂正で outcome / tags / notes が更新され outcome_source=manual になる（FR-13）', () => {
    db.upsertFlightReviewFromMachine(machineInput());

    const updated = db.updateFlightReviewManual('sess-1', {
      outcome: 'achieved',
      tags: ['release'],
      notes: '手動確認済み',
    });

    expect(updated).toBe(true);
    const review = db.listFlightReviews()[0];
    expect(review?.outcome).toBe('achieved');
    expect(review?.outcomeSource).toBe('manual');
    expect(review?.tags).toBe('["release"]');
    expect(review?.notes).toBe('手動確認済み');
  });

  it('部分更新: outcome のみ指定で tags / notes は変わらない', () => {
    db.upsertFlightReviewFromMachine(machineInput());
    db.updateFlightReviewManual('sess-1', { tags: ['keep'], notes: 'keep-note' });

    db.updateFlightReviewManual('sess-1', { outcome: 'partial' });

    const review = db.listFlightReviews()[0];
    expect(review?.outcome).toBe('partial');
    expect(review?.tags).toBe('["keep"]');
    expect(review?.notes).toBe('keep-note');
  });

  it('対象行が無ければ false を返し行を作らない（FR-14 の 404 根拠）', () => {
    expect(db.updateFlightReviewManual('nope', { outcome: 'partial' })).toBe(false);
    expect(db.listFlightReviews()).toHaveLength(0);
  });

  it('空 patch は書き込まず存在有無のみ返す（manual 化しない）', () => {
    db.upsertFlightReviewFromMachine(machineInput());

    expect(db.updateFlightReviewManual('sess-1', {})).toBe(true);
    expect(db.updateFlightReviewManual('nope', {})).toBe(false);

    const review = db.listFlightReviews()[0];
    expect(review?.outcomeSource).toBe('machine');
  });

  it('manual 化以降は self が上書きしない（FR-13 回帰）', () => {
    db.upsertFlightReviewFromMachine(machineInput());
    db.updateFlightReviewManual('sess-1', { outcome: 'unachieved' });

    db.applySelfAssessmentToFlightReview('sess-1', {
      outcome: 'achieved',
      unresolvedItems: ['x'],
      nextConcerns: [],
    });

    const review = db.listFlightReviews()[0];
    expect(review?.outcome).toBe('unachieved');
    expect(review?.outcomeSource).toBe('manual');
  });

  it('manual 化以降も機械集計の再送は集計列のみ更新する（FR-13 回帰）', () => {
    db.upsertFlightReviewFromMachine(machineInput());
    db.updateFlightReviewManual('sess-1', { outcome: 'achieved', tags: ['t'] });

    db.upsertFlightReviewFromMachine(machineInput({ toolCallCount: 42 }));

    const review = db.listFlightReviews()[0];
    expect(review?.outcome).toBe('achieved');
    expect(review?.outcomeSource).toBe('manual');
    expect(review?.tags).toBe('["t"]');
    expect(review?.toolCallCount).toBe(42);
  });

  it('outcome フィルタが効く（FR-15）', () => {
    db.upsertFlightReviewFromMachine(machineInput({ sessionId: 's1' }));
    db.upsertFlightReviewFromMachine(machineInput({ sessionId: 's2' }));
    db.updateFlightReviewManual('s2', { outcome: 'achieved' });

    const achieved = db.listFlightReviews({ outcome: 'achieved' });
    expect(achieved).toHaveLength(1);
    expect(achieved[0]?.sessionId).toBe('s2');
    expect(db.listFlightReviews({ outcome: 'unknown' })).toHaveLength(1);
  });

  it('tag フィルタが配列内の等値一致で効く（部分一致しない。FR-15）', () => {
    db.upsertFlightReviewFromMachine(machineInput({ sessionId: 's1' }));
    db.upsertFlightReviewFromMachine(machineInput({ sessionId: 's2' }));
    db.updateFlightReviewManual('s1', { tags: ['release', 'ui'] });
    db.updateFlightReviewManual('s2', { tags: ['rel'] });

    const byRelease = db.listFlightReviews({ tag: 'release' });
    expect(byRelease).toHaveLength(1);
    expect(byRelease[0]?.sessionId).toBe('s1');
    expect(db.listFlightReviews({ tag: 'rel' })).toHaveLength(1);
    expect(db.listFlightReviews({ tag: 'ui' })[0]?.sessionId).toBe('s1');
  });

  it('outcome / tag / 期間フィルタが併用できる（FR-15）', () => {
    db.upsertFlightReviewFromMachine(machineInput({ sessionId: 's1', endedAt: '2026-07-17T09:00:00.000Z' }));
    db.upsertFlightReviewFromMachine(machineInput({ sessionId: 's2', endedAt: '2026-07-17T11:00:00.000Z' }));
    db.updateFlightReviewManual('s1', { outcome: 'achieved', tags: ['release'] });
    db.updateFlightReviewManual('s2', { outcome: 'achieved', tags: ['release'] });

    const filtered = db.listFlightReviews({
      outcome: 'achieved',
      tag: 'release',
      since: '2026-07-17T10:00:00.000Z',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.sessionId).toBe('s2');
  });
});

describe('TrailDatabase flight reviews S4 (rationale audit)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('既定の rationale_audit_status は unaudited で一覧に含まれる（FR-20）', () => {
    db.upsertFlightReviewFromMachine(machineInput());
    expect(db.listFlightReviews()[0]?.rationaleAuditStatus).toBe('unaudited');
  });

  it('markRationaleAudit でステータスが更新される（FR-21）', () => {
    db.upsertFlightReviewFromMachine(machineInput());
    expect(db.markRationaleAudit('sess-1', 'valid')).toBe(true);
    expect(db.listFlightReviews()[0]?.rationaleAuditStatus).toBe('valid');
    expect(db.markRationaleAudit('sess-1', 'needs_fix')).toBe(true);
    expect(db.listFlightReviews()[0]?.rationaleAuditStatus).toBe('needs_fix');
  });

  it('対象行が無ければ false を返し行を作らない（FR-22 の 404 根拠）', () => {
    expect(db.markRationaleAudit('nope', 'valid')).toBe(false);
    expect(db.listFlightReviews()).toHaveLength(0);
  });

  it('markRationaleAudit は outcome_source を変えず self 反映をブロックしない（FR-21）', () => {
    db.upsertFlightReviewFromMachine(machineInput());
    db.markRationaleAudit('sess-1', 'valid');

    const review = db.listFlightReviews()[0];
    expect(review?.outcomeSource).toBe('machine');

    // 監査後も self 自己評価は通常どおり反映される（manual 化していない）
    db.applySelfAssessmentToFlightReview('sess-1', {
      outcome: 'achieved',
      unresolvedItems: [],
      nextConcerns: [],
    });
    const after = db.listFlightReviews()[0];
    expect(after?.outcome).toBe('achieved');
    expect(after?.outcomeSource).toBe('self');
    expect(after?.rationaleAuditStatus).toBe('valid');
  });

  it('不正なステータス値は CHECK 制約で拒否される', () => {
    db.upsertFlightReviewFromMachine(machineInput());
    expect(() =>
      rawRun(db, `UPDATE flight_reviews SET rationale_audit_status = 'great' WHERE session_id = 'sess-1'`),
    ).toThrow();
  });

  it('manual 訂正と監査ステータスは互いを壊さない', () => {
    db.upsertFlightReviewFromMachine(machineInput());
    db.updateFlightReviewManual('sess-1', { outcome: 'achieved' });
    db.markRationaleAudit('sess-1', 'rejected');

    const review = db.listFlightReviews()[0];
    expect(review?.outcome).toBe('achieved');
    expect(review?.outcomeSource).toBe('manual');
    expect(review?.rationaleAuditStatus).toBe('rejected');
  });
});
