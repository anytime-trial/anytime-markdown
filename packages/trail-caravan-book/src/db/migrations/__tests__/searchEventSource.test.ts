import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openCaravanBookDb } from '../../connection';
import type { CaravanBookDb } from '../../connection';

/**
 * migration 032（caravan_search_events への source / origin / hit_entity_ids 追加）。
 * screen spec: trail-viewer-screen-knowledge-graph.ja.md §2.5。
 */
describe('migration 032: search_event_source', () => {
  let tmpDir: string;
  let handle: CaravanBookDb;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig032-test-'));
    handle = await openCaravanBookDb(path.join(tmpDir, 'caravan-book.db'));
  });

  afterEach(() => {
    handle.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function insert(row: {
    id: string;
    kind?: string;
    source?: string;
    origin?: string | null;
    hitEntityIds?: string | null;
  }): void {
    handle.db.run(
      `INSERT INTO caravan_search_events (id, occurred_at, kind, query, source, origin, hit_entity_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        '2026-08-10T00:00:00.000Z',
        row.kind ?? 'search',
        'q',
        row.source ?? 'screen',
        row.origin ?? null,
        row.hitEntityIds ?? null,
      ],
    );
  }

  it('source / origin / hit_entity_ids 列を持つ', () => {
    const cols = handle.db
      .prepare(`SELECT name FROM pragma_table_info('caravan_search_events')`)
      .all()
      .map((c) => String(c['name']));
    expect(cols).toEqual(
      expect.arrayContaining(['source', 'origin', 'hit_entity_ids']),
    );
  });

  it('旧形状の INSERT（新列なし）は source=screen の既定で通る', () => {
    handle.db.run(
      `INSERT INTO caravan_search_events (id, occurred_at, kind, query) VALUES ('legacy', '2026-08-10T00:00:00Z', 'search', 'q')`,
    );
    const row = handle.db
      .prepare(`SELECT source, origin FROM caravan_search_events WHERE id = 'legacy'`)
      .all()[0];
    expect(row).toEqual({ source: 'screen', origin: null });
  });

  it('agent 照会をヒット ID 付きで記録できる', () => {
    insert({ id: 'a1', source: 'agent', hitEntityIds: JSON.stringify(['e1', 'e2']) });
    const count = handle.db
      .prepare(`SELECT COUNT(*) AS n FROM caravan_search_events WHERE source = 'agent'`)
      .all()[0];
    expect(count?.['n']).toBe(1);
  });

  it('列挙外の source / origin と非 JSON の hit_entity_ids は CHECK で拒否する', () => {
    expect(() => insert({ id: 'x1', source: 'webhook' })).toThrow();
    expect(() => insert({ id: 'x2', origin: 'toolbar' })).toThrow();
    expect(() => insert({ id: 'x3', hitEntityIds: 'not-json' })).toThrow();
  });

  it('origin の列挙値（search / citation / agent_history）を受け付ける', () => {
    insert({ id: 'o1', kind: 'ego_open', origin: 'search' });
    insert({ id: 'o2', kind: 'ego_open', origin: 'citation' });
    insert({ id: 'o3', kind: 'ego_open', origin: 'agent_history' });
    const count = handle.db
      .prepare(`SELECT COUNT(*) AS n FROM caravan_search_events WHERE origin IS NOT NULL`)
      .all()[0];
    expect(count?.['n']).toBe(3);
  });
});
