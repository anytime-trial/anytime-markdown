// Phase 6 S4: GET /api/memory/rationale のルーティング + MemoryApiHandler.listRationaleNodes。
// fixture は extractCommitRationale.ts と同じ書込形（Commit の canonical_name = full hash、
// Decision.summary = rationale テキスト、edge predicate='rationale_for'）で作る。
jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })),
}));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

const TS = '2026-07-17T10:00:00.000Z';

function buildMemoryDb(dbPath: string): void {
  const db = new BetterSqlite3(dbPath);
  db.exec(`CREATE TABLE memory_entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    aliases_json TEXT NOT NULL DEFAULT '[]',
    tags_json TEXT NOT NULL DEFAULT '[]',
    attributes_json TEXT NOT NULL DEFAULT '{}',
    summary TEXT NOT NULL DEFAULT '',
    first_seen_at TEXT NOT NULL,
    last_updated_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    UNIQUE (type, canonical_name)
  ) STRICT`);
  db.exec(`CREATE TABLE memory_edges (
    id TEXT PRIMARY KEY,
    subject_entity_id TEXT NOT NULL,
    predicate TEXT NOT NULL,
    object_entity_id TEXT,
    object_literal TEXT,
    valid_from TEXT NOT NULL,
    valid_to TEXT,
    recorded_at TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0,
    confidence_label TEXT NOT NULL DEFAULT 'EXTRACTED',
    modality TEXT NOT NULL DEFAULT 'asserted',
    attributes_json TEXT NOT NULL DEFAULT '{}'
  ) STRICT`);
  const insEntity = db.prepare(
    `INSERT INTO memory_entities (id, type, canonical_name, display_name, summary, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insEntity.run('commit-abc', 'Commit', 'abc123def4567890', 'abc123def456', '', TS, TS, TS);
  insEntity.run('decision-1', 'Decision', 'dec-1', '性能より単純さを優先', '性能より単純さを優先: TDD を単純に保つため独立走査とした', TS, TS, TS);
  insEntity.run('commit-other', 'Commit', 'ffff00001111', 'ffff0000', '', TS, TS, TS);
  insEntity.run('decision-2', 'Decision', 'dec-2', '別セッションの決定', '別セッションの決定', TS, TS, TS);
  const insEdge = db.prepare(
    `INSERT INTO memory_edges (id, subject_entity_id, predicate, object_entity_id, valid_from, recorded_at, source_type, source_ref, confidence, confidence_label, modality)
     VALUES (?, ?, 'rationale_for', ?, ?, ?, 'code', ?, 1.0, ?, 'asserted')`,
  );
  insEdge.run('edge-1', 'decision-1', 'commit-abc', TS, TS, 'session_commits#abc123def4567890', 'EXTRACTED');
  insEdge.run('edge-2', 'decision-2', 'commit-other', TS, TS, 'session_commits#ffff00001111', 'INFERRED');
  db.close();
}

function buildTrailDbFile(dbPath: string): void {
  const db = new BetterSqlite3(dbPath);
  db.exec(`CREATE TABLE session_commits (
    session_id TEXT NOT NULL,
    commit_hash TEXT NOT NULL,
    repo_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, repo_id, commit_hash)
  )`);
  db.prepare(`INSERT INTO session_commits (session_id, commit_hash) VALUES (?, ?)`).run(
    'sess-with-rationale',
    'abc123def4567890',
  );
  db.close();
}

describe('GET /api/memory/rationale (Phase 6 S4)', () => {
  let tmpDir: string;
  let server: TrailDataServer;
  let trailDb: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rationale-api-test-'));
    buildMemoryDb(path.join(tmpDir, 'memory-core.db'));
    buildTrailDbFile(path.join(tmpDir, 'trail.db'));
    trailDb = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', trailDb, makeMockLogger(), undefined, path.join(tmpDir, 'memory-core.db'));
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    trailDb.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('セッションのコミットに紐付く Decision ノードを confidence_label 付きで返す（FR-23）', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/rationale?sessionId=sess-with-rationale`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rationale: Array<Record<string, unknown>> };
    expect(body.rationale).toHaveLength(1);
    expect(body.rationale[0]?.['commitHash']).toBe('abc123def4567890');
    expect(body.rationale[0]?.['confidenceLabel']).toBe('EXTRACTED');
    expect(String(body.rationale[0]?.['summary'])).toContain('単純さを優先');
  });

  it('コミットの無いセッション・未知セッションは空配列（FR-23）', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/rationale?sessionId=sess-none`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { rationale: unknown[] }).rationale).toHaveLength(0);
  });

  it('sessionId 欠落は 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/rationale`);
    expect(res.status).toBe(400);
  });

  it('memory.db 不在は空配列で縮退する（FR-23）', async () => {
    const server2 = new TrailDataServer(
      '/tmp',
      trailDb,
      makeMockLogger(),
      undefined,
      path.join(tmpDir, 'no-such.db'),
    );
    await server2.start(0);
    try {
      const res = await fetch(`http://127.0.0.1:${server2.port}/api/memory/rationale?sessionId=x`);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { rationale: unknown[] }).rationale).toHaveLength(0);
    } finally {
      await server2.stop();
    }
  });
});
