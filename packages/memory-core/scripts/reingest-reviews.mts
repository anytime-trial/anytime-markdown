/**
 * Re-ingest all review_doc + session reviews with force flag enabled.
 *
 * 引数で TRAIL_HOME (= <dir>/db/memory-core.db のあるディレクトリの親) を指定する。
 * 例: node --experimental-strip-types scripts/reingest-reviews.mts /tmp/reingest-test
 *
 * 必須前提: ollama (qwen2.5:7b) が host.docker.internal:11434 で稼働
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import { openMemoryCoreDb } from '../src/db/connection';
import { attachTrailDbReadOnly } from '../src/db/attach';
import { runReviewIncremental } from '../src/pipeline/runReviewIncremental';
import { createOllamaClient } from '@anytime-markdown/agent-core';

const trailHome = process.argv[2];
if (!trailHome) {
  console.error('Usage: reingest-reviews.mts <TRAIL_HOME>');
  process.exit(1);
}
const memoryDbPath = path.join(trailHome, 'db', 'memory-core.db');
const trailDbPath = path.join(trailHome, 'db', 'trail.db');
const reviewDir = process.env['MEMORY_CORE_REVIEW_DIR'] ?? '/Shared/anytime-markdown-docs/review';

if (!fs.existsSync(memoryDbPath)) {
  console.error(`memory-core.db not found at ${memoryDbPath}`);
  process.exit(1);
}
if (!fs.existsSync(trailDbPath)) {
  console.error(`trail.db not found at ${trailDbPath}`);
  process.exit(1);
}

console.log(`[reingest] memory-core: ${memoryDbPath}`);
console.log(`[reingest] trail: ${trailDbPath}`);
console.log(`[reingest] reviewDir: ${reviewDir}`);

const { db, close } = await openMemoryCoreDb(memoryDbPath);
await attachTrailDbReadOnly(db, trailDbPath);

const ollama = createOllamaClient({ baseUrl: 'http://host.docker.internal:11434' });

const countBefore = db.exec(
  `SELECT r.source_kind, COUNT(rf.id) AS findings
   FROM memory_reviews r LEFT JOIN memory_review_findings rf ON rf.review_id=r.id
   GROUP BY r.source_kind ORDER BY r.source_kind`,
);
console.log('\n[reingest] BEFORE:');
for (const row of countBefore[0]?.values ?? []) {
  console.log(`  ${row[0]}: ${row[1]} findings`);
}

const result = await runReviewIncremental({
  db,
  repoName: 'anytime-markdown',
  reviewDir,
  ollama,
  model: 'qwen2.5:7b',
  force: true,
  logger: {
    debug: (msg: string) => {},
    info: (msg: string) => console.log(`[info] ${msg}`),
    warn: (msg: string) => console.log(`[warn] ${msg}`),
    error: (msg: string, err?: unknown) =>
      console.error(`[error] ${msg}`, err instanceof Error ? err.stack : err),
  },
});

console.log('\n[reingest] RESULT:', JSON.stringify(result, null, 2));

const countAfter = db.exec(
  `SELECT r.source_kind, COUNT(rf.id) AS findings
   FROM memory_reviews r LEFT JOIN memory_review_findings rf ON rf.review_id=r.id
   GROUP BY r.source_kind ORDER BY r.source_kind`,
);
console.log('\n[reingest] AFTER:');
for (const row of countAfter[0]?.values ?? []) {
  console.log(`  ${row[0]}: ${row[1]} findings`);
}

close();
console.log('\n[reingest] done');
