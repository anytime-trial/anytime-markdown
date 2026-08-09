/**
 * caravan_bug_fixes 因果 3 列（body_excerpt / root_cause_episode_id /
 * introduced_commit_sha）の operator 駆動バックフィル（spec memory-core §6.7）。
 *
 * 冪等。実行前に DB バックアップを推奨:
 *   cp <TRAIL_HOME>/db/caravan-book.db <TRAIL_HOME>/db/caravan-book.db.before-causality
 *
 * 使い方:
 *   node --experimental-strip-types scripts/run-causality-backfill.mts \
 *     <TRAIL_HOME> <repoName> <repoRoot> [--skip-introduced] [--introduced-limit=N]
 * 例:
 *   node --experimental-strip-types scripts/run-causality-backfill.mts \
 *     /anytime-markdown/.anytime/trail anytime-markdown /anytime-markdown
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import { openCaravanBookDb } from '../src/db/connection';
import { attachTrailDbReadOnly } from '../src/db/attach';
import { runBugFixCausalityBackfill } from '../src/pipeline/runBugFixCausalityBackfill';
import type { CaravanLogger } from '../src/logger';

const consoleLogger: CaravanLogger = {
  info: (message) => console.log(`[${new Date().toISOString()}] [INFO] ${message}`),
  error: (message, error) => {
    const stack = error instanceof Error ? (error.stack ?? String(error)) : error === undefined ? '' : String(error);
    console.error(`[${new Date().toISOString()}] [ERROR] ${message}${stack ? `\n${stack}` : ''}`);
  },
  warn: (message) => console.warn(`[${new Date().toISOString()}] [WARN] ${message}`),
};

const [trailHome, repoName, repoRoot, ...flags] = process.argv.slice(2);
if (!trailHome || !repoName || !repoRoot) {
  console.error('Usage: run-causality-backfill.mts <TRAIL_HOME> <repoName> <repoRoot> [--skip-introduced] [--introduced-limit=N]');
  process.exit(1);
}
const caravanDbPath = path.join(trailHome, 'db', 'caravan-book.db');
const activityDbPath = path.join(trailHome, 'db', 'activity.db');
for (const p of [caravanDbPath, activityDbPath]) {
  if (!fs.existsSync(p)) {
    console.error(`not found: ${p}`);
    process.exit(1);
  }
}
const skipIntroduced = flags.includes('--skip-introduced');
const limitFlag = flags.find((f) => f.startsWith('--introduced-limit='));
const introducedLimit = limitFlag ? Number(limitFlag.split('=')[1]) : undefined;

console.log(`[causality-backfill] caravan: ${caravanDbPath}`);
console.log(`[causality-backfill] activity: ${activityDbPath} (read-only attach)`);

const { db, close } = await openCaravanBookDb(caravanDbPath);
try {
  await attachTrailDbReadOnly(db, activityDbPath);
  const result = runBugFixCausalityBackfill({
    db,
    repoName,
    repoRoot,
    inferIntroduced: !skipIntroduced,
    introducedLimit,
    logger: consoleLogger,
  });
  console.log(`[causality-backfill] ${JSON.stringify(result, null, 2)}`);
} finally {
  close();
}
