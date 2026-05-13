// Manual elements REST API integration tests
const sqlAsmActual = require(require.resolve('sql.js/dist/sql-asm.js')); // eslint-disable-line @typescript-eslint/no-require-imports
(global as Record<string, unknown>).__non_webpack_require__ = (_path: string) => sqlAsmActual;

jest.mock('ws', () => ({ WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })) }));
jest.mock('@anytime-markdown/trail-core/c4', () => ({ fetchC4Model: jest.fn() }));

import { TrailDatabase } from '@anytime-markdown/trail-db';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';

describe('manual elements REST API', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', db);
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('POST /api/c4/manual-elements creates element (201)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/manual-elements?repoName=test-repo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'person', name: 'Admin', external: false, parentId: null }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { element: { id: string } };
    expect(body.element.id).toBe('person_1');
    expect(db.getManualElements('test-repo')).toHaveLength(1);
  });

  it('POST invalid type returns 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/manual-elements?repoName=test-repo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'invalid', name: 'X', external: false, parentId: null }),
    });
    expect(res.status).toBe(400);
  });

  it('PATCH /api/c4/manual-elements/:id updates element', async () => {
    const id = db.saveManualElement('test-repo', { type: 'person', name: 'Old', external: false, parentId: null });
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/manual-elements/${id}?repoName=test-repo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New' }),
    });
    expect(res.status).toBe(200);
    expect(db.getManualElements('test-repo')[0].name).toBe('New');
  });

  it('DELETE /api/c4/manual-elements/:id cascades relationships', async () => {
    const a = db.saveManualElement('test-repo', { type: 'person', name: 'A', external: false, parentId: null });
    const b = db.saveManualElement('test-repo', { type: 'system', name: 'B', external: false, parentId: null });
    db.saveManualRelationship('test-repo', { fromId: a, toId: b });
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/manual-elements/${a}?repoName=test-repo`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(204);
    expect(db.getManualRelationships('test-repo')).toHaveLength(0);
  });
});
