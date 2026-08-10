import { BetterSqlite3CaravanDb } from '../../db/connection/BetterSqlite3CaravanDb';
import { runMigrations } from '../../db/migrations/runner';
import { buildEntityAliasesText, upsertEntityFts } from '../ftsSync';
import { tokenizeForFts5 } from '../tokenizeForFts5';

function insertEntity(
  db: BetterSqlite3CaravanDb,
  id: string,
  displayName: string,
  canonicalName: string,
): void {
  db.run(
    `INSERT INTO caravan_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'File', ?, ?, '2026-08-10T00:00:00Z', '2026-08-10T00:00:00Z', '2026-08-10T00:00:00Z')`,
    [id, canonicalName, displayName],
  );
}

function ftsHitIds(db: BetterSqlite3CaravanDb, rawQuery: string): string[] {
  const match = tokenizeForFts5(rawQuery);
  const r = db.exec(
    `SELECT e.id FROM caravan_entities_fts f
       JOIN caravan_entities e ON e.rowid = f.rowid
      WHERE caravan_entities_fts MATCH ?
      ORDER BY bm25(caravan_entities_fts) ASC`,
    [match],
  );
  return (r[0]?.values ?? []).map((row) => row[0] as string);
}

describe('buildEntityAliasesText', () => {
  it('aliases と識別子サブトークンを結合する', () => {
    const text = buildEntityAliasesText(
      'packages/foo/useBlockAlignment.ts',
      'anytime-markdown:packages/foo/useBlockAlignment.ts',
      '["別名A"]',
    );
    expect(text).toContain('別名A');
    expect(text).toContain('block');
    expect(text).toContain('alignment');
  });

  it('分割の重複は 1 回に畳む', () => {
    const text = buildEntityAliasesText('searchEvents', 'searchEvents', null);
    expect(text.split(' ').filter((t) => t === 'search')).toHaveLength(1);
  });

  it('全て空なら空文字を返す', () => {
    expect(buildEntityAliasesText('', '', null)).toBe('');
  });
});

describe('識別子クエリの FTS 到達（B1・索引側 + クエリ側 + migration 030）', () => {
  let db: BetterSqlite3CaravanDb;

  beforeEach(() => {
    db = BetterSqlite3CaravanDb.openInCaravan();
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('upsertEntityFts 経由: 部分識別子 blockAlignment で useBlockAlignment.ts がヒットする', () => {
    insertEntity(db, 'e1', 'packages/foo/useBlockAlignment.ts', 'packages/foo/useBlockAlignment.ts');
    upsertEntityFts(db, 'e1');
    expect(ftsHitIds(db, 'blockAlignment')).toContain('e1');
  });

  it('migration 030 の再構築: 旧契約で索引済みの行も分割トークンでヒットする', () => {
    // migration 適用済み DB へ旧契約（分割なし）の FTS 行を作る
    insertEntity(db, 'e2', 'CaravanApiHandler.ts', 'CaravanApiHandler.ts');
    const rowid = db.exec(`SELECT rowid FROM caravan_entities WHERE id = 'e2'`)[0]!.values[0]![0];
    db.run(
      `INSERT INTO caravan_entities_fts (rowid, display_name, summary, aliases_text)
       VALUES (?, 'CaravanApiHandler.ts', '', '')`,
      [rowid],
    );
    expect(ftsHitIds(db, 'ApiHandler')).toEqual([]);
    // 030 を単体で再実行（冪等: DROP → CREATE → 全再投入）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyFtsIdentifierTokens } = require('../../db/migrations/030_fts_identifier_tokens');
    applyFtsIdentifierTokens(db);
    expect(ftsHitIds(db, 'ApiHandler')).toContain('e2');
  });

  it('caravan_search_events（migration 031）が定義され kind CHECK が効く', () => {
    db.run(
      `INSERT INTO caravan_search_events (id, occurred_at, kind, query, result_count)
       VALUES ('s1', '2026-08-10T00:00:00Z', 'search', 'blockAlignment', 3)`,
      [],
    );
    expect(
      db.exec(`SELECT COUNT(*) FROM caravan_search_events`)[0]!.values[0]![0],
    ).toBe(1);
    expect(() =>
      db.run(
        `INSERT INTO caravan_search_events (id, occurred_at, kind, query)
         VALUES ('s2', '2026-08-10T00:00:00Z', 'bogus', 'x')`,
        [],
      ),
    ).toThrow();
  });
});
