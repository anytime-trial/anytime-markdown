// Phase 2: summary 列の JSON 化 + handoff_at 追加の 12-step マイグレーションと upsertSummary のテスト。
// 一時ディレクトリのみ（本番 .anytime/agent/ へフォールバックしない）。
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentStatusStore } from '../src/status/AgentStatusStore';

// 旧スキーマ（summary に CHECK 無し・handoff_at 列無し）を再現する DDL。
const OLD_DDL = `CREATE TABLE IF NOT EXISTS agent_sessions (
  session_id       TEXT PRIMARY KEY,
  editing          INTEGER NOT NULL DEFAULT 0 CHECK (editing IN (0, 1)),
  file             TEXT NOT NULL DEFAULT '',
  branch           TEXT NOT NULL DEFAULT '',
  workspace_path   TEXT NOT NULL DEFAULT '',
  session_edits    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(session_edits)),
  planned_edits    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(planned_edits)),
  last_head        TEXT,
  committed_count  INTEGER NOT NULL DEFAULT 0 CHECK (committed_count >= 0),
  last_commit_hash TEXT,
  last_commit_at   TEXT,
  summary          TEXT NOT NULL DEFAULT '',
  summary_at       TEXT,
  updated_at       TEXT NOT NULL
) STRICT`;

function hasColumn(dbPath: string, col: string): boolean {
  const db = new DatabaseSync(dbPath);
  try {
    const rows = db.prepare(`PRAGMA table_info(agent_sessions)`).all() as Array<{ name: string }>;
    return rows.some((r) => r.name === col);
  } finally {
    db.close();
  }
}

describe('agent-status handoff スキーマ移行', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-status-handoff-'));
    dbPath = join(dir, 'agent-status.db');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('新規 DB は handoff_at 列を持つ', () => {
    const store = new AgentStatusStore(dbPath);
    store.close();
    expect(hasColumn(dbPath, 'handoff_at')).toBe(true);
  });

  it('旧スキーマ DB を開くと移行し、既存行を保持し summary を JSON 化する', () => {
    // 旧スキーマで DB を作り、空 summary と有効 JSON summary の 2 行を投入。
    const old = new DatabaseSync(dbPath);
    old.exec(OLD_DDL);
    old.prepare(
      `INSERT INTO agent_sessions (session_id, summary, updated_at) VALUES (?, ?, ?)`,
    ).run('s-empty', '', '2026-06-24T00:00:00.000Z');
    old.prepare(
      `INSERT INTO agent_sessions (session_id, summary, updated_at) VALUES (?, ?, ?)`,
    ).run('s-json', '{"goal":"x"}', '2026-06-24T00:00:01.000Z');
    old.close();
    expect(hasColumn(dbPath, 'handoff_at')).toBe(false);

    // Store で開くと移行が走る。
    const store = new AgentStatusStore(dbPath);
    try {
      expect(hasColumn(dbPath, 'handoff_at')).toBe(true);
      expect(existsSync(`${dbPath}.bak`)).toBe(true); // 移行前バックアップ

      const all = store.queryAll();
      expect(all.map((r) => r.sessionId).sort()).toEqual(['s-empty', 's-json']);

      const empty = store.queryOne('s-empty');
      expect(empty?.summary).toBe('{}'); // 空文字は有効 JSON へサニタイズ
      expect(empty?.handoffAt).toBeNull();

      const jsonRow = store.queryOne('s-json');
      expect(jsonRow?.summary).toBe('{"goal":"x"}'); // 有効 JSON は保持
    } finally {
      store.close();
    }
  });

  it('upsertSummary は summary(JSON) と handoff_at を保存する', () => {
    const store = new AgentStatusStore(dbPath);
    try {
      const payload = JSON.stringify({ handoffVersion: 1, structured: { goal: 'g' }, narrative: null });
      store.upsertSummary({
        sessionId: 's1',
        summary: payload,
        handoffAt: '2026-06-24T12:00:00.000Z',
      });
      const row = store.queryOne('s1');
      expect(row?.summary).toBe(payload);
      expect(row?.handoffAt).toBe('2026-06-24T12:00:00.000Z');
      expect(JSON.parse(row!.summary).structured.goal).toBe('g');
    } finally {
      store.close();
    }
  });

  it('移行済み DB を再度開いても二重移行しない（冪等）', () => {
    // 旧スキーマ → 1 回目の移行
    const old = new DatabaseSync(dbPath);
    old.exec(OLD_DDL);
    old.prepare(`INSERT INTO agent_sessions (session_id, summary, updated_at) VALUES (?, ?, ?)`).run(
      's1',
      '{"goal":"x"}',
      '2026-06-24T00:00:00.000Z',
    );
    old.close();
    const store1 = new AgentStatusStore(dbPath);
    store1.close();
    // 2 回目の起動：handoff_at 既存のため移行は走らず行は保持される
    const store2 = new AgentStatusStore(dbPath);
    try {
      expect(hasColumn(dbPath, 'handoff_at')).toBe(true);
      expect(store2.queryOne('s1')?.summary).toBe('{"goal":"x"}');
    } finally {
      store2.close();
    }
  });

  it('upsertSummary は編集・コミット列を壊さない', () => {
    const store = new AgentStatusStore(dbPath);
    try {
      store.upsertEditing({ sessionId: 's1', editing: true, file: 'a.ts', branch: 'dev' });
      store.upsertSummary({ sessionId: 's1', summary: '{}', handoffAt: '2026-06-24T12:00:00.000Z' });
      const row = store.queryOne('s1');
      expect(row?.editing).toBe(true);
      expect(row?.file).toBe('a.ts');
      expect(row?.branch).toBe('dev');
    } finally {
      store.close();
    }
  });
});
