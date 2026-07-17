import { createFileBackedTestDb, createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';

const TS = '2026-07-16T10:00:00.000Z';

function safePoint(overrides: Partial<Parameters<TrailDatabase['recordSafePoint']>[0]> = {}) {
  return {
    createdAt: TS,
    commitHash: 'a'.repeat(40),
    branch: 'develop',
    worktree: '/ws',
    label: '',
    source: 'stop_hook' as const,
    sessionId: null,
    ...overrides,
  };
}

describe('TrailDatabase emergency (safe_points / emergency_log)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('records and lists safe points in created_at descending order', () => {
    db.recordSafePoint(safePoint({ createdAt: '2026-07-16T10:00:00.000Z', label: 'old' }));
    db.recordSafePoint(safePoint({ createdAt: '2026-07-16T11:00:00.000Z', label: 'new' }));

    const points = db.listSafePoints();
    expect(points).toHaveLength(2);
    expect(points[0]?.label).toBe('new');
    expect(points[1]?.label).toBe('old');
    expect(points[0]?.commitHash).toBe('a'.repeat(40));
    expect(points[0]?.source).toBe('stop_hook');
    expect(points[0]?.sessionId).toBeNull();
  });

  it('respects the list limit', () => {
    for (let i = 0; i < 5; i += 1) {
      db.recordSafePoint(safePoint({ createdAt: `2026-07-16T10:0${i}:00.000Z` }));
    }
    expect(db.listSafePoints(2)).toHaveLength(2);
  });

  it('prunes safe points beyond the retention cap (500)', () => {
    for (let i = 0; i < 502; i += 1) {
      const minutes = String(i % 60).padStart(2, '0');
      const hours = String(Math.floor(i / 60)).padStart(2, '0');
      db.recordSafePoint(safePoint({ createdAt: `2026-07-16T${hours}:${minutes}:00.000Z`, label: `p${i}` }));
    }
    const points = db.listSafePoints(1000);
    expect(points).toHaveLength(500);
    // 最古の 2 件（p0, p1）が削除されている
    expect(points.some((p) => p.label === 'p0')).toBe(false);
    expect(points.some((p) => p.label === 'p1')).toBe(false);
    expect(points.some((p) => p.label === 'p501')).toBe(true);
  });

  it('rejects an invalid safe point source via CHECK constraint', () => {
    expect(() =>
      db.recordSafePoint(safePoint({ source: 'invalid' as never })),
    ).toThrow();
  });

  it('records and lists emergency events with session and detail', () => {
    db.recordEmergencyEvent({
      occurredAt: TS,
      event: 'kill_switch_on',
      reason: 'runaway loop',
      actor: 'human',
      sessionId: 'sess-1',
      detailJson: '{"trigger":"manual"}',
    });
    db.recordEmergencyEvent({
      occurredAt: '2026-07-16T11:00:00.000Z',
      event: 'kill_switch_off',
      reason: '',
      actor: 'human',
      sessionId: null,
      detailJson: '{}',
    });

    const events = db.listEmergencyEvents();
    expect(events).toHaveLength(2);
    expect(events[0]?.event).toBe('kill_switch_off');
    expect(events[1]?.event).toBe('kill_switch_on');
    expect(events[1]?.reason).toBe('runaway loop');
    expect(events[1]?.sessionId).toBe('sess-1');
    expect(events[1]?.detailJson).toBe('{"trigger":"manual"}');
  });

  it('is idempotent for identical events (at-least-once drain resend is absorbed)', () => {
    const input = {
      occurredAt: TS,
      event: 'anomaly_detected',
      reason: 'ループ検知: Read が同一引数で 5 回連続実行されています',
      actor: 'agent',
      sessionId: 'sess-loop',
      detailJson: '{"kind":"loop_detected","signature":"abc"}',
    } as const;
    db.recordEmergencyEvent(input);
    db.recordEmergencyEvent(input); // 再送（drain の POST タイムアウト後の再試行を模擬）
    expect(db.listEmergencyEvents().filter((e) => e.sessionId === 'sess-loop')).toHaveLength(1);

    // sessionId が null でも冪等（IS 比較で NULL 同士が一致すること。detailJson は非 null 型）
    const nullInput = { ...input, sessionId: null, reason: 'null-key' };
    db.recordEmergencyEvent(nullInput);
    db.recordEmergencyEvent(nullInput);
    expect(db.listEmergencyEvents().filter((e) => e.reason === 'null-key')).toHaveLength(1);

    // 内容が 1 列でも異なれば別イベントとして記録される
    db.recordEmergencyEvent({ ...input, occurredAt: '2026-07-16T12:00:00.000Z' });
    expect(db.listEmergencyEvents().filter((e) => e.sessionId === 'sess-loop')).toHaveLength(2);
  });

  it('rejects an invalid emergency event kind via CHECK constraint', () => {
    expect(() =>
      db.recordEmergencyEvent({
        occurredAt: TS,
        event: 'not_an_event' as never,
        reason: '',
        actor: 'human',
        sessionId: null,
        detailJson: '{}',
      }),
    ).toThrow();
  });

  it('rejects invalid detail_json via json_valid CHECK', () => {
    expect(() =>
      db.recordEmergencyEvent({
        occurredAt: TS,
        event: 'kill_switch_on',
        reason: '',
        actor: 'human',
        sessionId: null,
        detailJson: '{broken',
      }),
    ).toThrow();
  });

  it('records section_lock events (Phase 5 S4)', () => {
    db.recordEmergencyEvent({
      occurredAt: TS,
      event: 'section_lock_denied',
      reason: 'ロック節への変更を拒否',
      actor: 'agent',
      sessionId: 'sess-1',
      detailJson: '{"path":"設計","kind":"section_modified"}',
    });
    db.recordEmergencyEvent({
      occurredAt: '2026-07-16T11:00:00.000Z',
      event: 'section_lock_tamper',
      reason: 'ロック外経路の変更を検知',
      actor: 'agent',
      sessionId: null,
      detailJson: '{}',
    });

    const events = db.listEmergencyEvents();
    expect(events.map((e) => e.event)).toEqual(['section_lock_tamper', 'section_lock_denied']);
  });
});

