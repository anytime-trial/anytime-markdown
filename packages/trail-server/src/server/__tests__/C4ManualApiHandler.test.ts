import { EventEmitter } from 'node:events';
import type * as http from 'node:http';

import { C4ManualApiHandler } from '../C4ManualApiHandler';
import type { C4ManualApiNotifier } from '../C4ManualApiHandler';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRes() {
  let statusCode = 0;
  const bodyChunks: string[] = [];
  const res = {
    writeHead: jest.fn((code: number) => { statusCode = code; }),
    end: jest.fn((data?: string) => { if (data) bodyChunks.push(data); }),
    get statusCode() { return statusCode; },
    get body() { return bodyChunks.join(''); },
    parsedBody() { return JSON.parse(bodyChunks.join('')); },
  } as unknown as http.ServerResponse & {
    statusCode: number;
    body: string;
    parsedBody(): unknown;
  };
  return res;
}

function makeReq(body: unknown): http.IncomingMessage {
  const emitter = new EventEmitter() as http.IncomingMessage;
  process.nextTick(() => {
    emitter.emit('data', Buffer.from(JSON.stringify(body)));
    emitter.emit('end');
  });
  return emitter;
}

function makeReqWithError(): http.IncomingMessage {
  const emitter = new EventEmitter() as http.IncomingMessage;
  process.nextTick(() => {
    emitter.emit('error', new Error('connection reset'));
  });
  return emitter;
}

function makeNotifier(): C4ManualApiNotifier & { modelUpdated: number; graphUpdated: number } {
  let modelUpdated = 0;
  let graphUpdated = 0;
  return {
    get modelUpdated() { return modelUpdated; },
    get graphUpdated() { return graphUpdated; },
    notifyModelUpdated: () => { modelUpdated++; },
    notifyCodeGraphUpdated: () => { graphUpdated++; },
    refreshCodeGraphCache: async () => { /* noop */ },
  };
}

function makeLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(),
  };
}

