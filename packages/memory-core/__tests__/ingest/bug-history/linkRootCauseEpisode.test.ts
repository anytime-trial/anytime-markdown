import { linkRootCauseEpisode } from '../../../src/ingest/bug-history/linkRootCauseEpisode';
import { entityId } from '../../../src/canonical/entityId';
import { noopLogger } from '../../../src/logger';
import { openMemoryCoreDb } from '../../../src/db/connection';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

function makeTmpDb(): string {
  return path.join(os.tmpdir(), `lrce-test-${process.pid}-${Date.now()}.db`);
}

async function openTestDb() {
  const tmpPath = makeTmpDb();
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

function insertEpisode(db: ReturnType<typeof require>['db'] | any, id: string, sessionId: string, validFrom: string) {
  db.run(
    `INSERT INTO memory_episodes
       (id, session_id, message_uuid_start, message_uuid_end,
        agent_runtime, model, valid_from, recorded_at, raw_excerpt)
     VALUES (?, ?, 'msg1', 'msg2', 'claude_code', 'test', ?, '2026-01-01T00:00:00.000Z', '')`,
    [id, sessionId, validFrom]
  );
}

function insertBugFix(db: any, id: string) {
  // Insert required entities first
  const bugId = entityId('Bug', 'sha999');
  db.run(
    `INSERT OR IGNORE INTO memory_entities
       (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Bug', 'sha999', 'test bug', '[]', '[]', '{}',
             '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    [bugId]
  );
  db.run(
    `INSERT INTO memory_bug_fixes
       (id, commit_sha, bug_entity_id, package, category, subject_summary,
        committed_at, recorded_at)
     VALUES (?, 'sha999', ?, 'web-app', 'regression', 'test',
             '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')`,
    [id, bugId]
  );
}

describe('linkRootCauseEpisode', () => {
  test('session with 3 episodes → episode immediately before committedAt is chosen', async () => {
    const { db, close } = await openTestDb();

    insertEpisode(db, 'ep1', 'sess1', '2026-05-01T00:00:00.000Z');
    insertEpisode(db, 'ep2', 'sess1', '2026-05-15T00:00:00.000Z');
    insertEpisode(db, 'ep3', 'sess1', '2026-06-05T00:00:00.000Z');

    const bugFixId = entityId('BugFix', 'sha999');
    insertBugFix(db, bugFixId);

    // committed_at = 2026-06-01, so episodes up to that time: ep1, ep2 → ep2 is latest
    const result = linkRootCauseEpisode({
      db,
      bugFixId,
      sessionId: 'sess1',
      committedAt: '2026-06-01T00:00:00.000Z',
      logger: noopLogger,
    });

    expect(result.root_cause_episode_id).toBe('ep2');

    // Verify the DB was updated
    const updated = db.exec(`SELECT root_cause_episode_id FROM memory_bug_fixes WHERE id = ?`, [bugFixId]);
    expect(updated[0].values[0][0]).toBe('ep2');

    close();
  }, 30000);

  test('session with 0 episodes → null', async () => {
    const { db, close } = await openTestDb();

    const bugFixId = entityId('BugFix', 'sha999');
    insertBugFix(db, bugFixId);

    const result = linkRootCauseEpisode({
      db,
      bugFixId,
      sessionId: 'sess_empty',
      committedAt: '2026-06-01T00:00:00.000Z',
      logger: noopLogger,
    });

    expect(result.root_cause_episode_id).toBeNull();

    close();
  }, 30000);

  test('sessionId=null → null (short-circuit)', async () => {
    const { db, close } = await openTestDb();

    const result = linkRootCauseEpisode({
      db,
      bugFixId: 'irrelevant',
      sessionId: null,
      committedAt: '2026-06-01T00:00:00.000Z',
      logger: noopLogger,
    });

    expect(result.root_cause_episode_id).toBeNull();

    close();
  }, 30000);
});
