import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { buildEntityAliasesText } from '@anytime-markdown/trail-caravan-book';
import { CaravanApiHandler } from '../CaravanApiHandler';

const TS = '2026-08-10T00:00:00.000Z';

interface FixtureEntity {
  id: string;
  type: string;
  displayName: string;
  summary?: string;
  validUntil?: string;
}

function buildSearchDb(dbPath: string, opts?: { withFts?: boolean }): void {
  const withFts = opts?.withFts ?? true;
  const db = new BetterSqlite3(dbPath);
  db.exec(`CREATE TABLE caravan_entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    valid_until TEXT,
    first_seen_at TEXT NOT NULL,
    last_updated_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    UNIQUE (type, canonical_name)
  ) STRICT`);
  db.exec(`CREATE TABLE caravan_edges (
    id TEXT PRIMARY KEY,
    subject_entity_id TEXT NOT NULL,
    predicate TEXT NOT NULL,
    object_entity_id TEXT,
    object_literal TEXT,
    valid_from TEXT NOT NULL,
    valid_to TEXT,
    recorded_at TEXT NOT NULL
  ) STRICT`);
  db.exec(`CREATE TABLE caravan_edge_invalidations (
    id TEXT PRIMARY KEY,
    edge_id TEXT NOT NULL,
    invalidated_at TEXT NOT NULL,
    reason TEXT NOT NULL
  ) STRICT`);
  db.exec(`CREATE TABLE caravan_search_events (
    id TEXT PRIMARY KEY,
    occurred_at TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('search', 'ego_open', 'clear')),
    query TEXT NOT NULL,
    result_count INTEGER,
    entity_id TEXT
  ) STRICT`);
  if (withFts) {
    db.exec(`CREATE VIRTUAL TABLE caravan_entities_fts USING fts5(
      display_name, summary, aliases_text,
      content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2')`);
  }

  const entities: FixtureEntity[] = [
    { id: 'f1', type: 'File', displayName: 'packages/foo/useBlockAlignment.ts' },
    { id: 'f2', type: 'File', displayName: 'packages/foo/other.ts' },
    { id: 'c1', type: 'Concept', displayName: 'ブロック整列' },
    { id: 'w1', type: 'Concept', displayName: 'search' },
    { id: 'w2', type: 'Concept', displayName: 'searchEvents' },
    { id: 'low1', type: 'Bug', displayName: '不明のバグ' },
    { id: 'del1', type: 'File', displayName: 'useBlockAlignmentOld.ts', validUntil: TS },
    { id: 's1', type: 'File', displayName: 'seed.ts' },
    { id: 'n1', type: 'File', displayName: 'n1.ts' },
    { id: 'n2', type: 'File', displayName: 'n2.ts' },
    { id: 'n3', type: 'File', displayName: 'n3.ts' },
    { id: 'far1', type: 'File', displayName: 'far1.ts' },
  ];
  const insertEntity = db.prepare(
    `INSERT INTO caravan_entities (id, type, canonical_name, display_name, summary, valid_until, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertFts = withFts
    ? db.prepare(
        `INSERT INTO caravan_entities_fts (rowid, display_name, summary, aliases_text)
         VALUES ((SELECT rowid FROM caravan_entities WHERE id = ?), ?, ?, ?)`,
      )
    : null;
  for (const e of entities) {
    insertEntity.run(e.id, e.type, e.displayName, e.displayName, e.summary ?? '', e.validUntil ?? null, TS, TS, TS);
    insertFts?.run(e.id, e.displayName, e.summary ?? '', buildEntityAliasesText(e.displayName, e.displayName, null));
  }

  // ego 用: s1 -- n1, n2, n3（s1-n1 は 2 本）、n1 -- n2、far1 は n3 経由の 2 ホップ先
  const edge = db.prepare(
    `INSERT INTO caravan_edges (id, subject_entity_id, predicate, object_entity_id, object_literal, valid_from, valid_to, recorded_at)
     VALUES (?, ?, 'relates_to', ?, NULL, ?, NULL, ?)`,
  );
  edge.run('e1', 's1', 'n1', TS, TS);
  edge.run('e2', 'n1', 's1', TS, TS);
  edge.run('e3', 's1', 'n2', TS, TS);
  edge.run('e4', 's1', 'n3', TS, TS);
  edge.run('e5', 'n1', 'n2', TS, TS);
  edge.run('e6', 'n3', 'far1', TS, TS);
  db.close();
}

describe('CaravanApiHandler.searchKnowledgeGraph', () => {
  let tmpDir: string;
  let handler: CaravanApiHandler;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-search-test-'));
    const dbPath = path.join(tmpDir, 'caravan-book.db');
    buildSearchDb(dbPath);
    handler = new CaravanApiHandler(makeMockLogger(), dbPath);
  });

  afterEach(() => {
    handler.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('識別子クエリが FTS の分割トークンでヒットする', async () => {
    const result = await handler.searchKnowledgeGraph({ q: 'blockAlignment' });
    expect(result?.hits.map((h) => h.id)).toContain('f1');
  });

  it('トークン境界に乗らない部分文字列も LIKE アームでヒットする', async () => {
    const result = await handler.searchKnowledgeGraph({ q: 'lockAlign' });
    expect(result?.hits.map((h) => h.id)).toContain('f1');
  });

  it('完全一致が前方一致より先に並ぶ', async () => {
    const result = await handler.searchKnowledgeGraph({ q: 'search' });
    const ids = result?.hits.map((h) => h.id) ?? [];
    expect(ids.indexOf('w1')).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf('w2')).toBeGreaterThan(ids.indexOf('w1'));
  });

  it('日本語クエリが FTS でヒットする', async () => {
    const result = await handler.searchKnowledgeGraph({ q: 'ブロック整列' });
    expect(result?.hits.map((h) => h.id)).toContain('c1');
  });

  it('無名・低情報エンティティと soft delete 済みを返さない', async () => {
    const low = await handler.searchKnowledgeGraph({ q: '不明のバグ' });
    expect(low?.hits.map((h) => h.id)).not.toContain('low1');
    const del = await handler.searchKnowledgeGraph({ q: 'useBlockAlignmentOld' });
    expect(del?.hits.map((h) => h.id)).not.toContain('del1');
  });

  it('limit で切り truncated を立てる', async () => {
    // 'ts' は File 系に広くヒットする
    const result = await handler.searchKnowledgeGraph({ q: 'n1 n2 n3', limit: 1 });
    expect(result?.hits).toHaveLength(1);
    expect(result?.truncated).toBe(true);
  });

  it('FTS テーブルが無い DB でも LIKE アームで応答する', async () => {
    const noFtsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-search-nofts-'));
    const dbPath = path.join(noFtsDir, 'caravan-book.db');
    buildSearchDb(dbPath, { withFts: false });
    const noFts = new CaravanApiHandler(makeMockLogger(), dbPath);
    const result = await noFts.searchKnowledgeGraph({ q: 'useBlockAlignment' });
    expect(result?.hits.map((h) => h.id)).toContain('f1');
    noFts.dispose();
    fs.rmSync(noFtsDir, { recursive: true, force: true });
  });

  it('DB 未設定は null を返す', async () => {
    const missing = new CaravanApiHandler(makeMockLogger(), null);
    expect(await missing.searchKnowledgeGraph({ q: 'x' })).toBeNull();
    missing.dispose();
  });
});

describe('CaravanApiHandler.getKnowledgeGraph seed（ego サブグラフ）', () => {
  let tmpDir: string;
  let handler: CaravanApiHandler;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-ego-test-'));
    const dbPath = path.join(tmpDir, 'caravan-book.db');
    buildSearchDb(dbPath);
    handler = new CaravanApiHandler(makeMockLogger(), dbPath);
  });

  afterEach(() => {
    handler.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('seed の 1 ホップと隣接間エッジを返し、2 ホップ先は含めない', async () => {
    const result = await handler.getKnowledgeGraph({ seed: 's1' });
    const labels = result?.nodes.map((n) => n.label) ?? [];
    expect(labels).toEqual(expect.arrayContaining(['seed.ts', 'n1.ts', 'n2.ts', 'n3.ts']));
    expect(labels).not.toContain('far1.ts');
    // 隣接間エッジ n1-n2 も含む: s1-n1, s1-n2, s1-n3, n1-n2 の 4 ペア
    expect(result?.links).toHaveLength(4);
  });

  it('limit で隣接を多重度降順に切り truncated を立てる', async () => {
    const result = await handler.getKnowledgeGraph({ seed: 's1', limit: 2 });
    const labels = result?.nodes.map((n) => n.label) ?? [];
    // seed + 多重度最大の n1（2 本）だけが残る
    expect(labels).toEqual(expect.arrayContaining(['seed.ts', 'n1.ts']));
    expect(labels).toHaveLength(2);
    expect(result?.truncated).toBe(true);
  });

  it('実在しない seed は空グラフを返す', async () => {
    const result = await handler.getKnowledgeGraph({ seed: 'no-such-id' });
    expect(result?.nodes).toEqual([]);
    expect(result?.links).toEqual([]);
  });
});

describe('CaravanApiHandler.recordSearchEvent', () => {
  let tmpDir: string;
  let dbPath: string;
  let handler: CaravanApiHandler;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-events-test-'));
    dbPath = path.join(tmpDir, 'caravan-book.db');
    buildSearchDb(dbPath);
    handler = new CaravanApiHandler(makeMockLogger(), dbPath);
  });

  afterEach(() => {
    handler.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('search イベントを caravan_search_events へ記録する', async () => {
    const r = await handler.recordSearchEvent({ kind: 'search', query: 'blockAlignment', resultCount: 3 });
    expect(r.ok).toBe(true);
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(`SELECT kind, query, result_count, entity_id FROM caravan_search_events`).get() as Record<string, unknown>;
    db.close();
    expect(row).toMatchObject({ kind: 'search', query: 'blockAlignment', result_count: 3, entity_id: null });
  });

  it('ego_open は entity_id を持つ', async () => {
    const r = await handler.recordSearchEvent({ kind: 'ego_open', query: 'blockAlignment', entityId: 'f1' });
    expect(r.ok).toBe(true);
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(`SELECT kind, entity_id FROM caravan_search_events`).get() as Record<string, unknown>;
    db.close();
    expect(row).toMatchObject({ kind: 'ego_open', entity_id: 'f1' });
  });

  it('不正な kind は記録せず ok:false（throw しない）', async () => {
    const r = await handler.recordSearchEvent({ kind: 'bogus' as never, query: 'x' });
    expect(r.ok).toBe(false);
  });

  it('テーブルが無い旧 DB では ok:false で fail-open する', async () => {
    const oldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-events-old-'));
    const oldPath = path.join(oldDir, 'caravan-book.db');
    const db = new BetterSqlite3(oldPath);
    db.exec(`CREATE TABLE caravan_entities (id TEXT PRIMARY KEY) STRICT`);
    db.close();
    const old = new CaravanApiHandler(makeMockLogger(), oldPath);
    const r = await old.recordSearchEvent({ kind: 'search', query: 'x' });
    expect(r.ok).toBe(false);
    old.dispose();
    fs.rmSync(oldDir, { recursive: true, force: true });
  });
});
