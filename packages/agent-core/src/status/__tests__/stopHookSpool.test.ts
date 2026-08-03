import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  STOP_HOOK_SPOOL_MAX,
  appendStopHookSpool,
  consolidateStopHookSpoolEvents,
  drainStopHookSpool,
  stopHookSpoolPath,
} from '../stopHookSpool';
import type { StopHookSpoolEvent } from '../stopHookSpool';

function flightReview(overrides: Partial<Extract<StopHookSpoolEvent, { kind: 'flight_review' }>['payload']> = {}): StopHookSpoolEvent {
  return {
    kind: 'flight_review',
    payload: {
      sessionId: 'sess-1',
      transcriptPath: '/home/u/.claude/projects/p/sess-1.jsonl',
      cwd: '/ws',
      endedAt: '2026-08-02T10:00:00.000Z',
      ...overrides,
    },
  };
}

function safePoint(overrides: Partial<Extract<StopHookSpoolEvent, { kind: 'safe_point' }>['payload']> = {}): StopHookSpoolEvent {
  return {
    kind: 'safe_point',
    payload: {
      createdAt: '2026-08-02T10:00:00.000Z',
      commitHash: 'a'.repeat(40),
      branch: 'develop',
      worktree: '/ws',
      label: '',
      source: 'stop_hook',
      sessionId: 'sess-1',
      ...overrides,
    },
  };
}

describe('stopHookSpool', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'stop-hook-spool-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends and drains flight_review / safe_point events in order', () => {
    appendStopHookSpool(dir, flightReview());
    appendStopHookSpool(dir, safePoint());

    const drained = drainStopHookSpool(stopHookSpoolPath(dir));
    expect(drained.map((e) => e.kind)).toEqual(['flight_review', 'safe_point']);
    expect(existsSync(stopHookSpoolPath(dir))).toBe(false);
    expect(drainStopHookSpool(stopHookSpoolPath(dir))).toEqual([]);
  });

  it('accepts lines appended by the bash hook (plain JSONL, trailing newline)', () => {
    // フックは TS の append を通らず bash の printf >> で追記する。その形式を模擬する。
    const line = JSON.stringify(safePoint({ sessionId: null }));
    writeFileSync(stopHookSpoolPath(dir), `${line}\n`, 'utf8');

    const drained = drainStopHookSpool(stopHookSpoolPath(dir));
    expect(drained).toHaveLength(1);
    expect(drained[0]?.kind).toBe('safe_point');
  });

  it('skips corrupted or mistyped lines but keeps healthy ones, reporting via onError', () => {
    const spool = stopHookSpoolPath(dir);
    appendStopHookSpool(dir, flightReview());
    appendFileSync(spool, '{broken json\n', 'utf8');
    appendFileSync(spool, `${JSON.stringify({ kind: 'flight_review', payload: { sessionId: '' } })}\n`, 'utf8');
    appendFileSync(spool, `${JSON.stringify({ kind: 'unknown', payload: {} })}\n`, 'utf8');

    const errors: string[] = [];
    const drained = drainStopHookSpool(spool, (m) => errors.push(m));
    expect(drained).toHaveLength(1);
    expect(errors.length).toBe(3);
  });

  it('rejects appends beyond STOP_HOOK_SPOOL_MAX and reports via onError', () => {
    for (let i = 0; i < STOP_HOOK_SPOOL_MAX; i += 1) {
      appendStopHookSpool(dir, flightReview({ sessionId: `s-${i}` }));
    }
    const errors: string[] = [];
    appendStopHookSpool(dir, flightReview({ sessionId: 'overflow' }), (m) => errors.push(m));
    expect(errors.length).toBe(1);

    const drained = drainStopHookSpool(stopHookSpoolPath(dir));
    expect(drained.length).toBe(STOP_HOOK_SPOOL_MAX);
  });

  it('recovers orphaned .draining files before the current spool', () => {
    const spool = stopHookSpoolPath(dir);
    writeFileSync(`${spool}.draining-orphan1`, `${JSON.stringify(flightReview({ sessionId: 'orphan' }))}\n`, 'utf8');
    appendStopHookSpool(dir, flightReview({ sessionId: 'current' }));

    const drained = drainStopHookSpool(spool);
    const ids = drained.map((e) => (e.kind === 'flight_review' ? e.payload.sessionId : ''));
    expect(ids.sort()).toEqual(['current', 'orphan']);
    expect(existsSync(`${spool}.draining-orphan1`)).toBe(false);
  });

  it('writes one JSON object per line with a trailing newline', () => {
    appendStopHookSpool(dir, safePoint());
    const raw = readFileSync(stopHookSpoolPath(dir), 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(JSON.parse(raw.trim()).kind).toBe('safe_point');
  });
});

describe('consolidateStopHookSpoolEvents', () => {
  it('keeps only the latest flight_review per sessionId (Stop fires every turn)', () => {
    const events: StopHookSpoolEvent[] = [
      flightReview({ sessionId: 's-1', endedAt: '2026-08-02T10:00:00.000Z' }),
      flightReview({ sessionId: 's-2', endedAt: '2026-08-02T10:01:00.000Z' }),
      flightReview({ sessionId: 's-1', endedAt: '2026-08-02T10:05:00.000Z' }),
    ];
    const out = consolidateStopHookSpoolEvents(events);
    const s1 = out.filter((e) => e.kind === 'flight_review' && e.payload.sessionId === 's-1');
    expect(s1).toHaveLength(1);
    expect(s1[0]?.kind === 'flight_review' && s1[0].payload.endedAt).toBe('2026-08-02T10:05:00.000Z');
    expect(out.filter((e) => e.kind === 'flight_review')).toHaveLength(2);
  });

  it('keeps the latest flight_review even if orphan recovery reordered lines', () => {
    // 孤児 .draining 回収で新しい行が先に並ぶことがある。配列順でなく endedAt で比較する。
    const events: StopHookSpoolEvent[] = [
      flightReview({ sessionId: 's-1', endedAt: '2026-08-02T10:05:00.000Z' }),
      flightReview({ sessionId: 's-1', endedAt: '2026-08-02T10:00:00.000Z' }),
    ];
    const out = consolidateStopHookSpoolEvents(events);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind === 'flight_review' && out[0].payload.endedAt).toBe('2026-08-02T10:05:00.000Z');
  });

  it('collapses identical safe_point tuples but keeps distinct ones', () => {
    const events: StopHookSpoolEvent[] = [
      safePoint(),
      safePoint(), // 完全一致の重複（curl タイムアウト再送相当）
      safePoint({ commitHash: 'b'.repeat(40) }),
    ];
    const out = consolidateStopHookSpoolEvents(events);
    expect(out.filter((e) => e.kind === 'safe_point')).toHaveLength(2);
  });

  it('preserves mixed kinds', () => {
    const events: StopHookSpoolEvent[] = [flightReview(), safePoint()];
    expect(consolidateStopHookSpoolEvents(events)).toHaveLength(2);
  });
});
