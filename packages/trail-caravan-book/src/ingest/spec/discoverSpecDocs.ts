import { closeSync, fstatSync, openSync, readdirSync, readSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import type { MemoryDbConnection } from '../../db/connection/types';
import type { MemoryLogger } from '../../logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscoverInput {
  specRoot: string;
  db: MemoryDbConnection;
  logger: MemoryLogger;
}

export interface ChangedSpec {
  rel_path: string;
  abs_path: string;
  source_hash: string;
  is_new: boolean;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// memory ingestion 対象外のサブツリー (frontmatter type enum に無いカテゴリ)
const EXCLUDED_DIR_PREFIXES = ['90.skill/'];

// ── File reading helper ───────────────────────────────────────────────────────

/**
 * Read the full contents of a file using openSync/fstatSync/readSync to avoid
 * TOCTOU race (stat-then-open). Returns null if the file should be skipped
 * (too large, unreadable, etc.).
 */
function readFileContent(abs_path: string, logger: MemoryLogger): Buffer | null {
  let fd: number | null = null;
  try {
    try {
      fd = openSync(abs_path, 'r');
    } catch (err) {
      logger.error(`[anytime-memory] discoverChangedSpecs: failed to open file ${abs_path}`, err);
      return null;
    }

    const fileSize = fstatSync(fd).size;
    if (fileSize > MAX_FILE_BYTES) {
      const warnMsg = `[anytime-memory] discoverChangedSpecs: skipping large file (${fileSize} bytes) ${abs_path}`;
      if (typeof logger.warn === 'function') {
        logger.warn(warnMsg);
      } else {
        logger.info(`[WARN] ${warnMsg}`);
      }
      return null;
    }

    try {
      const buf = Buffer.alloc(fileSize);
      let read = 0;
      while (read < fileSize) {
        const n = readSync(fd, buf, read, fileSize - read, null);
        if (n === 0) break;
        read += n;
      }
      return read === fileSize ? buf : buf.subarray(0, read);
    } catch (err) {
      logger.error(`[anytime-memory] discoverChangedSpecs: failed to read file ${abs_path}`, err);
      return null;
    }
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch (err) {
        logger.warn?.(
          `[anytime-memory] discoverChangedSpecs: failed to close fd for ${abs_path}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Discover spec Markdown files under specRoot that are new or have changed
 * (by comparing sha1 source_hash against memory_spec_documents table).
 *
 * Side effects: reads files from disk, queries DB. Never writes.
 */
export async function discoverChangedSpecs(input: DiscoverInput): Promise<ChangedSpec[]> {
  const { specRoot, db, logger } = input;

  let allEntries: string[];
  try {
    allEntries = readdirSync(specRoot, { recursive: true }) as string[];
  } catch (err) {
    logger.error(
      `[anytime-memory] discoverChangedSpecs: failed to read specRoot ${specRoot}`,
      err,
    );
    throw err;
  }

  const mdFiles = allEntries.filter((entry) => {
    if (typeof entry !== 'string' || extname(entry) !== '.md') return false;
    const normalized = entry.replaceAll('\\', '/');
    return !EXCLUDED_DIR_PREFIXES.some((p) => normalized.startsWith(p));
  });

  const results: ChangedSpec[] = [];
  const stmt = db.prepare('SELECT source_hash FROM memory_spec_documents WHERE rel_path = ?');

  try {
    for (const rel of mdFiles) {
      const abs_path = join(specRoot, rel);

      // openSync → fstatSync(fd) → readSync で同一 fd を使い、stat→read 間の
      // TOCTOU (CodeQL `js/file-system-race`) を回避する。
      const content = readFileContent(abs_path, logger);
      if (content === null) continue;

      const source_hash = createHash('sha1').update(content).digest('hex');
      const rel_path = rel.replaceAll('\\', '/'); // normalize path separators on Windows

      const row = stmt.get(rel_path);
      const existingHash = row ? (typeof row['source_hash'] === 'string' ? row['source_hash'] : null) : null;

      if (existingHash === null) {
        results.push({ rel_path, abs_path, source_hash, is_new: true });
      } else if (existingHash !== source_hash) {
        results.push({ rel_path, abs_path, source_hash, is_new: false });
      }
    }
  } finally {
    stmt.free?.();
  }

  return results;
}
