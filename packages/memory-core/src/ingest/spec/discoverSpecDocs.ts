import { readdirSync, readFileSync, statSync } from 'node:fs';
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

  const mdFiles = allEntries.filter(
    (entry) => typeof entry === 'string' && extname(entry) === '.md',
  );

  const results: ChangedSpec[] = [];
  const stmt = db.prepare('SELECT source_hash FROM memory_spec_documents WHERE rel_path = ?');

  try {
    for (const rel of mdFiles) {
      const abs_path = join(specRoot, rel);

      // Check file size before reading
      let fileSize: number;
      try {
        const stat = statSync(abs_path);
        fileSize = stat.size;
      } catch (err) {
        logger.error(
          `[anytime-memory] discoverChangedSpecs: failed to stat file ${abs_path}`,
          err,
        );
        continue;
      }

      if (fileSize > MAX_FILE_BYTES) {
        const warnMsg = `[anytime-memory] discoverChangedSpecs: skipping large file (${fileSize} bytes) ${rel}`;
        if (typeof logger.warn === 'function') {
          logger.warn(warnMsg);
        } else {
          logger.info(`[WARN] ${warnMsg}`);
        }
        continue;
      }

      let content: Buffer;
      try {
        content = readFileSync(abs_path);
      } catch (err) {
        logger.error(
          `[anytime-memory] discoverChangedSpecs: failed to read file ${abs_path}`,
          err,
        );
        continue;
      }

      const source_hash = createHash('sha1').update(content).digest('hex');
      const rel_path = rel.replace(/\\/g, '/'); // normalize path separators on Windows

      // Query DB for existing hash
      const row = stmt.get(rel_path);
      let existingHash: string | null = null;
      if (row) {
        const val = row['source_hash'];
        existingHash = typeof val === 'string' ? val : null;
      }

      if (existingHash === null) {
        // Not found in DB → new file
        results.push({ rel_path, abs_path, source_hash, is_new: true });
      } else if (existingHash !== source_hash) {
        // Found but hash changed
        results.push({ rel_path, abs_path, source_hash, is_new: false });
      }
      // else: hash matches → skip (no change)
    }
  } finally {
    stmt.free?.();
  }

  return results;
}
