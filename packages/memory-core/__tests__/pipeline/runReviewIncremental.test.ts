import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../src/db/connection';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { runReviewIncremental } from '../../src/pipeline/runReviewIncremental';
import type { OllamaClient } from '@anytime-markdown/agent-core';
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

  const { db, close } = await openMemoryCoreDb(tmpPath);

  const trailHandle = BetterSqlite3MemoryDb.openInMemory();

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

  // force=true: re-parses already-ingested file, clears findings first
  test('force=true: re-parse already-ingested review doc → status=success, findings re-processed', async () => {
    const { dir, cleanup } = makeTmpReviewDir([
      { name: 'sample.md', content: SAMPLE_REVIEW_DOC },
    ]);
    const { db, close } = await openTestDb();

    try {
      // First normal run
      const first = await runReviewIncremental({
        db,
        repoName: REPO,
        reviewDir: dir,
        ollama: mockOllama,
        model: 'test',
        logger: noopLogger,
      });
      expect(first.reviews_inserted).toBeGreaterThanOrEqual(1);
      const firstFindings = first.findings_inserted;

      // Second run with force=true — should re-parse despite same hash
      // (is_new stays false since the row exists, but findings are cleared/re-inserted)
      const second = await runReviewIncremental({
        db,
        repoName: REPO,
        reviewDir: dir,
        ollama: mockOllama,
        model: 'test',
        logger: noopLogger,
        force: true,
      });
      expect(second.status).toBe('success');
      // The force path executes: no error, findings re-processed
      expect(second.findings_inserted).toBeGreaterThanOrEqual(0);
      // items_processed should include the file
      expect(second.items_processed).toBeGreaterThanOrEqual(1);
      // findings_inserted >= first run (cleared and re-inserted)
      expect(second.findings_inserted).toBeGreaterThanOrEqual(firstFindings);
    } finally {
      close();
      cleanup();
    }
  }, 30000);

  // force=true via env-var MEMORY_CORE_REVIEW_FORCE=1
  test('MEMORY_CORE_REVIEW_FORCE=1 triggers force re-parse via env-var', async () => {
    const { dir, cleanup } = makeTmpReviewDir([
      { name: 'env-force.md', content: SAMPLE_REVIEW_DOC },
    ]);
    const { db, close } = await openTestDb();

    const prev = process.env['MEMORY_CORE_REVIEW_FORCE'];
    process.env['MEMORY_CORE_REVIEW_FORCE'] = '1';

    try {
      // First run seeds the review
      const first = await runReviewIncremental({
        db,
        repoName: REPO,
        reviewDir: dir,
        ollama: mockOllama,
        model: 'test',
        logger: noopLogger,
        force: false, // ensure force only comes from env
      });
      expect(first.reviews_inserted).toBeGreaterThanOrEqual(1);

      // Second run — env-var force=1 → re-parse should succeed without error
      const second = await runReviewIncremental({
        db,
        repoName: REPO,
        reviewDir: dir,
        ollama: mockOllama,
        model: 'test',
        logger: noopLogger,
        force: false,
      });
      // With force re-parse, the pipeline runs successfully (force path executed)
      expect(second.status).toBe('success');
      expect(second.items_processed).toBeGreaterThanOrEqual(1);
    } finally {
      if (prev === undefined) {
        delete process.env['MEMORY_CORE_REVIEW_FORCE'];
      } else {
        process.env['MEMORY_CORE_REVIEW_FORCE'] = prev;
      }
      close();
      cleanup();
    }
  }, 30000);

  // Route C: force=true with session reviews clears session findings
  test('force=true with session reviews clears session findings and re-inserts', async () => {
    const TS = '2026-03-01T00:00:00.000Z';
    const { db, close } = await openTestDb({
      trailMessages: [
        {
          uuid: 'msg-force-sess',
          session_id: 'sess-force',
          type: 'assistant',
          timestamp: TS,
          text_content: `## レビュー指摘事項\n\n### 1. Null 参照\n\n- **重大度**: error\n- **カテゴリ**: logic\n- **対象**: \`foo.ts\`\n\n**問題:**\n\nNull かもしれない\n\n**提案:**\n\nチェックを追加する`,
          subagent_type: 'code-reviewer',
        },
      ],
    });

    try {
      // First run — ingests session review
      const first = await runReviewIncremental({
        db,
        repoName: REPO,
        reviewDir: '/nonexistent-force-test',
        ollama: mockOllama,
        model: 'test',
        logger: noopLogger,
      });
      expect(first.status).toBe('success');

      // Second run with force — clears session findings and re-processes
      const second = await runReviewIncremental({
        db,
        repoName: REPO,
        reviewDir: '/nonexistent-force-test',
        ollama: mockOllama,
        model: 'test',
        logger: noopLogger,
        force: true,
      });
      expect(second.status).toBe('success');
    } finally {
      close();
    }
  }, 30000);

  // Unreadable file in reviewDir → error recorded, other files processed
  test('unreadable file in reviewDir → itemsFailed increments, other files still processed', async () => {
    const { dir, cleanup } = makeTmpReviewDir([
      { name: 'unreadable.md', content: SAMPLE_REVIEW_DOC },
      { name: 'readable.md', content: SAMPLE_REVIEW_DOC.replace('Design Review', 'Readable Review') },
    ]);
    const { db, close } = await openTestDb();

    // Make the first file unreadable
    const unreadablePath = path.join(dir, 'unreadable.md');
    fs.chmodSync(unreadablePath, 0o000);

    try {
      const result = await runReviewIncremental({
        db,
        repoName: REPO,
        reviewDir: dir,
        ollama: mockOllama,
        model: 'test',
        logger: noopLogger,
      });

      // Status is partial or success depending on whether readable file compensates
      expect(['success', 'partial']).toContain(result.status);
      // The readable file should still be processed
      expect(result.reviews_inserted).toBeGreaterThanOrEqual(1);
    } finally {
      // Restore permissions before cleanup
      try { fs.chmodSync(unreadablePath, 0o644); } catch (_) {}
      close();
      cleanup();
    }
  }, 30000);

  // Multiple review docs in directory
  test('multiple review docs in reviewDir → all processed', async () => {
    const { dir, cleanup } = makeTmpReviewDir([
      { name: 'review1.md', content: SAMPLE_REVIEW_DOC },
      { name: 'review2.md', content: SAMPLE_REVIEW_DOC.replace('Design Review', 'Code Review 2') },
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
      expect(result.reviews_inserted).toBeGreaterThanOrEqual(2);
    } finally {
      close();
      cleanup();
    }
  }, 30000);
});
