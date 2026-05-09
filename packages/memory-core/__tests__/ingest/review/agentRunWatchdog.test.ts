import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { Database } from 'sql.js';
import { openMemoryCoreDb } from '../../../src/db/connection';
import { runAgentRunWatchdog } from '../../../src/ingest/review/agentRunWatchdog';
import { noopLogger } from '../../../src/logger';

const TS = '2026-01-01T00:00:00.000Z';

async function openFresh(): Promise<{ db: Database; close: () => void }> {
  const tmpPath = path.join(os.tmpdir(), `watchdog-test-${process.pid}-${Date.now()}.db`);
  process.env.MEMORY_CORE_DB_PATH = tmpPath;
  const { db, close } = await openMemoryCoreDb();
  return {
    db,
    close: () => {
      close();
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      delete process.env.MEMORY_CORE_DB_PATH;
    },
  };
}

function insertRunRow(
  db: Database,
  id: string,
  status: string,
  startedAt: string,
): void {
  db.run(
    `INSERT INTO memory_review_runs
       (id, trigger_kind, target_kind, model, prompt_kind, prompt_hash, started_at, status, recorded_at)
     VALUES (?, 'manual', 'code', 'test-model', 'logic', 'h1', ?, ?, ?)`,
    [id, startedAt, status, TS],
  );
}

// ── I23: 11 min ago running → error/timeout, 5 min ago running → unchanged ────

test('I23: 11 min stale → stale_count=1, only that row becomes error/timeout', async () => {
  const { db, close } = await openFresh();
  try {
    const now = new Date();
    const elevenMinAgo = new Date(now.getTime() - 11 * 60 * 1000).toISOString();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    insertRunRow(db, 'run-11m', 'running', elevenMinAgo);
    insertRunRow(db, 'run-5m', 'running', fiveMinAgo);
    insertRunRow(db, 'run-done', 'success', elevenMinAgo);

    const result = runAgentRunWatchdog({ db, timeoutMinutes: 10, logger: noopLogger });

    expect(result.stale_count).toBe(1);

    // 11 min row → error/timeout
    const staleRow = db.exec(
      `SELECT status, error_detail, finished_at FROM memory_review_runs WHERE id = 'run-11m'`,
    );
    expect(staleRow[0]?.values?.[0]?.[0]).toBe('error');
    expect(staleRow[0]?.values?.[0]?.[1]).toBe('timeout');
    expect(staleRow[0]?.values?.[0]?.[2]).not.toBeNull();

    // 5 min row → still running
    const freshRow = db.exec(
      `SELECT status FROM memory_review_runs WHERE id = 'run-5m'`,
    );
    expect(freshRow[0]?.values?.[0]?.[0]).toBe('running');

    // success row → unchanged
    const doneRow = db.exec(
      `SELECT status FROM memory_review_runs WHERE id = 'run-done'`,
    );
    expect(doneRow[0]?.values?.[0]?.[0]).toBe('success');
  } finally {
    close();
  }
}, 30000);

// ── shorter timeout: both rows become error ────────────────────────────────────

test('timeoutMinutes=4 → stale_count=2, both 11 min and 5 min rows become error', async () => {
  const { db, close } = await openFresh();
  try {
    const now = new Date();
    const elevenMinAgo = new Date(now.getTime() - 11 * 60 * 1000).toISOString();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    insertRunRow(db, 'run-11m', 'running', elevenMinAgo);
    insertRunRow(db, 'run-5m', 'running', fiveMinAgo);

    const result = runAgentRunWatchdog({ db, timeoutMinutes: 4, logger: noopLogger });

    expect(result.stale_count).toBe(2);

    const staleCount = db.exec(
      `SELECT COUNT(*) FROM memory_review_runs WHERE status = 'error' AND error_detail = 'timeout'`,
    );
    expect(staleCount[0]?.values?.[0]?.[0] as number).toBe(2);
  } finally {
    close();
  }
}, 30000);

// ── no running rows → stale_count=0 ───────────────────────────────────────────

test('no running rows → stale_count=0, no-op', async () => {
  const { db, close } = await openFresh();
  try {
    insertRunRow(db, 'run-ok', 'success', TS);

    const result = runAgentRunWatchdog({ db, timeoutMinutes: 10, logger: noopLogger });

    expect(result.stale_count).toBe(0);
  } finally {
    close();
  }
}, 30000);

// ── default timeoutMinutes=10 ──────────────────────────────────────────────────

test('default timeoutMinutes=10 is applied when not specified', async () => {
  const { db, close } = await openFresh();
  try {
    const now = new Date();
    const elevenMinAgo = new Date(now.getTime() - 11 * 60 * 1000).toISOString();
    insertRunRow(db, 'run-11m', 'running', elevenMinAgo);

    // Call without timeoutMinutes (use default 10)
    const result = runAgentRunWatchdog({ db, logger: noopLogger });

    expect(result.stale_count).toBe(1);
  } finally {
    close();
  }
}, 30000);
