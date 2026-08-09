import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDocDb } from '../db/open';
import { MIGRATIONS } from '../db/migrations/migrations';
import { searchFts } from '../retrieve/fts';

/**
 * v5（テーブル接頭辞 catalog_ 移行）。レガシー DB（v1〜v4 適用済み・データ入り）を直接構築し、
 * openDocDb が v5 を適用してデータ温存のまま改名することを検証する。
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-catalog-prefix-'));

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function buildLegacyDb(file: string): void {
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT');
  for (const m of MIGRATIONS.filter((x) => x.version <= 4)) {
    if (!m.sql) throw new Error(`v${m.version} is not a raw-sql migration`);
    db.exec(m.sql);
    db.prepare('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)').run(m.version, '2026-08-08T00:00:00Z');
  }
  db.prepare(
    `INSERT INTO doc (path, title, category, type, lang, excerpt, content_hash, updated_at)
     VALUES ('spec/a.ja.md', '接頭辞移行ガイド', 'trail', 'spec', 'ja', '移行の抜粋', 'h1', '2026-08-08T00:00:00Z')`,
  ).run();
  db.prepare(
    `INSERT INTO doc_fts (path, title, excerpt, body) VALUES ('spec/a.ja.md', '接頭辞移行ガイド', '移行の抜粋', 'テーブル接頭辞を catalog へ揃える本文')`,
  ).run();
  db.close();
}

describe('migration v5 (table prefix)', () => {
  test('レガシー DB のデータを温存したまま catalog_ 接頭辞へ改名する', () => {
    const file = path.join(tmpDir, 'legacy.db');
    buildLegacyDb(file);
    const db = openDocDb(file);

    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);

    for (const legacy of ['doc', 'doc_relation', 'doc_embedding', 'doc_fts', 'doc_section_fts', 'doc_section_embedding']) {
      expect(names).not.toContain(legacy);
    }
    expect(names).toEqual(expect.arrayContaining([
      'catalog_doc',
      'catalog_doc_relation',
      'catalog_doc_embedding',
      'catalog_doc_fts',
      'catalog_doc_section_fts',
      'catalog_doc_section_embedding',
    ]));

    // データ温存（contentful FTS は rename で中身ごと移る）
    const row = db.prepare("SELECT title FROM catalog_doc WHERE path = 'spec/a.ja.md'").get() as { title: string };
    expect(row.title).toBe('接頭辞移行ガイド');
    const hits = searchFts(db, '接頭辞移行', 5);
    expect(hits.map((h) => h.path)).toContain('spec/a.ja.md');

    expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    db.close();
  });

  test('新規 DB（全 migration 一括適用）でも同じ最終状態に収束する', () => {
    const db = openDocDb(path.join(tmpDir, 'fresh.db'));
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(names).toContain('catalog_doc');
    expect(names.filter((n) => /^doc(_|$)/.test(n))).toEqual([]);
    db.close();
  });
});