function makeUrl(path: string, params: Record<string, string> = {}): URL {
  const url = new URL(`http://localhost${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('C4ManualApiHandler', () => {
  let db: TrailDatabase;
  let handler: C4ManualApiHandler;
  let notifier: ReturnType<typeof makeNotifier>;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    notifier = makeNotifier();
    handler = new C4ManualApiHandler(db, notifier, makeLogger());
  });

  afterEach(() => {
    db.close();
  });

  // -------------------------------------------------------------------------
  //  createElement
  // -------------------------------------------------------------------------

  describe('createElement', () => {
    it('creates an element and returns 201', async () => {
      const req = makeReq({ type: 'person', name: 'Alice', external: false, parentId: null });
      const res = makeRes();
      await handler.createElement(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-elements', { repoName: 'test-repo' }));
      expect(res.statusCode).toBe(201);
      const body = res.parsedBody() as { element: { id: string; name: string } };
      expect(body.element.name).toBe('Alice');
      expect(notifier.modelUpdated).toBe(1);
    });

    it('returns 400 when repoName is missing', async () => {
      const req = makeReq({ type: 'person', name: 'X', external: false, parentId: null });
      const res = makeRes();
      await handler.createElement(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-elements'));
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when body has invalid type', async () => {
      const req = makeReq({ type: 'invalid', name: 'X', external: false, parentId: null });
      const res = makeRes();
      await handler.createElement(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-elements', { repoName: 'r' }));
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when name is empty', async () => {
      const req = makeReq({ type: 'person', name: '', external: false, parentId: null });
      const res = makeRes();
      await handler.createElement(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-elements', { repoName: 'r' }));
      expect(res.statusCode).toBe(400);
    });

    it('rejects on JSON parse error', async () => {
      const emitter = new EventEmitter() as http.IncomingMessage;
      process.nextTick(() => {
        emitter.emit('data', Buffer.from('not-json'));
        emitter.emit('end');
      });
      const res = makeRes();
      await expect(
        handler.createElement(emitter, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-elements', { repoName: 'r' })),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  //  updateElement
  // -------------------------------------------------------------------------

  describe('updateElement', () => {
    it('updates element and returns 200', async () => {
      const id = db.saveManualElement('test-repo', { type: 'person', name: 'Old', external: false, parentId: null });
      const req = makeReq({ name: 'New' });
      const res = makeRes();
      await handler.updateElement(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-elements', { repoName: 'test-repo' }), id);
      expect(res.statusCode).toBe(200);
      const body = res.parsedBody() as { element: { name: string } };
      expect(body.element.name).toBe('New');
      expect(notifier.modelUpdated).toBe(1);
    });

    it('returns 400 when repoName missing', async () => {
      const req = makeReq({ name: 'X' });
      const res = makeRes();
      await handler.updateElement(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-elements'), 'any-id');
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 when element does not exist', async () => {
      const req = makeReq({ name: 'X' });
      const res = makeRes();
      await handler.updateElement(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-elements', { repoName: 'r' }), 'nonexistent');
      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  //  deleteElement
  // -------------------------------------------------------------------------

  describe('deleteElement', () => {
    it('deletes element and returns 204', () => {
      const id = db.saveManualElement('test-repo', { type: 'system', name: 'Sys', external: false, parentId: null });
      const res = makeRes();
      handler.deleteElement(res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-elements', { repoName: 'test-repo' }), id);
      expect(res.statusCode).toBe(204);
      expect(db.getManualElements('test-repo')).toHaveLength(0);
      expect(notifier.modelUpdated).toBe(1);
    });

    it('returns 400 when repoName missing', () => {
      const res = makeRes();
      handler.deleteElement(res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-elements'), 'any-id');
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  //  createRelationship
  // -------------------------------------------------------------------------

  describe('createRelationship', () => {
    it('creates a relationship and returns 201', async () => {
      const a = db.saveManualElement('r', { type: 'person', name: 'A', external: false, parentId: null });
      const b = db.saveManualElement('r', { type: 'system', name: 'B', external: false, parentId: null });
      const req = makeReq({ fromId: a, toId: b, label: 'uses', technology: 'HTTP' });
      const res = makeRes();
      await handler.createRelationship(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-relationships', { repoName: 'r' }));
      expect(res.statusCode).toBe(201);
      const body = res.parsedBody() as { relationship: { fromId: string } };
      expect(body.relationship.fromId).toBe(a);
      expect(notifier.modelUpdated).toBe(1);
    });

    it('returns 400 when fromId or toId missing', async () => {
      const req = makeReq({ fromId: 'x' });
      const res = makeRes();
      await handler.createRelationship(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-relationships', { repoName: 'r' }));
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when repoName missing', async () => {
      const req = makeReq({ fromId: 'x', toId: 'y' });
      const res = makeRes();
      await handler.createRelationship(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-relationships'));
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  //  listRelationships
  // -------------------------------------------------------------------------

  describe('listRelationships', () => {
    it('returns empty list when no relationships', () => {
      const res = makeRes();
      handler.listRelationships(res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-relationships', { repoName: 'r' }));
      expect(res.statusCode).toBe(200);
      expect(res.parsedBody()).toEqual([]);
    });

    it('returns 400 when repoName missing', () => {
      const res = makeRes();
      handler.listRelationships(res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-relationships'));
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  //  deleteRelationship
  // -------------------------------------------------------------------------

  describe('deleteRelationship', () => {
    it('deletes relationship and returns 204', () => {
      const a = db.saveManualElement('r', { type: 'person', name: 'A', external: false, parentId: null });
      const b = db.saveManualElement('r', { type: 'system', name: 'B', external: false, parentId: null });
      const relId = db.saveManualRelationship('r', { fromId: a, toId: b });
      const res = makeRes();
      handler.deleteRelationship(res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-relationships', { repoName: 'r' }), relId);
      expect(res.statusCode).toBe(204);
      expect(db.getManualRelationships('r')).toHaveLength(0);
    });

    it('returns 400 when repoName missing', () => {
      const res = makeRes();
      handler.deleteRelationship(res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-relationships'), 'rel1');
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  //  Groups
  // -------------------------------------------------------------------------

  describe('listGroups', () => {
    it('returns empty list', () => {
      const res = makeRes();
      handler.listGroups(res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-groups', { repoName: 'r' }));
      expect(res.statusCode).toBe(200);
      expect(res.parsedBody()).toEqual([]);
    });

    it('returns 400 when repoName missing', () => {
      const res = makeRes();
      handler.listGroups(res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-groups'));
      expect(res.statusCode).toBe(400);
    });
  });

  describe('createGroup', () => {
    it('creates group and returns 201', async () => {
      const a = db.saveManualElement('r', { type: 'person', name: 'A', external: false, parentId: null });
      const b = db.saveManualElement('r', { type: 'system', name: 'B', external: false, parentId: null });
      const req = makeReq({ memberIds: [a, b], label: 'Group1' });
      const res = makeRes();
      await handler.createGroup(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-groups', { repoName: 'r' }));
      expect(res.statusCode).toBe(201);
      const body = res.parsedBody() as { group: { id: string } };
      expect(body.group.id).toBeDefined();
      expect(notifier.modelUpdated).toBe(1);
    });

    it('returns 400 when memberIds < 2', async () => {
      const req = makeReq({ memberIds: ['only-one'] });
      const res = makeRes();
      await handler.createGroup(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-groups', { repoName: 'r' }));
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when repoName missing', async () => {
      const req = makeReq({ memberIds: ['a', 'b'] });
      const res = makeRes();
      await handler.createGroup(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-groups'));
      expect(res.statusCode).toBe(400);
    });
  });

  describe('updateGroup', () => {
    it('updates group label and returns 204', async () => {
      const a = db.saveManualElement('r', { type: 'person', name: 'A', external: false, parentId: null });
      const b = db.saveManualElement('r', { type: 'system', name: 'B', external: false, parentId: null });
      const groupId = db.saveManualGroup('r', { memberIds: [a, b], label: 'Old' });
      const req = makeReq({ label: 'New' });
      const res = makeRes();
      await handler.updateGroup(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-groups', { repoName: 'r' }), groupId);
      expect(res.statusCode).toBe(204);
      expect(notifier.modelUpdated).toBe(1);
    });

    it('supports null label (remove label)', async () => {
      const a = db.saveManualElement('r', { type: 'person', name: 'A', external: false, parentId: null });
      const b = db.saveManualElement('r', { type: 'system', name: 'B', external: false, parentId: null });
      const groupId = db.saveManualGroup('r', { memberIds: [a, b], label: 'OldLabel' });
      const req = makeReq({ label: null });
      const res = makeRes();
      await handler.updateGroup(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-groups', { repoName: 'r' }), groupId);
      expect(res.statusCode).toBe(204);
    });

    it('returns 400 when repoName missing', async () => {
      const req = makeReq({ label: 'X' });
      const res = makeRes();
      await handler.updateGroup(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-groups'), 'gid');
      expect(res.statusCode).toBe(400);
    });
  });

  describe('deleteGroup', () => {
    it('deletes group and returns 204', () => {
      const a = db.saveManualElement('r', { type: 'person', name: 'A', external: false, parentId: null });
      const b = db.saveManualElement('r', { type: 'system', name: 'B', external: false, parentId: null });
      const groupId = db.saveManualGroup('r', { memberIds: [a, b] });
      const res = makeRes();
      handler.deleteGroup(res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-groups', { repoName: 'r' }), groupId);
      expect(res.statusCode).toBe(204);
      expect(db.getManualGroups('r')).toHaveLength(0);
    });

    it('returns 400 when repoName missing', () => {
      const res = makeRes();
      handler.deleteGroup(res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-groups'), 'gid');
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  //  Communities
  // -------------------------------------------------------------------------

  describe('listCommunities', () => {
    it('returns communities list', () => {
      const res = makeRes();
      handler.listCommunities(res as unknown as http.ServerResponse, makeUrl('/api/c4/communities', { repoName: 'r' }));
      expect(res.statusCode).toBe(200);
      const body = res.parsedBody() as { communities: unknown[] };
      expect(Array.isArray(body.communities)).toBe(true);
    });

    it('accepts repo query param as alias', () => {
      const res = makeRes();
      handler.listCommunities(res as unknown as http.ServerResponse, makeUrl('/api/c4/communities', { repo: 'r' }));
      expect(res.statusCode).toBe(200);
    });

    it('returns 400 when neither repoName nor repo provided', () => {
      const res = makeRes();
      handler.listCommunities(res as unknown as http.ServerResponse, makeUrl('/api/c4/communities'));
      expect(res.statusCode).toBe(400);
    });
  });

  describe('upsertCommunitySummaries', () => {
    it('returns 400 when repoName missing in body and query', async () => {
      const req = makeReq({ summaries: [] });
      const res = makeRes();
      await handler.upsertCommunitySummaries(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/communities/summaries'));
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when summaries not an array', async () => {
      const req = makeReq({ repoName: 'r', summaries: 'not-array' });
      const res = makeRes();
      await handler.upsertCommunitySummaries(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/communities/summaries'));
      expect(res.statusCode).toBe(400);
    });

    it('accepts repoName from query param', async () => {
      const req = makeReq({ summaries: [] });
      const res = makeRes();
      await handler.upsertCommunitySummaries(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/communities/summaries', { repoName: 'r' }));
      expect(res.statusCode).toBe(200);
    });

    it('accepts repo alias in query', async () => {
      const req = makeReq({ summaries: [] });
      const res = makeRes();
      await handler.upsertCommunitySummaries(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/communities/summaries', { repo: 'r' }));
      expect(res.statusCode).toBe(200);
    });
  });

  describe('upsertCommunityMappings', () => {
    it('returns 400 when repoName missing', async () => {
      const req = makeReq({ mappings: [] });
      const res = makeRes();
      await handler.upsertCommunityMappings(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/communities/mappings'));
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when mappings not an array', async () => {
      const req = makeReq({ repoName: 'r', mappings: 'not-array' });
      const res = makeRes();
      await handler.upsertCommunityMappings(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/communities/mappings'));
      expect(res.statusCode).toBe(400);
    });

    it('upserts mappings successfully', async () => {
      const req = makeReq({ repoName: 'r', mappings: [] });
      const res = makeRes();
      await handler.upsertCommunityMappings(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/communities/mappings'));
      expect(res.statusCode).toBe(200);
      expect(notifier.modelUpdated).toBe(1);
      expect(notifier.graphUpdated).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  //  isValidElementInput edge cases
  // -------------------------------------------------------------------------

  describe('element input validation via createElement', () => {
    it('accepts all valid element types', async () => {
      for (const type of ['person', 'system', 'container', 'component']) {
        const req = makeReq({ type, name: 'N', external: false, parentId: null });
        const res = makeRes();
        await handler.createElement(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-elements', { repoName: 'r' }));
        expect(res.statusCode).toBe(201);
      }
    });

    it('rejects when body is not an object', async () => {
      const req = makeReq(null);
      const res = makeRes();
      await handler.createElement(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-elements', { repoName: 'r' }));
      expect(res.statusCode).toBe(400);
    });

    it('rejects when serviceType is not a string', async () => {
      const req = makeReq({ type: 'container', name: 'C', external: false, parentId: null, serviceType: 123 });
      const res = makeRes();
      await handler.createElement(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-elements', { repoName: 'r' }));
      expect(res.statusCode).toBe(400);
    });

    it('accepts when serviceType is a valid string', async () => {
      const req = makeReq({ type: 'container', name: 'C', external: false, parentId: null, serviceType: 'web' });
      const res = makeRes();
      await handler.createElement(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-elements', { repoName: 'r' }));
      expect(res.statusCode).toBe(201);
    });
  });

  // -------------------------------------------------------------------------
  //  readJsonBody via request error
  // -------------------------------------------------------------------------

  describe('readJsonBody error handling', () => {
    it('rejects when request emits error', async () => {
      const req = makeReqWithError();
      const res = makeRes();
      await expect(
        handler.createElement(req, res as unknown as http.ServerResponse, makeUrl('/api/c4/manual-elements', { repoName: 'r' })),
      ).rejects.toThrow('connection reset');
    });
  });
});
