/**
 * E2E tests for memory-core Phase 2.7: runReviewIncremental (Route A + B).
 *
 * E5: Route A — 2 synthetic review/*.md files → memory_reviews/findings + precedes edge
 * E6: Route B — 2 synthetic trail.messages code-reviewer sessions → memory_reviews/findings
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import initSqlJs from 'sql.js';
import { openMemoryCoreDb } from '../../src/db/connection';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { runReviewIncremental } from '../../src/pipeline/runReviewIncremental';
import { entityId } from '../../src/canonical/entityId';
import { noopLogger } from '../../src/logger';
import type { OllamaClient } from '../../src/ollama/client';

// ── Mock OllamaClient ─────────────────────────────────────────────────────────

const mockOllama: OllamaClient = {
  generate: async () => ({ response: '{}' }),
  embeddings: async () => ({ embedding: new Float32Array(0) }),
};

// ── Sample review doc content ─────────────────────────────────────────────────

// Each chapter includes "> [!IMPORTANT]" so inferSeverity returns 'warn'.
// linkPrecedesBugs filters: severity IN ('warn', 'error').
const DESIGN_MD = `---
title: "Design Review"
type: "review"
date: "2026-01-15"
---
レビュー対象: \`packages/web-app/src/foo.ts\`

## デザイン

> [!IMPORTANT]
> 仕様違反

**問題:** ボタンの色が仕様と異なる
**提案:** ACCENT_COLOR トークンを使う

## レイアウト

> [!IMPORTANT]
> 統一されていない

**問題:** パディングが統一されていない
**提案:** 8px グリッドに合わせる
`;

const ACCESSIBILITY_MD = `---
title: "Accessibility Review"
type: "review"
date: "2026-01-15"
---
レビュー対象: \`packages/web-app/src/foo.ts\`

## アクセシビリティ

> [!IMPORTANT]
> a11y 違反

**問題:** ボタンに aria-label がない
**提案:** aria-label="送信" を追加する

## コントラスト

> [!IMPORTANT]
> WCAG 違反

**問題:** テキストのコントラスト比が 4.5:1 を下回っている
**提案:** 文字色を #333333 以上に濃くする

## フォーカス

> [!IMPORTANT]
> フォーカス管理

**問題:** フォーカスリングが非表示
**提案:** outline: 2px solid を追加する
`;

// ── Trail DB factory ──────────────────────────────────────────────────────────

const REPO = 'test-repo';
const TARGET_FILE = 'packages/web-app/src/foo.ts';
const FIX_COMMIT_HASH = 'fix001e2eaaaaaaaaa';
// Bug must be committed AFTER the finding is recorded (recorded_at ≈ Date.now()).
// Use 30 days in the future so it falls within the 60-day precedes window.
const FIX_COMMITTED_AT = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const SESSION_ID = 'sess-e2e-bug-001';

function buildTrailDb(SQL: Awaited<ReturnType<typeof initSqlJs>>, opts: {
  withFixCommit: boolean;
  reviewerMessages?: Array<{ uuid: string; sessionId: string; ts: string; text: string }>;
}) {
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');

  db.run(`CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    repo_name TEXT NOT NULL DEFAULT ''
  ) STRICT`);
  db.run(`CREATE TABLE session_commits (
    session_id TEXT NOT NULL,
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL DEFAULT '',
    committed_at TEXT,
    repo_name TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (session_id, commit_hash)
  ) STRICT`);
  db.run(`CREATE TABLE commit_files (
    commit_hash TEXT NOT NULL,
    repo_name TEXT NOT NULL DEFAULT '',
    file_path TEXT NOT NULL,
    PRIMARY KEY (commit_hash, file_path)
  ) STRICT`);
  db.run(`CREATE TABLE messages (
    uuid TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    text_content TEXT,
    tool_calls TEXT,
    subagent_type TEXT,
    skill TEXT
  ) STRICT`);

  if (opts.withFixCommit) {
    db.run(`INSERT INTO sessions (id, repo_name) VALUES (?, ?)`, [SESSION_ID, REPO]);
    db.run(
      `INSERT INTO session_commits (session_id, commit_hash, commit_message, committed_at, repo_name)
       VALUES (?, ?, ?, ?, ?)`,
      [SESSION_ID, FIX_COMMIT_HASH, 'fix(web-app): fix logic error in foo.ts', FIX_COMMITTED_AT, REPO],
    );
    db.run(
      `INSERT INTO commit_files (commit_hash, repo_name, file_path) VALUES (?, ?, ?)`,
      [FIX_COMMIT_HASH, REPO, TARGET_FILE],
    );
  }

  if (opts.reviewerMessages) {
    for (const msg of opts.reviewerMessages) {
      db.run(
        `INSERT INTO messages (uuid, session_id, type, timestamp, text_content, subagent_type)
         VALUES (?, ?, 'assistant', ?, ?, 'code-reviewer')`,
        [msg.uuid, msg.sessionId, msg.ts, msg.text],
      );
    }
  }

  return db;
}

// ── Memory DB factory ─────────────────────────────────────────────────────────

async function openFreshMemDb(tmpDir: string, suffix: string) {
  const dbPath = path.join(tmpDir, `mem-${suffix}.db`);
  process.env.MEMORY_CORE_DB_PATH = dbPath;
  const { db, close } = await openMemoryCoreDb();
  return {
    db,
    close: () => {
      close();
      try { fs.unlinkSync(dbPath); } catch (_) {}
      delete process.env.MEMORY_CORE_DB_PATH;
    },
  };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('E2E Phase 2.7: runReviewIncremental', () => {
  let SQL: Awaited<ReturnType<typeof initSqlJs>>;
  let tmpDir: string;

  beforeAll(async () => {
    SQL = await initSqlJs();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `review-e2e-${process.pid}-`));
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  // ── E5: Route A ────────────────────────────────────────────────────────────

  test(
    'E5: Route A — 2 review docs → reviews_inserted=2, findings>=5, precedes edge>=1',
    async () => {
      // 1. Create synthetic review dir
      const reviewDir = fs.mkdtempSync(path.join(tmpDir, 'review-'));
      fs.writeFileSync(path.join(reviewDir, 'design.md'), DESIGN_MD, 'utf8');
      fs.writeFileSync(path.join(reviewDir, 'accessibility.md'), ACCESSIBILITY_MD, 'utf8');

      // 2. Open memory-core DB
      const { db, close } = await openFreshMemDb(tmpDir, 'e5');

      // 3. Build trail DB with fix commit
      const trailHandle = buildTrailDb(SQL, { withFixCommit: true });
      attachTrailDbFromHandle(db, trailHandle);

      // 4. Insert Bug entity + memory_bug_fixes to simulate Phase 2.5 output
      const now = new Date().toISOString();
      const bugEntityId = entityId('Bug', FIX_COMMIT_HASH);
      db.run(
        `INSERT OR IGNORE INTO memory_entities
           (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
            first_seen_at, last_updated_at, recorded_at)
         VALUES (?, 'Bug', ?, 'E2E Test Bug', '[]', '[]', '{}', ?, ?, ?)`,
        [bugEntityId, FIX_COMMIT_HASH, now, now, now],
      );
      db.run(
        `INSERT OR IGNORE INTO memory_bug_fixes
           (id, commit_sha, bug_entity_id, package, category, subject_summary,
            affected_file_paths_json, committed_at, recorded_at)
         VALUES (?, ?, ?, 'web-app', 'logic', 'fix logic error in foo.ts', ?, ?, ?)`,
        ['bf-e2e-1', FIX_COMMIT_HASH, bugEntityId, JSON.stringify([TARGET_FILE]), FIX_COMMITTED_AT, now],
      );

      try {
        const result = await runReviewIncremental({
          db,
          repoName: REPO,
          reviewDir,
          ollama: mockOllama,
          model: 'test',
          logger: noopLogger,
        });

        expect(result.status).toBe('success');
        expect(result.reviews_inserted).toBeGreaterThanOrEqual(2);
        expect(result.findings_inserted).toBeGreaterThanOrEqual(5);
        expect(result.duration_ms).toBeLessThan(5000);

        // memory_reviews has 2 doc rows
        const reviewCount = db.exec(`SELECT COUNT(*) FROM memory_reviews WHERE source_kind='review_doc'`);
        expect(reviewCount[0]?.values?.[0]?.[0] as number).toBeGreaterThanOrEqual(2);

        // memory_review_findings has >=5 rows
        const findingCount = db.exec(`SELECT COUNT(*) FROM memory_review_findings`);
        expect(findingCount[0]?.values?.[0]?.[0] as number).toBeGreaterThanOrEqual(5);

        // precedes edge >= 1
        const precedesEdges = db.exec(
          `SELECT COUNT(*) FROM memory_edges WHERE predicate='precedes' AND confidence_label='INFERRED'`,
        );
        expect(precedesEdges[0]?.values?.[0]?.[0] as number).toBeGreaterThanOrEqual(1);
      } finally {
        trailHandle.close();
        close();
      }
    },
    30000,
  );

  // ── E6: Route B ────────────────────────────────────────────────────────────

  test(
    'E6: Route B — 2 code-reviewer sessions → source_kind=session rows >=2',
    async () => {
      const TS1 = '2026-03-01T00:00:00.000Z';
      const TS2 = '2026-03-02T00:00:00.000Z';

      const trailHandle = buildTrailDb(SQL, {
        withFixCommit: false,
        reviewerMessages: [
          {
            uuid: 'msg-e6-001',
            sessionId: 'sess-e6-001',
            ts: TS1,
            text: '## デザイン\n\n**問題:** ボタンの色が仕様と異なる\n**提案:** ACCENT_COLOR トークンを使う',
          },
          {
            uuid: 'msg-e6-002',
            sessionId: 'sess-e6-002',
            ts: TS2,
            text: '## アクセシビリティ\n\n**問題:** aria-label がない\n**提案:** aria-label を追加する',
          },
        ],
      });

      const { db, close } = await openFreshMemDb(tmpDir, 'e6');
      attachTrailDbFromHandle(db, trailHandle);

      try {
        const result = await runReviewIncremental({
          db,
          repoName: REPO,
          reviewDir: '/nonexistent-path-e2e-123456',
          ollama: mockOllama,
          model: 'test',
          logger: noopLogger,
        });

        expect(result.status).toBe('success');

        // >=2 session review rows
        const sessionCount = db.exec(
          `SELECT COUNT(*) FROM memory_reviews WHERE source_kind='session'`,
        );
        expect(sessionCount[0]?.values?.[0]?.[0] as number).toBeGreaterThanOrEqual(2);

        // >=2 findings (one per session)
        const findingCount = db.exec(`SELECT COUNT(*) FROM memory_review_findings`);
        expect(findingCount[0]?.values?.[0]?.[0] as number).toBeGreaterThanOrEqual(2);
      } finally {
        trailHandle.close();
        close();
      }
    },
    30000,
  );
});
