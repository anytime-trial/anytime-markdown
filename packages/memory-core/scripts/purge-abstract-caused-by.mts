/**
 * 一回限りの migration:
 * `caused_by` predicate を持ち object が Concept / Decision / Rule / Person /
 * Project / Question / Task / Skill 型の memory_edges を valid_to=now で無効化し、
 * memory_edge_invalidations に reason='abstract_root_cause_purge' で記録する。
 *
 * これにより detectRecurringRootCauses が次回実行されたとき、対応する drift
 * (例: drift:<abstract-entity>:caused_by:recurring_root_cause) は candidates
 * に出ず、reportDriftEvents の autoResolveStale により自動で resolved になる。
 *
 * 引数で TRAIL_HOME (= <dir>/db/memory-core.db のあるディレクトリの親) を指定する。
 * 例: node --experimental-strip-types scripts/purge-abstract-caused-by.mts /anytime-markdown/.anytime/trail
 *
 * 実行前に DB バックアップを推奨:
 *   cp /anytime-markdown/.anytime/trail/db/memory-core.db \
 *      /anytime-markdown/.anytime/trail/db/memory-core.db.before-purge
 */
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { openMemoryCoreDb } from '../src/db/connection';

const ABSTRACT_OBJECT_TYPES = ['Concept', 'Decision', 'Rule', 'Person', 'Project', 'Question', 'Task', 'Skill'];
const REASON = 'abstract_root_cause_purge';

const trailHome = process.argv[2];
if (!trailHome) {
  console.error('Usage: purge-abstract-caused-by.mts <TRAIL_HOME>');
  process.exit(1);
}
const memoryDbPath = path.join(trailHome, 'db', 'memory-core.db');
if (!fs.existsSync(memoryDbPath)) {
  console.error(`memory-core.db not found at ${memoryDbPath}`);
  process.exit(1);
}

console.log(`[purge] memory-core: ${memoryDbPath}`);

const { db, close } = await openMemoryCoreDb(memoryDbPath);

const placeholders = ABSTRACT_OBJECT_TYPES.map(() => '?').join(', ');

const beforeRows = db.exec(
  `SELECT COUNT(*) AS active_caused_by FROM memory_edges
   WHERE predicate = 'caused_by' AND valid_to IS NULL`,
);
const activeBefore = (beforeRows[0]?.values[0]?.[0] as number) ?? 0;

const targetRows = db.exec(
  `SELECT e.id FROM memory_edges e
   JOIN memory_entities ent ON ent.id = e.object_entity_id
   WHERE e.predicate = 'caused_by'
     AND e.valid_to IS NULL
     AND ent.type IN (${placeholders})`,
  ABSTRACT_OBJECT_TYPES,
);
const targetIds = (targetRows[0]?.values ?? []).map((r) => r[0] as string);

console.log(`[purge] active caused_by edges BEFORE: ${activeBefore}`);
console.log(`[purge] targets (object.type in ${ABSTRACT_OBJECT_TYPES.join(', ')}): ${targetIds.length}`);

if (targetIds.length === 0) {
  console.log('[purge] nothing to do');
  close();
  process.exit(0);
}

const recordedAt = new Date().toISOString();

let invalidated = 0;
for (const edgeId of targetIds) {
  try {
    db.run(`UPDATE memory_edges SET valid_to = ? WHERE id = ?`, [recordedAt, edgeId]);
    const invalidationId = createHash('sha1')
      .update(`${edgeId}:${recordedAt}:${REASON}`)
      .digest('hex')
      .slice(0, 16);
    db.run(
      `INSERT INTO memory_edge_invalidations (id, edge_id, invalidated_at, reason, superseding_edge_id, detail)
       VALUES (?, ?, ?, ?, NULL, '')`,
      [invalidationId, edgeId, recordedAt, REASON],
    );
    invalidated++;
  } catch (err) {
    console.error(`[purge] failed for edge_id=${edgeId}: ${String(err)}`);
  }
}

const afterRows = db.exec(
  `SELECT COUNT(*) AS active_caused_by FROM memory_edges
   WHERE predicate = 'caused_by' AND valid_to IS NULL`,
);
const activeAfter = (afterRows[0]?.values[0]?.[0] as number) ?? 0;

console.log(`[purge] invalidated: ${invalidated}`);
console.log(`[purge] active caused_by edges AFTER: ${activeAfter}`);
console.log(`[purge] done. Next drift_detection pipeline run will auto-resolve stale recurring_root_cause drifts.`);

close();
