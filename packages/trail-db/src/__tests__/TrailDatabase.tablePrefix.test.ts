// テーブル名接頭辞移行（activity_ 前置・2026-08-08）。旧名テーブルが残る activity.db を
// 開くと、データ温存のまま新名へ改名され、旧 VIEW は新名 VIEW へ引き継がれることを検証する。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openBetterSqlite3 } from '../internal/loadBetterSqlite3';
import { createFileBackedTestDb } from './support/createTestDb';

describe('TrailDatabase table prefix migration', () => {
  let tempDir: string;
  let dbDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-table-prefix-'));
    dbDir = path.join(tempDir, 'db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('旧名テーブルが残る DB を開くとデータ温存のまま activity_ へ改名される', async () => {
    // 1) 現行スキーマで DB を作る
    const first = await createFileBackedTestDb(dbDir);
    first.close();

    // 2) 旧世代を再現: 一部テーブルをレガシー名へ戻し、行を仕込み、旧 VIEW を旧名テーブルで作る
    const raw = openBetterSqlite3(path.join(dbDir, 'activity.db'));
    raw.exec('ALTER TABLE activity_sessions RENAME TO sessions');
    raw.exec('ALTER TABLE activity_repos RENAME TO repos');
    raw.exec('DROP VIEW IF EXISTS activity_skill_models_resolved');
    raw.exec('ALTER TABLE activity_skill_models RENAME TO skill_models');
    raw.exec(`CREATE VIEW skill_models_resolved AS SELECT skill, recommended_model FROM skill_models`);
    raw
      .prepare(
        `INSERT INTO sessions (id, start_time) VALUES ('sess-legacy', '2026-08-08T00:00:00.000Z')`,
      )
      .run();
    raw.close();

    // 3) 再 open → 改名が走り、旧名の残存ゼロ・データ温存・VIEW 引き継ぎ
    const second = await createFileBackedTestDb(dbDir);
    second.close();

    const check = openBetterSqlite3(path.join(dbDir, 'activity.db'), { readonly: true });
    try {
      const names = (
        check
          .prepare(`SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'`)
          .all() as Array<{ name: string }>
      ).map((r) => r.name);
      expect(names).not.toContain('sessions');
      expect(names).not.toContain('repos');
      expect(names).not.toContain('skill_models');
      expect(names).not.toContain('skill_models_resolved');
      expect(names).toContain('activity_sessions');
      expect(names).toContain('activity_skill_models_resolved');

      const row = check
        .prepare(`SELECT id FROM activity_sessions WHERE id = 'sess-legacy'`)
        .get() as { id: string } | undefined;
      expect(row?.id).toBe('sess-legacy');
    } finally {
      check.close();
    }
  });
});
