import initSqlJs from 'sql.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../src/db/connection';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { runReviewIncremental } from '../../src/pipeline/runReviewIncremental';
import type { OllamaClient } from '../../src/ollama/client';
import { noopLogger } from '../../src/logger';

// ── Mock OllamaClient ─────────────────────────────────────────────────────────

const mockOllama: OllamaClient = {
  generate: async () => ({ response: '{}' }),
  embeddings: async () => ({ embedding: new Float32Array(0) }),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpPath(suffix = '') {
  return path.join(os.tmpdir(), `rri-test-${process.pid}-${Date.now()}${suffix}`);
}

/**
 * Create a tmp directory and write review .md files into it.
 * Returns the directory path and cleanup fn.
 */
function makeTmpReviewDir(files: Array<{ name: string; content: string }>): {
  dir: string;
  cleanup: () => void;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rri-review-dir-'));
  for (const { name, content } of files) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return {
    dir,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {}
    },
  };
}

/**
 * Open a fresh memory-core DB at a temp path, attach an in-memory trail DB.
 */
async function openTestDb(opts?: {
  trailMessages?: Array<{
    uuid: string;
    session_id: string;
    type?: string;
    timestamp: string;
    text_content?: string;
    tool_calls?: string | null;
    subagent_type?: string | null;
    skill?: string | null;
  }>;
}) {
  const tmpPath = makeTmpPath('.db');
  process.env.MEMORY_CORE_DB_PATH = tmpPath;

  const { db, close } = await openMemoryCoreDb();

  const SQL = await initSqlJs();
  const trailHandle = new SQL.Database();

  trailHandle.run(`CREATE TABLE messages (
    uuid TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    text_content TEXT,
    tool_calls TEXT,
    subagent_type TEXT,
    skill TEXT
  ) STRICT`);

  // session_commits and commit_files needed by linkAddresses
  trailHandle.run(`CREATE TABLE session_commits (
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL,
    committed_at TEXT NOT NULL,
    repo_name TEXT NOT NULL
  ) STRICT`);
  trailHandle.run(`CREATE TABLE commit_files (
    id INTEGER PRIMARY KEY,
    commit_hash TEXT NOT NULL,
    file_path TEXT NOT NULL,
    repo_name TEXT NOT NULL
  ) STRICT`);

  if (opts?.trailMessages) {
    for (const msg of opts.trailMessages) {
      trailHandle.run(
        `INSERT INTO messages
           (uuid, session_id, type, timestamp, text_content, tool_calls, subagent_type, skill)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          msg.uuid,
          msg.session_id,
          msg.type ?? 'assistant',
          msg.timestamp,
          msg.text_content ?? null,
          msg.tool_calls ?? null,
          msg.subagent_type ?? null,
          msg.skill ?? null,
        ],
      );
    }
  }

  attachTrailDbFromHandle(db, trailHandle);

  return {
    db,
    close: () => {
      trailHandle.close();
      close();
      try {
        fs.unlinkSync(tmpPath);
      } catch (_) {}
      delete process.env.MEMORY_CORE_DB_PATH;
    },
  };
}

// ── Sample review doc content ─────────────────────────────────────────────────

const SAMPLE_REVIEW_DOC = `---
title: "Design Review"
type: "review"
date: "2026-01-01"
---
レビュー対象: \`packages/web-app/src/foo.ts\`

## デザイン

**問題:** border が 1px でない
**提案:** border: 1px solid を使う
`;

const NON_REVIEW_DOC = `---
title: "Spec Doc"
type: "spec"
date: "2026-01-01"
---
# System Overview

This is a spec document, not a review.
`;

// ── Tests ─────────────────────────────────────────────────────────────────────

const REPO = 'test-repo';

describe('runReviewIncremental', () => {
  // I16 Route A: basic doc ingestion
  test('I16 Route A: reviews_inserted>=1, findings_inserted>=1 for review doc', async () => {
    const { dir, cleanup } = makeTmpReviewDir([
      { name: 'sample.md', content: SAMPLE_REVIEW_DOC },
    ]);
    const { db, close } = await openTestDb();

    try {
      const result = await runReviewIncremental({
        db,
        repoName: REPO,
        reviewDir: dir,
        ollama: mockOllama,
        model: 'test',
        logger: noopLogger,
      });

      expect(result.status).toBe('success');
      expect(result.items_processed).toBeGreaterThanOrEqual(1);
      expect(result.reviews_inserted).toBeGreaterThanOrEqual(1);
      expect(result.findings_inserted).toBeGreaterThanOrEqual(1);

      const reviewsCount = db.exec(
        `SELECT COUNT(*) FROM memory_reviews WHERE source_kind='review_doc'`,
      );
      expect(reviewsCount[0]?.values?.[0]?.[0] as number).toBeGreaterThanOrEqual(1);
    } finally {
      close();
      cleanup();
    }
  }, 30000);

  // I16 idempotency: same file twice → reviews_inserted=0 on second run
  test('I16 idempotency: same source_hash on 2nd run → reviews_inserted=0', async () => {
    const { dir, cleanup } = makeTmpReviewDir([
      { name: 'sample.md', content: SAMPLE_REVIEW_DOC },
    ]);
    const { db, close } = await openTestDb();

    try {
      // First run
      const first = await runReviewIncremental({
        db,
        repoName: REPO,
        reviewDir: dir,
        ollama: mockOllama,
        model: 'test',
        logger: noopLogger,
      });
      expect(first.reviews_inserted).toBeGreaterThanOrEqual(1);

      // Second run with identical file
      const second = await runReviewIncremental({
        db,
        repoName: REPO,
        reviewDir: dir,
        ollama: mockOllama,
        model: 'test',
        logger: noopLogger,
      });
      expect(second.reviews_inserted).toBe(0);
    } finally {
      close();
      cleanup();
    }
  }, 30000);

  // I17 Route B: session ingestion
  test('I17 Route B: session review → memory_reviews has row with source_kind=session', async () => {
    const TS = '2026-03-01T00:00:00.000Z';
    const { db, close } = await openTestDb({
      trailMessages: [
        {
          uuid: 'msg-uuid-001',
          session_id: 'sess-001',
          type: 'assistant',
          timestamp: TS,
          text_content: `## デザイン\n\n**問題:** border が 1px でない\n**提案:** border: 1px solid を使う`,
          subagent_type: 'code-reviewer',
        },
      ],
    });

    try {
      // Use a non-existent reviewDir so Route A is skipped
      const result = await runReviewIncremental({
        db,
        repoName: REPO,
        reviewDir: '/nonexistent-path-abc123',
        ollama: mockOllama,
        model: 'test',
        logger: noopLogger,
      });

      expect(result.status).toBe('success');

      const sessionReviews = db.exec(
        `SELECT COUNT(*) FROM memory_reviews WHERE source_kind='session'`,
      );
      expect(sessionReviews[0]?.values?.[0]?.[0] as number).toBeGreaterThanOrEqual(1);
    } finally {
      close();
    }
  }, 30000);

  // Failed parse: non-review file should be skipped gracefully
  test('non-review doc (type=spec) → skipped gracefully, no error', async () => {
    const { dir, cleanup } = makeTmpReviewDir([
      { name: 'spec.md', content: NON_REVIEW_DOC },
    ]);
    const { db, close } = await openTestDb();

    try {
      const result = await runReviewIncremental({
        db,
        repoName: REPO,
        reviewDir: dir,
        ollama: mockOllama,
        model: 'test',
        logger: noopLogger,
      });

      // Should not throw, should complete with success
      expect(result.status).toBe('success');
      // reviews_inserted = 0 (skipped)
      expect(result.reviews_inserted).toBe(0);

      // No failed items for spec file
      const failedItems = db.exec(`SELECT COUNT(*) FROM memory_failed_items`);
      expect(failedItems[0]?.values?.[0]?.[0] as number).toBe(0);
    } finally {
      close();
      cleanup();
    }
  }, 30000);

  // reviewDir doesn't exist → no error, Route A silently skipped
  test('missing reviewDir → Route A skipped silently, status=success', async () => {
    const { db, close } = await openTestDb();

    try {
      const result = await runReviewIncremental({
        db,
        repoName: REPO,
        reviewDir: '/nonexistent-path-xyz987',
        ollama: mockOllama,
        model: 'test',
        logger: noopLogger,
      });

      expect(result.status).toBe('success');
      expect(result.reviews_inserted).toBe(0);
    } finally {
      close();
    }
  }, 30000);
});
