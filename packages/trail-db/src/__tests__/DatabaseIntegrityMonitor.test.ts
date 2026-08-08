import BetterSqlite3 from 'better-sqlite3';

import { DatabaseIntegrityMonitor } from '../DatabaseIntegrityMonitor';
import { SqlJsCompatDatabase } from '../internal/SqlJsCompatDatabase';

describe('DatabaseIntegrityMonitor', () => {
  const createDb = (): SqlJsCompatDatabase => {
    const inner = new BetterSqlite3(':memory:');
    const db = new SqlJsCompatDatabase(inner);
    db.run('CREATE TABLE activity_sessions (id TEXT PRIMARY KEY)');
    db.run('CREATE TABLE activity_messages (id TEXT PRIMARY KEY)');
    return db;
  };

  const insertRows = (db: SqlJsCompatDatabase, table: string, count: number): void => {
    for (let i = 0; i < count; i += 1) {
      db.run(`INSERT INTO ${table} VALUES ('${table}_${i}')`);
    }
  };

  it('初回呼び出しは比較対象がなく空配列を返す', () => {
    const db = createDb();
    insertRows(db, 'activity_sessions', 100);
    const monitor = new DatabaseIntegrityMonitor();
    const alerts = monitor.recordAndDetect(db);
    expect(alerts).toEqual([]);
    db.close();
  });

  it('10%以上減少した場合に alert を返す', () => {
    const db = createDb();
    insertRows(db, 'activity_sessions', 100);
    const monitor = new DatabaseIntegrityMonitor({ alertLossRate: 0.1, alertAbsoluteLoss: 1000 });
    monitor.recordAndDetect(db);

    db.run("DELETE FROM activity_sessions WHERE id IN ('activity_sessions_0', 'activity_sessions_1', 'activity_sessions_2', 'activity_sessions_3', 'activity_sessions_4', 'activity_sessions_5', 'activity_sessions_6', 'activity_sessions_7', 'activity_sessions_8', 'activity_sessions_9', 'activity_sessions_10', 'activity_sessions_11')");
    const alerts = monitor.recordAndDetect(db);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].table).toBe('activity_sessions');
    expect(alerts[0].previous).toBe(100);
    expect(alerts[0].current).toBe(88);
    expect(alerts[0].lossRate).toBeCloseTo(0.12);
    db.close();
  });

  it('減少が閾値未満なら alert を返さない', () => {
    const db = createDb();
    insertRows(db, 'activity_sessions', 100);
    const monitor = new DatabaseIntegrityMonitor({ alertLossRate: 0.2, alertAbsoluteLoss: 1000 });
    monitor.recordAndDetect(db);

    db.run("DELETE FROM activity_sessions WHERE id = 'activity_sessions_0'");
    const alerts = monitor.recordAndDetect(db);

    expect(alerts).toEqual([]);
    db.close();
  });

  it('絶対減少数が閾値を超えれば alert を返す（小規模テーブルでも検出）', () => {
    const db = createDb();
    insertRows(db, 'activity_sessions', 60);
    const monitor = new DatabaseIntegrityMonitor({ alertLossRate: 0.99, alertAbsoluteLoss: 50 });
    monitor.recordAndDetect(db);

    db.run("DELETE FROM activity_sessions WHERE id LIKE 'activity_sessions_%'");
    const alerts = monitor.recordAndDetect(db);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].previous).toBe(60);
    expect(alerts[0].current).toBe(0);
    db.close();
  });

  it('増加した場合は alert を返さない', () => {
    const db = createDb();
    insertRows(db, 'activity_sessions', 10);
    const monitor = new DatabaseIntegrityMonitor();
    monitor.recordAndDetect(db);

    for (let i = 10; i < 20; i += 1) {
      db.run(`INSERT INTO activity_sessions VALUES ('sessions_${i}')`);
    }
    const alerts = monitor.recordAndDetect(db);

    expect(alerts).toEqual([]);
    db.close();
  });

  it('未作成テーブルは 0 として扱い warning ループを起こさない', () => {
    const db = createDb();
    // activity_current_graphs / activity_c4_manual_elements / activity_c4_manual_relationships は作成しない
    const monitor = new DatabaseIntegrityMonitor();
    const snapshot = monitor.captureCounts(db);
    expect(snapshot.activity_current_graphs).toBe(0);
    expect(snapshot.activity_c4_manual_elements).toBe(0);
    db.close();
  });
});
