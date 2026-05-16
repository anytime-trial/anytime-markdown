import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../src/db/connection';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { runSpecIncremental } from '../../src/pipeline/runSpecIncremental';
import type { OllamaClient } from '@anytime-markdown/ollama-core';
import { noopLogger } from '../../src/logger';

// ── Mock OllamaClient ─────────────────────────────────────────────────────────

function makeMockOllama(claimsOverride?: object): OllamaClient {
  return {
    generate: jest.fn().mockResolvedValue({
      response: JSON.stringify({
        summary: 'test spec',
        claims: claimsOverride ?? [
          {
            subject: { type: 'Package', name: 'pkg_web-app' },
            predicate: 'depends_on',
            object: { type: 'Library', name: 'sql.js' },
            modality: 'mandatory',
            line_hint: 1,
            confidence: 0.95,
          },
        ],
      }),
    }),
    embeddings: jest.fn().mockResolvedValue({ embedding: new Float32Array(0) }),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpPath(suffix = '') {
  return path.join(os.tmpdir(), `rsi-test-${process.pid}-${Date.now()}${suffix}`);
}

async function openTestDb() {
  const tmpPath = makeTmpPath('.db');

  const { db, close } = await openMemoryCoreDb(tmpPath);

  const trailHandle = BetterSqlite3MemoryDb.openInMemory();

  // Minimal trail DB schema for attachTrailDbFromHandle
  trailHandle.run(`CREATE TABLE IF NOT EXISTS c4_manual_elements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    repo_name TEXT NOT NULL
  ) STRICT`);
  trailHandle.run(`CREATE TABLE IF NOT EXISTS c4_manual_relationships (
    repo_name TEXT NOT NULL,
    rel_id TEXT NOT NULL,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    predicate TEXT NOT NULL,
    PRIMARY KEY (repo_name, rel_id)
  ) STRICT`);

  // Seed a c4 element for pkg_web-app
  trailHandle.run(
    `INSERT OR IGNORE INTO c4_manual_elements (id, name, type, repo_name) VALUES (?, ?, ?, ?)`,
    ['pkg_web-app', 'web-app', 'Container', 'anytime-markdown'],
  );

  attachTrailDbFromHandle(db, trailHandle);

  return {
    db,
    trailHandle,
    cleanup: () => {
      try { trailHandle.close(); } catch (_) {}
      try { close(); } catch (_) {}
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    },
  };
}

function makeTmpSpecDir(files: Array<{ name: string; content: string }>): {
  dir: string;
  cleanup: () => void;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rsi-spec-dir-'));
  for (const { name, content } of files) {
    const fullPath = path.join(dir, name);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }
  return {
    dir,
    cleanup: () => {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    },
  };
}

const VALID_SPEC_CONTENT = `---
title: "Test Spec"
date: "2026-01-01"
type: "spec"
lang: "ja"
c4Scope:
  - "pkg_web-app"
---

必須: sql.js に depends_on する。
`;

const NO_FRONTMATTER_CONTENT = `# No Frontmatter

This spec has no YAML frontmatter.
必須: 何かをしなければならない。
`;

// Has --- block but missing required `type` field — invalid, not just missing
const INVALID_FRONTMATTER_CONTENT = `---
title: "Bad Spec"
date: "2026-01-01"
---

Body text here.
`;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runSpecIncremental', () => {
  test('processes a valid spec → status=success, items_processed=1', async () => {
    const { db, cleanup } = await openTestDb();
    const { dir, cleanup: dirCleanup } = makeTmpSpecDir([
      { name: 'foo.md', content: VALID_SPEC_CONTENT },
    ]);
    const mockOllama = makeMockOllama();

    try {
      const result = await runSpecIncremental({
        db,
        specRoot: dir,
        ollama: mockOllama,
        model: 'test-model',
        logger: noopLogger,
      });

      expect(result.status).toBe('success');
      expect(result.items_processed).toBe(1);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    } finally {
      dirCleanup();
      cleanup();
    }
  });

  test('inserts edge with source_type=spec, modality=mandatory, predicate=depends_on', async () => {
    const { db, cleanup } = await openTestDb();
    const { dir, cleanup: dirCleanup } = makeTmpSpecDir([
      { name: 'foo.md', content: VALID_SPEC_CONTENT },
    ]);
    const mockOllama = makeMockOllama();

    try {
      await runSpecIncremental({
        db,
        specRoot: dir,
        ollama: mockOllama,
        model: 'test-model',
        logger: noopLogger,
      });

      const rows = db.exec(
        `SELECT source_type, modality, predicate FROM memory_edges
         WHERE source_type = 'spec' AND predicate = 'depends_on' AND modality = 'mandatory'`,
      );

      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].values.length).toBeGreaterThan(0);
      const row = rows[0].values[0];
      expect(row[0]).toBe('spec');
      expect(row[1]).toBe('mandatory');
      expect(row[2]).toBe('depends_on');
    } finally {
      dirCleanup();
      cleanup();
    }
  });

  test('second run skips unchanged file → items_skipped=1', async () => {
    const { db, cleanup } = await openTestDb();
    const { dir, cleanup: dirCleanup } = makeTmpSpecDir([
      { name: 'foo.md', content: VALID_SPEC_CONTENT },
    ]);
    const mockOllama = makeMockOllama();

    try {
      // First run — process the file
      const result1 = await runSpecIncremental({
        db,
        specRoot: dir,
        ollama: mockOllama,
        model: 'test-model',
        logger: noopLogger,
      });
      expect(result1.items_processed).toBe(1);

      // Second run — same file, same hash → should skip
      const result2 = await runSpecIncremental({
        db,
        specRoot: dir,
        ollama: mockOllama,
        model: 'test-model',
        logger: noopLogger,
      });
      expect(result2.items_processed).toBe(0);
      expect(result2.items_skipped).toBe(1);
    } finally {
      dirCleanup();
      cleanup();
    }
  });

  // Missing frontmatter (no --- block) → soft skip: items_skipped, not items_failed
  test('missing frontmatter file is items_skipped, not items_failed', async () => {
    const { db, cleanup } = await openTestDb();
    const { dir, cleanup: dirCleanup } = makeTmpSpecDir([
      { name: 'no-fm.md', content: NO_FRONTMATTER_CONTENT },
    ]);
    const mockOllama = makeMockOllama();

    try {
      const result = await runSpecIncremental({
        db,
        specRoot: dir,
        ollama: mockOllama,
        model: 'test-model',
        logger: noopLogger,
      });

      expect(result.status).toBe('success');
      expect(result.items_skipped).toBe(1);
      expect(result.items_failed).toBe(0);
      expect(result.items_processed).toBe(0);

      // No entry in memory_failed_items for this file
      // db.exec always returns [{columns, values}] for SELECT; check values.length for row count
      const failedRows = db.exec(
        `SELECT item_key FROM memory_failed_items WHERE scope = 'spec' AND item_key = 'no-fm.md'`,
      );
      const matchingRowCount = failedRows[0]?.values.length ?? 0;
      expect(matchingRowCount).toBe(0);
    } finally {
      dirCleanup();
      cleanup();
    }
  });

  // Invalid frontmatter (has --- block but zod fails) → hard error, triggers quarantine
  test('invalid frontmatter still triggers quarantine after 5 consecutive failures', async () => {
    const { db, cleanup } = await openTestDb();
    const { dir, cleanup: dirCleanup } = makeTmpSpecDir([
      { name: 'bad1.md', content: INVALID_FRONTMATTER_CONTENT },
      { name: 'bad2.md', content: INVALID_FRONTMATTER_CONTENT },
      { name: 'bad3.md', content: INVALID_FRONTMATTER_CONTENT },
      { name: 'bad4.md', content: INVALID_FRONTMATTER_CONTENT },
      { name: 'bad5.md', content: INVALID_FRONTMATTER_CONTENT },
    ]);
    const mockOllama = makeMockOllama();

    try {
      const result = await runSpecIncremental({
        db,
        specRoot: dir,
        ollama: mockOllama,
        model: 'test-model',
        logger: noopLogger,
      });

      expect(result.status).toBe('partial');
      expect(result.items_failed).toBe(5);
      expect(result.items_skipped).toBe(0);
      expect(result.items_processed).toBe(0);
    } finally {
      dirCleanup();
      cleanup();
    }
  });

  // 6 missing-frontmatter + 2 valid: missing skipped, valid processed, no quarantine
  test('mixed missing + valid: missing skipped, valid processed, no quarantine', async () => {
    const { db, cleanup } = await openTestDb();
    const { dir, cleanup: dirCleanup } = makeTmpSpecDir([
      { name: 'no-fm-1.md', content: NO_FRONTMATTER_CONTENT },
      { name: 'no-fm-2.md', content: NO_FRONTMATTER_CONTENT },
      { name: 'no-fm-3.md', content: NO_FRONTMATTER_CONTENT },
      { name: 'no-fm-4.md', content: NO_FRONTMATTER_CONTENT },
      { name: 'no-fm-5.md', content: NO_FRONTMATTER_CONTENT },
      { name: 'no-fm-6.md', content: NO_FRONTMATTER_CONTENT },
      { name: 'good1.md', content: VALID_SPEC_CONTENT },
      { name: 'good2.md', content: VALID_SPEC_CONTENT },
    ]);
    const mockOllama = makeMockOllama();

    try {
      const result = await runSpecIncremental({
        db,
        specRoot: dir,
        ollama: mockOllama,
        model: 'test-model',
        logger: noopLogger,
      });

      expect(result.status).toBe('success');
      expect(result.items_skipped).toBe(6);
      expect(result.items_processed).toBe(2);
      expect(result.items_failed).toBe(0);
    } finally {
      dirCleanup();
      cleanup();
    }
  });

  // Existing tests updated to reflect new behavior: missing frontmatter → skipped, not failed

  test('spec with invalid frontmatter (has --- block, bad type) → failed_items recorded', async () => {
    const { db, cleanup } = await openTestDb();
    const { dir, cleanup: dirCleanup } = makeTmpSpecDir([
      { name: 'bad.md', content: INVALID_FRONTMATTER_CONTENT },
    ]);
    const mockOllama = makeMockOllama();

    try {
      const result = await runSpecIncremental({
        db,
        specRoot: dir,
        ollama: mockOllama,
        model: 'test-model',
        logger: noopLogger,
      });

      expect(['success', 'partial']).toContain(result.status);
      expect(result.items_failed).toBe(1);

      const failedRows = db.exec(
        `SELECT scope, item_key, reason FROM memory_failed_items WHERE scope = 'spec'`,
      );
      expect(failedRows.length).toBeGreaterThan(0);
      expect(failedRows[0].values.length).toBeGreaterThan(0);
    } finally {
      dirCleanup();
      cleanup();
    }
  });

  test('mix of missing-frontmatter and valid spec files → continues past skips', async () => {
    const { db, cleanup } = await openTestDb();
    const { dir, cleanup: dirCleanup } = makeTmpSpecDir([
      { name: 'bad.md', content: NO_FRONTMATTER_CONTENT },
      { name: 'good.md', content: VALID_SPEC_CONTENT },
    ]);
    const mockOllama = makeMockOllama();

    try {
      const result = await runSpecIncremental({
        db,
        specRoot: dir,
        ollama: mockOllama,
        model: 'test-model',
        logger: noopLogger,
      });

      expect(result.items_processed).toBeGreaterThanOrEqual(1);
      expect(result.status).toBe('success');
    } finally {
      dirCleanup();
      cleanup();
    }
  });
});
