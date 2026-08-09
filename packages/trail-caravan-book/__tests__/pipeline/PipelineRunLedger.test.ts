import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
import { runMigrations } from '../../src/db/migrations/runner';
import { PipelineRunLedger } from '../../src/pipeline/PipelineRunLedger';
import type { CaravanLogger } from '../../src/logger';

const silentLogger: CaravanLogger = {
  info: () => {},
  error: () => {},
};

function makeCaravanDb(): BetterSqlite3CaravanDb {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function readRun(db: BetterSqlite3CaravanDb, id: string): Record<string, unknown> {
  const stmt = db.prepare(`SELECT * FROM caravan_pipeline_runs WHERE id = ?`);
  try {
    const row = stmt.get(id);
    if (!row) throw new Error(`run ${id} not found`);
    return row as Record<string, unknown>;
  } finally {
    stmt.free?.();
  }
}

function readRunLogs(db: BetterSqlite3CaravanDb, runId?: string): Record<string, unknown>[] {
  const sql = runId
    ? `SELECT * FROM caravan_pipeline_run_logs WHERE run_id = ? ORDER BY id`
    : `SELECT * FROM caravan_pipeline_run_logs ORDER BY id`;
  const stmt = db.prepare(sql);
  try {
    return (runId ? stmt.all(runId) : stmt.all()) as Record<string, unknown>[];
  } finally {
    stmt.free?.();
  }
}

describe('PipelineRunLedger', () => {
  let db: BetterSqlite3CaravanDb;

  beforeEach(() => {
    db = makeCaravanDb();
  });

  afterEach(() => {
    db.close?.();
  });

  it('start() は running の run を作り heartbeat を started_at で種付けする', () => {
    const ledger = new PipelineRunLedger({
      db,
      scope: 'conversation_incremental',
      wave: 'memory',
      tier: 3,
      logger: silentLogger,
    });

    const runId = ledger.start('2026-08-05T00:00:00.000Z');
    const row = readRun(db, runId);

    expect(row['status']).toBe('running');
    expect(row['scope']).toBe('conversation_incremental');
    expect(row['wave']).toBe('memory');
    expect(row['tier']).toBe(3);
    expect(row['started_at']).toBe('2026-08-05T00:00:00.000Z');
    expect(row['last_heartbeat_at']).toBe('2026-08-05T00:00:00.000Z');
  });

  it('Wave 1/2/4 の scope も同じ台帳へ記録できる', () => {
    const ledger = new PipelineRunLedger({
      db,
      scope: 'GitIngester',
      wave: 'sources',
      tier: 1,
      logger: silentLogger,
    });

    const runId = ledger.start('2026-08-05T00:00:00.000Z');
    const row = readRun(db, runId);

    expect(row['wave']).toBe('sources');
    expect(row['tier']).toBe(1);
  });

  it('同一ミリ秒の連続実行でも run ID が衝突しない', () => {
    // リグレッション: scope + started_at だけの決定論的 ID は、1 プロセス内で
    // 連続実行が同一ミリ秒へ着地したとき主キー衝突を起こす（better-sqlite3
    // 移行時に発生した実績あり）。
    const makeLedger = (): PipelineRunLedger =>
      new PipelineRunLedger({
        db,
        scope: 'conversation_incremental',
        wave: 'memory',
        tier: 3,
        logger: silentLogger,
      });

    const first = makeLedger().start('2026-08-05T00:00:00.000Z');
    const second = makeLedger().start('2026-08-05T00:00:00.000Z');

    expect(first).not.toBe(second);
    expect(readRun(db, first)['status']).toBe('running');
    expect(readRun(db, second)['status']).toBe('running');
  });

  it('heartbeat() は last_heartbeat_at と途中集計を更新する', () => {
    const ledger = new PipelineRunLedger({
      db,
      scope: 'code_incremental',
      wave: 'memory',
      tier: 3,
      logger: silentLogger,
    });
    const runId = ledger.start('2026-08-05T00:00:00.000Z');

    ledger.heartbeat({ items_processed: 7, entities_inserted: 3 });
    const row = readRun(db, runId);

    expect(row['items_processed']).toBe(7);
    expect(row['entities_inserted']).toBe(3);
    expect(row['last_heartbeat_at']).not.toBe('2026-08-05T00:00:00.000Z');
    expect(row['status']).toBe('running');
  });

  it('finish() は status と集計と duration_ms を確定する', () => {
    const ledger = new PipelineRunLedger({
      db,
      scope: 'spec_incremental',
      wave: 'memory',
      tier: 3,
      logger: silentLogger,
    });
    const runId = ledger.start('2026-08-05T00:00:00.000Z');

    ledger.finish('success', { items_processed: 12, edges_inserted: 5 });
    const row = readRun(db, runId);

    expect(row['status']).toBe('success');
    expect(row['items_processed']).toBe(12);
    expect(row['edges_inserted']).toBe(5);
    expect(row['finished_at']).toEqual(expect.any(String));
    expect(Number(row['duration_ms'])).toBeGreaterThanOrEqual(0);
  });

  it('finish("error", ..., detail) は error_detail を run 行へ書く', () => {
    // リグレッション: 旧 finalizePipelineRun は UPDATE 文に error_detail を含めず、
    // error 行の中身が常に空だった。scope 単位の caravan_pipeline_state は毎回
    // 上書きされるため、過去の失敗理由はどこにも残らなかった。
    const ledger = new PipelineRunLedger({
      db,
      scope: 'review_incremental',
      wave: 'memory',
      tier: 3,
      logger: silentLogger,
    });
    const runId = ledger.start('2026-08-05T00:00:00.000Z');

    ledger.finish('error', { items_failed: 2 }, 'boom: upstream unavailable');
    const row = readRun(db, runId);

    expect(row['status']).toBe('error');
    expect(row['error_detail']).toBe('boom: upstream unavailable');
  });

  it('fail() は Error の stack を error_detail へ残す', () => {
    const ledger = new PipelineRunLedger({
      db,
      scope: 'drift_detection',
      wave: 'memory',
      tier: 3,
      logger: silentLogger,
    });
    const runId = ledger.start('2026-08-05T00:00:00.000Z');

    const err = new Error('drift detector exploded');
    ledger.fail(err, { items_failed: 1 });
    const row = readRun(db, runId);

    expect(row['status']).toBe('error');
    expect(String(row['error_detail'])).toContain('drift detector exploded');
    expect(row['items_failed']).toBe(1);
  });

  it('fail() は Error 以外の throw 値も文字列として残す', () => {
    const ledger = new PipelineRunLedger({
      db,
      scope: 'drift_detection',
      wave: 'memory',
      tier: 3,
      logger: silentLogger,
    });
    // runId は start() の戻り値で受ける。finish()/fail() 後は currentRunId が
    // null に戻る仕様のため、確定後に getter から取ることはできない。
    const runId = ledger.start('2026-08-05T00:00:00.000Z');

    ledger.fail('plain string failure');
    const row = readRun(db, runId);

    expect(String(row['error_detail'])).toContain('plain string failure');
  });

  it('台帳の書き込み失敗は呼び出し元へ伝播させない（fail-open）', () => {
    // 台帳は補助機構であり、記録に失敗しても ingest 本体を止めない。
    const errors: string[] = [];
    const ledger = new PipelineRunLedger({
      db,
      scope: 'conversation_incremental',
      wave: 'memory',
      tier: 3,
      logger: { info: () => {}, error: (msg: string) => errors.push(msg) },
    });
    ledger.start('2026-08-05T00:00:00.000Z');

    db.run('DROP TABLE caravan_pipeline_runs');

    expect(() => ledger.heartbeat({ items_processed: 1 })).not.toThrow();
    expect(() => ledger.finish('success', {})).not.toThrow();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('start() 前の heartbeat / finish は無視される', () => {
    const ledger = new PipelineRunLedger({
      db,
      scope: 'conversation_incremental',
      wave: 'memory',
      tier: 3,
      logger: silentLogger,
    });

    expect(() => ledger.heartbeat({ items_processed: 1 })).not.toThrow();
    expect(() => ledger.finish('success', {})).not.toThrow();
    expect(ledger.runId).toBeNull();
  });

  it('appendLog() は run に紐づくログ行を書く', () => {
    const ledger = new PipelineRunLedger({
      db,
      scope: 'conversation_incremental',
      wave: 'memory',
      tier: 3,
      logger: silentLogger,
    });
    const runId = ledger.start('2026-08-05T00:00:00.000Z');

    ledger.appendLog(
      'warn',
      'conversation-ingest',
      'chunk skipped',
      { itemKey: 'thread-1', retryable: false },
      'Error: chunk skipped',
    );
    const rows = readRunLogs(db, runId);

    expect(rows).toHaveLength(1);
    expect(rows[0]['run_id']).toBe(runId);
    expect(rows[0]['level']).toBe('warn');
    expect(rows[0]['component']).toBe('conversation-ingest');
    expect(rows[0]['message']).toBe('chunk skipped');
    expect(JSON.parse(rows[0]['metadata'] as string)).toEqual({
      itemKey: 'thread-1',
      retryable: false,
    });
    expect(rows[0]['stack']).toBe('Error: chunk skipped');
  });

  it('appendLog() は metadata 省略時に NULL を書く', () => {
    const ledger = new PipelineRunLedger({
      db,
      scope: 'conversation_incremental',
      wave: 'memory',
      tier: 3,
      logger: silentLogger,
    });
    const runId = ledger.start('2026-08-05T00:00:00.000Z');

    ledger.appendLog('info', 'pipeline', 'started');
    const rows = readRunLogs(db, runId);

    expect(rows).toHaveLength(1);
    expect(rows[0]['metadata']).toBeNull();
    expect(rows[0]['stack']).toBeNull();
  });

  it('appendLog() は source 指定時に extension を書く', () => {
    const ledger = new PipelineRunLedger({
      db,
      scope: 'conversation_incremental',
      wave: 'memory',
      tier: 3,
      logger: silentLogger,
    });
    const runId = ledger.start('2026-08-05T00:00:00.000Z');

    ledger.appendLog('info', 'extension', 'posted from extension', undefined, null, 'extension');
    const rows = readRunLogs(db, runId);

    expect(rows).toHaveLength(1);
    expect(rows[0]['source']).toBe('extension');
  });

  it('start() 前の appendLog() は無視される', () => {
    const ledger = new PipelineRunLedger({
      db,
      scope: 'conversation_incremental',
      wave: 'memory',
      tier: 3,
      logger: silentLogger,
    });

    expect(() => ledger.appendLog('debug', 'pipeline', 'before start')).not.toThrow();
    expect(readRunLogs(db)).toHaveLength(0);
  });

  it('caravan_pipeline_runs の行を削除すると対応するログ行も削除される', () => {
    const ledger = new PipelineRunLedger({
      db,
      scope: 'conversation_incremental',
      wave: 'memory',
      tier: 3,
      logger: silentLogger,
    });
    const runId = ledger.start('2026-08-05T00:00:00.000Z');
    ledger.appendLog('info', 'pipeline', 'first');
    ledger.appendLog('error', 'pipeline', 'second');

    expect(readRunLogs(db, runId)).toHaveLength(2);
    db.run(`DELETE FROM caravan_pipeline_runs WHERE id = ?`, [runId]);

    expect(readRunLogs(db, runId)).toHaveLength(0);
  });

  it('appendLog() の書き込み失敗は呼び出し元へ伝播させない（fail-open）', () => {
    const errors: string[] = [];
    const ledger = new PipelineRunLedger({
      db,
      scope: 'conversation_incremental',
      wave: 'memory',
      tier: 3,
      logger: { info: () => {}, error: (msg: string) => errors.push(msg) },
    });
    ledger.start('2026-08-05T00:00:00.000Z');

    db.run('DROP TABLE caravan_pipeline_run_logs');

    expect(() => ledger.appendLog('error', 'pipeline', 'lost log')).not.toThrow();
    expect(errors.length).toBeGreaterThan(0);
  });
  it('finish() 後は run を指さず、二重 finish / heartbeat が既存行を書き換えない', () => {
    // リグレッション: finish() が currentRunId を保持したままだと、使い回された
    // インスタンスの二重 finish や finish 後の heartbeat が、確定済みの行を静かに
    // 再 UPDATE する。書き込みは fail-open で例外を出さないため状態側で塞ぐ。
    const ledger = new PipelineRunLedger({
      db,
      scope: 'conversation_incremental',
      wave: 'memory',
      tier: 3,
      logger: silentLogger,
    });
    const runId = ledger.start('2026-08-05T00:00:00.000Z');
    ledger.finish('success', { items_processed: 5 });

    expect(ledger.runId).toBeNull();

    ledger.finish('error', { items_processed: 999 }, 'should not be written');
    ledger.heartbeat({ items_processed: 999 });

    const row = readRun(db, runId);
    expect(row['status']).toBe('success');
    expect(row['items_processed']).toBe(5);
    expect(row['error_detail']).toBe('');
  });
});
