import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import {
  CREATE_BOUNDARY_DRIFT_INDEXES,
  CREATE_BOUNDARY_DRIFT_RUNS,
  CREATE_BOUNDARY_DRIFT_WARNINGS,
} from '@anytime-markdown/trail-core';

import { handleListBoundaryDrift } from '../../tools/listBoundaryDrift';

const OLD_RUN = '2026-08-01T00:00:00.000Z';
const NEW_RUN = '2026-08-02T00:00:00.000Z';

/** workspacePath 直下に activity.db を持つ一時ワークスペースを作る。 */
function createWorkspace(): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-bd-'));
  const dbDir = path.join(ws, '.anytime', 'trail', 'db');
  fs.mkdirSync(dbDir, { recursive: true });
  const db = new BetterSqlite3(path.join(dbDir, 'activity.db'));
  try {
    db.exec(
      `CREATE TABLE repos (repo_id INTEGER PRIMARY KEY, repo_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)`,
    );
    db.exec(CREATE_BOUNDARY_DRIFT_WARNINGS);
    db.exec(CREATE_BOUNDARY_DRIFT_RUNS);
    for (const idx of CREATE_BOUNDARY_DRIFT_INDEXES) db.exec(idx);
    db.prepare('INSERT INTO repos (repo_id, repo_name, created_at) VALUES (1, ?, ?)').run(
      'anytime-markdown',
      NEW_RUN,
    );
    const insertRun = db.prepare(
      `INSERT INTO boundary_drift_runs (repo_id, detected_at, warning_count, node_count)
       VALUES (1, ?, 1, 100)`,
    );
    insertRun.run(OLD_RUN);
    insertRun.run(NEW_RUN);
    const insert = db.prepare(
      `INSERT INTO boundary_drift_warnings
         (repo_id, detected_at, kind, target_key, stable_key, span_count, dominance,
          community_count, node_count, severity, breakdown_json)
       VALUES (1, ?, 'boundary_spanning', ?, 'k', 3, 0.4, NULL, 10, ?, '[]')`,
    );
    insert.run(OLD_RUN, '99', 9);
    insert.run(NEW_RUN, '3', 1.5);
  } finally {
    db.close();
  }
  return ws;
}

describe('handleListBoundaryDrift', () => {
  let ws: string;

  beforeEach(() => {
    ws = createWorkspace();
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it('既定では最新の検出回だけを返す', async () => {
    const result = await handleListBoundaryDrift({ workspacePath: ws });

    expect(result.detectedAt).toBe(NEW_RUN);
    expect(result.warnings.map((w) => w.target)).toEqual(['3']);
  });

  it('includeHistory=true で過去の検出回も返す（latestOnly の反転を取り違えない）', async () => {
    const result = await handleListBoundaryDrift({ workspacePath: ws, includeHistory: true });

    expect(result.warnings.map((w) => w.target)).toEqual(['99', '3']);
  });

  it('activity.db が無ければ理由付きで失敗する（空結果と取り違えない）', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-bd-empty-'));
    try {
      await expect(handleListBoundaryDrift({ workspacePath: empty })).rejects.toThrow(
        /activity\.db not found/,
      );
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});
