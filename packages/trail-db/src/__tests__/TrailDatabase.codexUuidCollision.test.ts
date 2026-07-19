/**
 * Regression — Codex セッション間の message uuid 衝突
 *
 * Codex の正規化は uuid を `codex-${seq}` で採番し、seq をセッションごとに 0 から振り直していた。
 * `messages.uuid` は全セッション横断の PRIMARY KEY で、INSERT は `INSERT OR REPLACE` のため、
 * 2 件目以降の Codex セッションが 1 件目の行を上書きして奪い、実データが消えていた
 * （実測: 243 セッション中 23 件しか messages を保持できていなかった）。
 *
 * 本テストは「複数の Codex セッションを取り込んでも各々の messages が残る」ことを固定する。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { codexMessageUuid } from '../codexMessageUuid';
import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';

type RawDb = {
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ values: unknown[][] }>;
};

function inner(db: TrailDatabase): RawDb {
  return (db as unknown as { db: RawDb }).db;
}

function countMessages(db: TrailDatabase, sessionId: string): number {
  const rows = inner(db).exec('SELECT COUNT(*) FROM messages WHERE session_id = ?', [sessionId]);
  return Number(rows[0]?.values[0]?.[0] ?? 0);
}

/**
 * Codex の rollout JSONL を最小構成で書き出す。
 * session_meta → user message → assistant message → token_count の順は実ファイルに合わせている。
 */
function writeCodexRollout(dir: string, sessionId: string, turns: number): string {
  const filePath = path.join(dir, `rollout-2026-07-19T00-00-00-${sessionId}.jsonl`);
  const records: unknown[] = [
    {
      timestamp: '2026-07-19T00:00:00.000Z',
      type: 'session_meta',
      payload: { id: sessionId, cli_version: '0.50.0' },
    },
  ];
  for (let i = 0; i < turns; i++) {
    records.push({
      timestamp: '2026-07-19T00:00:01.000Z',
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `q${i}` }] },
    });
    records.push({
      timestamp: '2026-07-19T00:00:02.000Z',
      type: 'event_msg',
      payload: { type: 'agent_message', message: `a${i}`, phase: 'final' },
    });
    records.push({
      timestamp: '2026-07-19T00:00:03.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 10,
            output_tokens: 20,
            reasoning_output_tokens: 0,
            total_tokens: 120,
          },
        },
      },
    });
  }
  fs.writeFileSync(filePath, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
  return filePath;
}

describe('Codex message uuid collision (regression)', () => {
  let dir: string;
  let db: TrailDatabase;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-uuid-'));
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const sidA = '019f0000-0000-7000-8000-00000000000a';
  const sidB = '019f0000-0000-7000-8000-00000000000b';

  it('2 つの Codex セッションを取り込んでも双方の messages が残る', () => {
    const fileA = writeCodexRollout(dir, sidA, 3);
    const fileB = writeCodexRollout(dir, sidB, 3);

    db.importSession(fileA, 'test-repo');
    db.importSession(fileB, 'test-repo');

    // 修正前: B の取り込みが A の行を uuid 衝突で上書きし、A が 0 件になる。
    expect(countMessages(db, sidA)).toBeGreaterThan(0);
    expect(countMessages(db, sidB)).toBeGreaterThan(0);
  });

  it('後続セッションが先行セッションの行数を減らさない', () => {
    const fileA = writeCodexRollout(dir, sidA, 5);
    db.importSession(fileA, 'test-repo');
    const before = countMessages(db, sidA);

    const fileB = writeCodexRollout(dir, sidB, 5);
    db.importSession(fileB, 'test-repo');

    expect(countMessages(db, sidA)).toBe(before);
  });

  it('セッションごとに uuid が一意で、他セッションと重複しない', () => {
    db.importSession(writeCodexRollout(dir, sidA, 4), 'test-repo');
    db.importSession(writeCodexRollout(dir, sidB, 4), 'test-repo');

    const rows = inner(db).exec(
      'SELECT COUNT(*), COUNT(DISTINCT uuid) FROM messages WHERE session_id IN (?, ?)',
      [sidA, sidB],
    );
    const total = Number(rows[0]?.values[0]?.[0] ?? 0);
    const distinct = Number(rows[0]?.values[0]?.[1] ?? 0);
    expect(total).toBe(distinct);
  });

  describe('migrateCodexMessageUuidScheme', () => {
    function runMigration(target: TrailDatabase): void {
      const self = target as unknown as {
        migrateCodexMessageUuidScheme: (db: unknown) => void;
        ensureDb: () => unknown;
        db: unknown;
      };
      self.migrateCodexMessageUuidScheme(self.db);
    }

    function seedLegacyRow(target: TrailDatabase, sessionId: string, uuid: string): void {
      const raw = target as unknown as { db: { run: (sql: string, params?: unknown[]) => void } };
      raw.db.run(
        `INSERT OR REPLACE INTO sessions (id, slug, repo_id, version, entrypoint, model,
           start_time, end_time, message_count, file_path, file_size, imported_at, source)
         VALUES (?, '', 1, '', '', '', '2026-07-19T00:00:00.000Z', '2026-07-19T00:00:01.000Z',
                 1, ?, 1, '2026-07-19T00:00:02.000Z', 'codex')`,
        [sessionId, `/tmp/${sessionId}.jsonl`],
      );
      raw.db.run(
        `INSERT OR REPLACE INTO messages (uuid, session_id, type, timestamp, input_tokens)
         VALUES (?, ?, 'assistant', '2026-07-19T00:00:01.000Z', 42)`,
        [uuid, sessionId],
      );
    }

    it('旧採番 codex-<seq> の行だけを削除し、新採番の行は残す', () => {
      seedLegacyRow(db, sidA, 'codex-0');
      seedLegacyRow(db, sidB, codexMessageUuid(sidB, 0));

      runMigration(db);

      expect(countMessages(db, sidA)).toBe(0);
      expect(countMessages(db, sidB)).toBe(1);
    });

    it('旧行に紐づく message_commits も削除する', () => {
      seedLegacyRow(db, sidA, 'codex-0');
      const raw = db as unknown as { db: { run: (sql: string, params?: unknown[]) => void } };
      raw.db.run(
        `INSERT OR REPLACE INTO message_commits
           (message_uuid, session_id, commit_hash, detected_at, match_confidence)
         VALUES ('codex-0', ?, 'abc1234', '2026-07-19T00:00:03.000Z', 'high')`,
        [sidA],
      );

      runMigration(db);

      const rows = inner(db).exec(
        "SELECT COUNT(*) FROM message_commits WHERE message_uuid = 'codex-0'",
      );
      expect(Number(rows[0]?.values[0]?.[0] ?? 0)).toBe(0);
    });

    it('冪等 — 2 回流しても壊れない', () => {
      seedLegacyRow(db, sidA, 'codex-0');
      runMigration(db);
      expect(() => runMigration(db)).not.toThrow();
      expect(countMessages(db, sidA)).toBe(0);
    });
  });

  it('token_count 由来のトークンが各セッションに保持される', () => {
    db.importSession(writeCodexRollout(dir, sidA, 3), 'test-repo');
    db.importSession(writeCodexRollout(dir, sidB, 3), 'test-repo');

    for (const sid of [sidA, sidB]) {
      const rows = inner(db).exec(
        'SELECT SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens) FROM messages WHERE session_id = ?',
        [sid],
      );
      expect(Number(rows[0]?.values[0]?.[0] ?? 0)).toBeGreaterThan(0);
    }
  });
});
