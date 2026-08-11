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
  // migration 032 適用後の形状（source / origin / hit_entity_ids）
  db.exec(`CREATE TABLE caravan_search_events (
    id TEXT PRIMARY KEY,
    occurred_at TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('search', 'ego_open', 'clear')),
    query TEXT NOT NULL,
    result_count INTEGER,
    entity_id TEXT,
    source TEXT NOT NULL DEFAULT 'screen' CHECK (source IN ('screen', 'agent')),
    origin TEXT CHECK (origin IS NULL OR origin IN ('search', 'citation', 'agent_history')),
    hit_entity_ids TEXT CHECK (hit_entity_ids IS NULL OR json_valid(hit_entity_ids))
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

  it('全体・ego とも nodes が実体 id を持つ（引用・照会ヒットの解決に使う。screen spec §2.5）', async () => {
    const full = await handler.getKnowledgeGraph({});
    expect(full?.nodes.length).toBeGreaterThan(0);
    for (const node of full?.nodes ?? []) expect(typeof node.id).toBe('string');
    const ego = await handler.getKnowledgeGraph({ seed: 's1' });
    expect(ego?.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['s1', 'n1']));
  });
});

describe('CaravanApiHandler.getAgentSearches', () => {
  let tmpDir: string;
  let dbPath: string;
  let handler: CaravanApiHandler;

  function insertEvent(row: {
    id: string;
    occurredAt: string;
    kind?: string;
    query?: string;
    source?: string;
    hitEntityIds?: string | null;
  }): void {
    const db = new BetterSqlite3(dbPath);
    db.prepare(
      `INSERT INTO caravan_search_events (id, occurred_at, kind, query, result_count, source, hit_entity_ids)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    ).run(
      row.id,
      row.occurredAt,
      row.kind ?? 'search',
      row.query ?? 'q',
      row.source ?? 'agent',
      row.hitEntityIds === undefined ? null : row.hitEntityIds,
    );
    db.close();
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-agent-searches-'));
    dbPath = path.join(tmpDir, 'caravan-book.db');
    buildSearchDb(dbPath);
    handler = new CaravanApiHandler(makeMockLogger(), dbPath);
  });

  afterEach(() => {
    handler.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('agent 照会を新しい順に返し、ヒットを label / type へ解決する', async () => {
    insertEvent({ id: 'q1', occurredAt: '2026-08-10T01:00:00.000Z', query: 'block', hitEntityIds: JSON.stringify(['f1', 'c1']) });
    insertEvent({ id: 'q2', occurredAt: '2026-08-10T02:00:00.000Z', query: 'seed', hitEntityIds: JSON.stringify(['s1']) });
    const result = await handler.getAgentSearches({});
    expect(result?.queries.map((q) => q.query)).toEqual(['seed', 'block']);
    expect(result?.queries[1]?.hits).toEqual([
      { id: 'f1', label: 'packages/foo/useBlockAlignment.ts', type: 'File' },
      { id: 'c1', label: 'ブロック整列', type: 'Concept' },
    ]);
  });

  it('screen の検索イベントと kind!=search を含めない', async () => {
    insertEvent({ id: 'sc1', occurredAt: '2026-08-10T01:00:00.000Z', source: 'screen' });
    insertEvent({ id: 'eg1', occurredAt: '2026-08-10T02:00:00.000Z', kind: 'ego_open' });
    const result = await handler.getAgentSearches({});
    expect(result?.queries).toEqual([]);
  });

  it('soft delete 済みのヒットは除外し、全滅した照会も 0 ヒットで返す', async () => {
    insertEvent({ id: 'q1', occurredAt: '2026-08-10T01:00:00.000Z', hitEntityIds: JSON.stringify(['del1', 'f1']) });
    insertEvent({ id: 'q2', occurredAt: '2026-08-10T02:00:00.000Z', hitEntityIds: JSON.stringify(['del1']) });
    const result = await handler.getAgentSearches({});
    expect(result?.queries[1]?.hits.map((h) => h.id)).toEqual(['f1']);
    expect(result?.queries[0]?.hits).toEqual([]);
  });

  it('limit で件数を絞る（clamp 1〜50）', async () => {
    for (let i = 0; i < 5; i += 1) {
      insertEvent({ id: `q${i}`, occurredAt: `2026-08-10T0${i}:00:00.000Z` });
    }
    const result = await handler.getAgentSearches({ limit: 2 });
    expect(result?.queries).toHaveLength(2);
  });

  it('032 未適用（source 列なし）の旧 DB では空リストへ縮退する', async () => {
    const oldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-agent-old-'));
    const oldPath = path.join(oldDir, 'caravan-book.db');
    const db = new BetterSqlite3(oldPath);
    db.exec(`CREATE TABLE caravan_entities (id TEXT PRIMARY KEY, type TEXT NOT NULL, display_name TEXT NOT NULL, valid_until TEXT) STRICT`);
    db.exec(`CREATE TABLE caravan_search_events (
      id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, kind TEXT NOT NULL, query TEXT NOT NULL,
      result_count INTEGER, entity_id TEXT
    ) STRICT`);
    db.close();
    const old = new CaravanApiHandler(makeMockLogger(), oldPath);
    const result = await old.getAgentSearches({});
    expect(result?.queries).toEqual([]);
    old.dispose();
    fs.rmSync(oldDir, { recursive: true, force: true });
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

  it('origin（起点動線）を記録する（screen spec §3.6）', async () => {
    const r = await handler.recordSearchEvent({ kind: 'ego_open', query: '', entityId: 'f1', origin: 'citation' });
    expect(r.ok).toBe(true);
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(`SELECT origin FROM caravan_search_events`).get() as Record<string, unknown>;
    db.close();
    expect(row).toMatchObject({ origin: 'citation' });
  });

  it('列挙外の origin は記録せず ok:false（throw しない）', async () => {
    const r = await handler.recordSearchEvent({ kind: 'ego_open', query: '', origin: 'toolbar' as never });
    expect(r.ok).toBe(false);
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