describe('emergency_log event kind migration (Phase 5 S4)', () => {
  // S4 以前の CHECK 制約（section_lock 系を含まない）を持つ既存 DB のレガシー fixture。
  const LEGACY_EMERGENCY_LOG = `CREATE TABLE emergency_log (
    id INTEGER PRIMARY KEY,
    occurred_at TEXT NOT NULL CHECK (occurred_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR occurred_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
    event TEXT NOT NULL
      CHECK (event IN ('kill_switch_on', 'kill_switch_off', 'rollback_executed', 'anomaly_detected')),
    reason TEXT NOT NULL DEFAULT '',
    actor TEXT NOT NULL DEFAULT 'human' CHECK (actor IN ('human', 'claude', 'agent')),
    session_id TEXT,
    detail_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail_json))
  ) STRICT`;

  it('rebuilds an existing table with the old CHECK so new kinds are accepted (rows preserved)', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const nodePath = await import('node:path');
    const { default: BetterSqlite3 } = await import('better-sqlite3');

    const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'trail-s4-migration-'));
    try {
      const legacy = new BetterSqlite3(nodePath.join(dir, 'trail.db'));
      legacy.exec(LEGACY_EMERGENCY_LOG);
      legacy
        .prepare(
          `INSERT INTO emergency_log (occurred_at, event, reason, actor, session_id, detail_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(TS, 'kill_switch_on', 'legacy row', 'human', null, '{}');
      legacy.close();

      const migrated = await createFileBackedTestDb(dir);
      try {
        migrated.recordEmergencyEvent({
          occurredAt: '2026-07-17T00:00:00.000Z',
          event: 'section_lock_denied',
          reason: 'after migration',
          actor: 'agent',
          sessionId: null,
          detailJson: '{}',
        });
        const events = migrated.listEmergencyEvents();
        expect(events.map((e) => e.event)).toEqual(['section_lock_denied', 'kill_switch_on']);
        expect(events[1]?.reason).toBe('legacy row');
      } finally {
        migrated.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
