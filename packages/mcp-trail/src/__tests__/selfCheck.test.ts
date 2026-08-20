import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';

import { runStartupDbSelfCheck } from '../selfCheck';

function seedDb(dbPath: string): void {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new BetterSqlite3(dbPath);
  db.exec('CREATE TABLE probe (id INTEGER PRIMARY KEY)');
  db.close();
}

describe('runStartupDbSelfCheck', () => {
  let workspacePath: string;
  let dbDir: string;
  let logs: string[];
  const savedTrailHome = process.env.TRAIL_HOME;

  beforeEach(() => {
    delete process.env.TRAIL_HOME;
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-trail-selfcheck-'));
    dbDir = path.join(workspacePath, '.anytime', 'trail', 'db');
    logs = [];
  });

  afterEach(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
    if (savedTrailHome === undefined) delete process.env.TRAIL_HOME;
    else process.env.TRAIL_HOME = savedTrailHome;
  });

  it('stays quiet when both DBs open', async () => {
    seedDb(path.join(dbDir, 'activity.db'));
    seedDb(path.join(dbDir, 'caravan-book.db'));

    const result = await runStartupDbSelfCheck({ workspacePath, log: (m) => logs.push(m) });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(logs).toEqual([]);
  });

  it('warns per DB but stays ok when only one DB is missing', async () => {
    seedDb(path.join(dbDir, 'activity.db'));

    const result = await runStartupDbSelfCheck({ workspacePath, log: (m) => logs.push(m) });

    expect(result.ok).toBe(true);
    expect(result.failures.map((f) => f.db)).toEqual(['caravan-book.db']);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('caravan-book.db');
  });

  it('reports that every DB-backed tool will fail when no DB opens', async () => {
    const result = await runStartupDbSelfCheck({ workspacePath, log: (m) => logs.push(m) });

    expect(result.ok).toBe(false);
    expect(result.failures.map((f) => f.db)).toEqual(['caravan-book.db', 'activity.db']);
    // 個々のツールが 1 行のエラーを返すだけでは「全滅」が見えない、というのが本修正の主旨。
    const summary = logs.join('\n');
    expect(summary).toContain('DB を 1 つも開けません');
    expect(summary).toContain('すべて失敗します');
  });

  it('never throws (a broken self-check must not stop the server from starting)', async () => {
    await expect(
      runStartupDbSelfCheck({ workspacePath: path.join(workspacePath, 'nope'), log: () => {} }),
    ).resolves.toMatchObject({ ok: false });
  });
});
