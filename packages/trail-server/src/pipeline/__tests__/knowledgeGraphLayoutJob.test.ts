import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  BetterSqlite3CaravanDb,
  runMigrations,
  type CaravanBookDb,
  type CaravanDbConnection,
} from '@anytime-markdown/trail-caravan-book';
import type { Logger } from '../../runtime/Logger';
import {
  KNOWLEDGE_GRAPH_LAYOUT_JOB_ID,
  createKnowledgeGraphLayoutJob,
} from '../knowledgeGraphLayoutJob';

const TS = '2026-08-08T00:00:00.000Z';

function createLogger(): Logger {
  const logger: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: () => logger,
  };
  return logger;
}

function insertEntity(db: CaravanDbConnection, id: string): void {
  db.run(
    `INSERT INTO caravan_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, ?, ?, ?, ?)`,
    [id, id, id, TS, TS, TS],
  );
}

function insertEdge(db: CaravanDbConnection, id: string, subject: string, object: string): void {
  db.run(
    `INSERT INTO caravan_edges
       (id, subject_entity_id, predicate, object_entity_id, valid_from, recorded_at,
        source_type, source_ref, confidence, confidence_label, modality)
     VALUES (?, ?, 'relates_to', ?, ?, ?, 'code', 'test', 1.0, 'EXTRACTED', 'asserted')`,
    [id, subject, object, TS, TS],
  );
}

describe('createKnowledgeGraphLayoutJob', () => {
  let tmpDir: string;
  let sqlite: BetterSqlite3CaravanDb;
  let closed: number;
  let opened: number;

  const openDb = async (): Promise<CaravanBookDb> => {
    opened += 1;
    return {
      db: sqlite,
      conn: sqlite,
      save: () => undefined,
      close: () => {
        closed += 1;
      },
    };
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-layout-job-'));
    sqlite = new BetterSqlite3CaravanDb({ filePath: path.join(tmpDir, 'caravan-book.db') });
    sqlite.run('PRAGMA foreign_keys = ON');
    runMigrations(sqlite);
    for (const id of ['a', 'b', 'c']) insertEntity(sqlite, id);
    insertEdge(sqlite, 'e1', 'a', 'b');
    insertEdge(sqlite, 'e2', 'b', 'c');
    insertEdge(sqlite, 'e3', 'c', 'a');
    opened = 0;
    closed = 0;
  });

  afterEach(() => {
    sqlite.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createJob(overrides: { intervalMs?: number; startupDelayMs?: number } = {}) {
    return createKnowledgeGraphLayoutJob({
      caravanDbPath: path.join(tmpDir, 'caravan-book.db'),
      logger: createLogger(),
      openDb,
      now: () => new Date(TS),
      ...overrides,
    });
  }

  it('computes the layout and reports node / edge counts as metrics', async () => {
    const handle = createJob();

    const result = await handle.job.run();

    expect(handle.job.id).toBe(KNOWLEDGE_GRAPH_LAYOUT_JOB_ID);
    expect(handle.job.runOnStart).toBe(true);
    expect(result.status).toBe('ok');
    expect(result.metrics).toEqual({ nodes: 3, edges: 3, communities: 1 });
    const stored = sqlite.exec(`SELECT COUNT(*) FROM caravan_entity_layout`)[0]?.values[0][0];
    expect(Number(stored)).toBe(3);
  });

  it('reports skipped without recomputing while the graph is unchanged', async () => {
    const handle = createJob();

    await handle.job.run();
    const second = await handle.job.run();

    expect(second.status).toBe('skipped');
    expect(second.message).toBe('graph unchanged');
  });

  it('opens the caravan-book.db once and reuses it across runs', async () => {
    const handle = createJob();

    await handle.job.run();
    await handle.job.run();

    expect(opened).toBe(1);
  });

  it('closes the connection on dispose and stops running afterwards', async () => {
    const handle = createJob();
    await handle.job.run();

    handle.dispose();
    const afterDispose = await handle.job.run();

    expect(closed).toBe(1);
    expect(afterDispose.status).toBe('skipped');
    expect(afterDispose.message).toBe('disposed');
  });

  it('rejects when the database cannot be opened so the scheduler logs a failure', async () => {
    const handle = createKnowledgeGraphLayoutJob({
      caravanDbPath: path.join(tmpDir, 'caravan-book.db'),
      logger: createLogger(),
      openDb: () => Promise.reject(new Error('open failed')),
    });

    await expect(handle.job.run()).rejects.toThrow('open failed');
  });

  it('honours an explicit interval and startup delay', () => {
    const handle = createJob({ intervalMs: 0, startupDelayMs: 0 });

    expect(handle.job.intervalMs).toBe(0);
    expect(handle.job.startupDelayMs).toBe(0);
  });
});
