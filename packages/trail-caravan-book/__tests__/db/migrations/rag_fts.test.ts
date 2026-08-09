import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openCaravanBookDb } from '../../../src/db/connection';

const tmpDb = path.join(os.tmpdir(), `memory-test-rag-fts-${process.pid}-${Date.now()}.db`);

afterAll(() => {
  try {
    fs.unlinkSync(tmpDb);
  } catch (_) {
    // ignore
  }
});

describe('migration 013 (rag_fts)', () => {
  test('clean DB に 013 を適用すると FTS5 仮想テーブル 3 個が作成される', async () => {
    const { db, close } = await openCaravanBookDb(tmpDb);

    const result = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts' ORDER BY name",
    );
    const names = (result[0]?.values ?? []).map((r) => r[0] as string);
    expect(names).toEqual([
      'caravan_drift_events_fts',
      'caravan_entities_fts',
      'caravan_episodes_fts',
    ]);

    close();
  }, 30000);

  test('caravan_pipeline_state.scope に rag_fts_rebuild を INSERT できる', async () => {
    const { db, close } = await openCaravanBookDb(tmpDb);

    expect(() => {
      db.run(`INSERT OR REPLACE INTO caravan_pipeline_state(scope) VALUES ('rag_fts_rebuild')`);
    }).not.toThrow();

    const result = db.exec(
      `SELECT scope FROM caravan_pipeline_state WHERE scope = 'rag_fts_rebuild'`,
    );
    expect(result[0]?.values[0][0]).toBe('rag_fts_rebuild');

    close();
  }, 30000);

  test('PRAGMA integrity_check が ok を返す', async () => {
    const { db, close } = await openCaravanBookDb(tmpDb);

    const result = db.exec('PRAGMA integrity_check');
    expect(result[0]?.values[0][0]).toBe('ok');

    close();
  }, 30000);

  test('migration 013 が適用済みとして _migrations に記録される', async () => {
    const { db, close } = await openCaravanBookDb(tmpDb);

    const result = db.exec('SELECT version FROM _migrations WHERE version = 13');
    expect(result[0]?.values[0][0]).toBe(13);

    close();
  }, 30000);
});
