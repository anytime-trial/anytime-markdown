import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { discoverChangedSpecs } from '../../../src/ingest/spec/discoverSpecDocs';
import type { MemoryLogger } from '../../../src/logger';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function sha1(content: string | Buffer): string {
  return createHash('sha1').update(content).digest('hex');
}

function makeLogger(): MemoryLogger & { warns: string[]; infos: string[] } {
  const warns: string[] = [];
  const infos: string[] = [];
  return {
    info: jest.fn((msg: string) => { infos.push(msg); }),
    error: jest.fn(),
    warn: jest.fn((msg: string) => { warns.push(msg); }),
    warns,
    infos,
  };
}

/**
 * Make a minimal sql.js Database mock.
 * rowResult: null means no row found; string means existing source_hash.
 */
function makeDb(rowResult: string | null): {
  prepare: jest.Mock;
  _stmt: {
    bind: jest.Mock;
    step: jest.Mock;
    getAsObject: jest.Mock;
    reset: jest.Mock;
    free: jest.Mock;
  };
} {
  let stepped = false;
  const stmt = {
    bind: jest.fn(() => { stepped = false; }),
    step: jest.fn(() => {
      if (rowResult !== null && !stepped) {
        stepped = true;
        return true;
      }
      return false;
    }),
    getAsObject: jest.fn(() => {
      return rowResult !== null ? { source_hash: rowResult } : {};
    }),
    reset: jest.fn(() => { stepped = false; }),
    free: jest.fn(),
  };
  return {
    prepare: jest.fn(() => stmt),
    _stmt: stmt,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('discoverChangedSpecs', () => {
  let specRoot: string;

  beforeEach(() => {
    specRoot = mkdtempSync(join(tmpdir(), 'discover-spec-'));
  });

  test('new file (no DB row) → is_new=true', async () => {
    const content = '# New spec\n\nContent here.\n';
    writeFileSync(join(specRoot, 'new.md'), content);

    const db = makeDb(null) as unknown as Parameters<typeof discoverChangedSpecs>[0]['db'];
    const logger = makeLogger();

    const results = await discoverChangedSpecs({ specRoot, db, logger });

    expect(results).toHaveLength(1);
    expect(results[0].rel_path).toBe('new.md');
    expect(results[0].is_new).toBe(true);
    expect(results[0].source_hash).toBe(sha1(content));
  });

  test('same source_hash in DB → result is empty (skipped)', async () => {
    const content = '# Unchanged spec\n\nSame content.\n';
    writeFileSync(join(specRoot, 'unchanged.md'), content);
    const existingHash = sha1(content);

    const db = makeDb(existingHash) as unknown as Parameters<typeof discoverChangedSpecs>[0]['db'];
    const logger = makeLogger();

    const results = await discoverChangedSpecs({ specRoot, db, logger });

    expect(results).toHaveLength(0);
  });

  test('different source_hash in DB → is_new=false', async () => {
    const content = '# Updated spec\n\nNew content.\n';
    writeFileSync(join(specRoot, 'updated.md'), content);
    const differentHash = 'aabbccdd1122334455667788990011223344556677'; // old hash

    const db = makeDb(differentHash) as unknown as Parameters<typeof discoverChangedSpecs>[0]['db'];
    const logger = makeLogger();

    const results = await discoverChangedSpecs({ specRoot, db, logger });

    expect(results).toHaveLength(1);
    expect(results[0].rel_path).toBe('updated.md');
    expect(results[0].is_new).toBe(false);
    expect(results[0].source_hash).toBe(sha1(content));
  });

  test('file > 10MB → skipped, logger.warn called', async () => {
    // Create a file larger than 10MB by using a large write
    const largePath = join(specRoot, 'large.md');
    // Write ~11MB file
    const chunk = Buffer.alloc(1024 * 1024, 'A'); // 1MB chunk
    const fd = require('node:fs').openSync(largePath, 'w');
    for (let i = 0; i < 11; i++) {
      require('node:fs').writeSync(fd, chunk);
    }
    require('node:fs').closeSync(fd);

    const db = makeDb(null) as unknown as Parameters<typeof discoverChangedSpecs>[0]['db'];
    const logger = makeLogger();

    const results = await discoverChangedSpecs({ specRoot, db, logger });

    expect(results).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const warnCall = (logger.warn as jest.Mock).mock.calls[0][0] as string;
    expect(warnCall).toContain('large.md');
  });

  test('ignores non-.md files', async () => {
    writeFileSync(join(specRoot, 'readme.txt'), 'not markdown');
    writeFileSync(join(specRoot, 'config.json'), '{}');
    writeFileSync(join(specRoot, 'doc.md'), '# Doc\n');

    const db = makeDb(null) as unknown as Parameters<typeof discoverChangedSpecs>[0]['db'];
    const logger = makeLogger();

    const results = await discoverChangedSpecs({ specRoot, db, logger });

    expect(results).toHaveLength(1);
    expect(results[0].rel_path).toBe('doc.md');
  });

  test('handles nested .md files in subdirectories', async () => {
    mkdirSync(join(specRoot, 'sub'), { recursive: true });
    writeFileSync(join(specRoot, 'sub', 'nested.md'), '# Nested\n');

    const db = makeDb(null) as unknown as Parameters<typeof discoverChangedSpecs>[0]['db'];
    const logger = makeLogger();

    const results = await discoverChangedSpecs({ specRoot, db, logger });

    expect(results).toHaveLength(1);
    expect(results[0].rel_path).toBe('sub/nested.md');
    expect(results[0].is_new).toBe(true);
  });
});
