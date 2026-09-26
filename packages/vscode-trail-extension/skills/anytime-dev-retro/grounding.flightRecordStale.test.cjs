/**
 * Flight Record の記録経路停止（T-32）のリグレッション。
 * Stop フック spool の drain が止まると caravan_flight_reviews に新規行が入らず、30 日窓の指標が
 * 静かに 0 へ落ちて改善／悪化に見える。最終記録が 7 日超前（または記録ゼロ）なら
 * reviews30d.measurable=false を立て errors にも積む（沈黙させない）。
 */
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function runGrounding(setup) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'grounding-flight-stale-'));
  try {
    setup(ws);
    const r = spawnSync(process.execPath, [path.join(__dirname, 'grounding.cjs')], {
      cwd: ws,
      encoding: 'utf-8',
      timeout: 60000,
    });
    expect(r.status).toBe(0);
    return JSON.parse(r.stdout);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

function setupFlightRecord(ws, endedAt) {
  const dir = path.join(ws, '.anytime', 'trail', 'db');
  fs.mkdirSync(dir, { recursive: true });
  new DatabaseSync(path.join(dir, 'activity.db')).close();
  const db = new DatabaseSync(path.join(dir, 'caravan-book.db'));
  db.exec(`CREATE TABLE caravan_flight_reviews (
    id INTEGER PRIMARY KEY, session_id TEXT, ended_at TEXT, outcome TEXT, outcome_source TEXT,
    rework_count INTEGER, tool_failure_count INTEGER, tool_call_count INTEGER,
    lesson_candidates TEXT, unresolved_items TEXT
  )`);
  db.exec(`CREATE TABLE caravan_instructions (id TEXT PRIMARY KEY, summary TEXT, started_at TEXT, closed_at TEXT)`);
  db.exec(`CREATE TABLE caravan_instruction_sessions (instruction_id TEXT, session_id TEXT)`);
  if (endedAt !== null) {
    db.prepare(`INSERT INTO caravan_flight_reviews VALUES (1,'s1',?,'unknown','machine',0,0,1,'[]','[]')`).run(endedAt);
  }
  db.close();
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

describe('flightRecord.staleDays / reviews30d.measurable（記録経路の鮮度）', () => {
  it('最終記録が 7 日超前なら measurable=false で errors にも積む', () => {
    const snap = runGrounding((ws) => setupFlightRecord(ws, daysAgo(10)));
    expect(snap.flightRecord.staleDays).toBe(10);
    expect(snap.flightRecord.reviews30d.measurable).toBe(false);
    expect(snap.errors.some((e) => String(e).includes('flightRecord'))).toBe(true);
  });

  it('記録ゼロなら staleDays=null・measurable=false', () => {
    const snap = runGrounding((ws) => setupFlightRecord(ws, null));
    expect(snap.flightRecord.staleDays).toBeNull();
    expect(snap.flightRecord.reviews30d.measurable).toBe(false);
  });

  it('直近に記録があれば measurable=true で errors は空', () => {
    const snap = runGrounding((ws) => setupFlightRecord(ws, daysAgo(1)));
    expect(snap.flightRecord.staleDays).toBe(1);
    expect(snap.flightRecord.reviews30d.measurable).toBe(true);
    expect(snap.errors.some((e) => String(e).includes('flightRecord'))).toBe(false);
  });
});
