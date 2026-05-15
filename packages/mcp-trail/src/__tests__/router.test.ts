import * as probe from '../probe';
import * as dbPathMod from '../dbPath';
import * as repoNameMod from '../repoName';
import * as openDbMod from '../sqlite/openDb';
import * as readDirect from '../sqlite/read';
import * as writeDirect from '../sqlite/write';
import * as httpClient from '../client';
import { route } from '../router';
import type { RouteOpts } from '../router';

// ---------------------------------------------------------------------------
// Shared mock setup
// ---------------------------------------------------------------------------

const MOCK_DB_PATH = '/mock/trail.db';
const MOCK_REPO = 'mock-repo';
const SERVER_URL = 'http://localhost:19841';

const BASE_OPTS: RouteOpts = {
  serverUrl: SERVER_URL,
  repoName: MOCK_REPO,
};

const mockClose = jest.fn();
const mockSave = jest.fn();
const mockDbInstance = {} as unknown as import('better-sqlite3').Database;
const mockDb = mockDbInstance;
const mockOpened = {
  db: mockDbInstance,
  path: MOCK_DB_PATH,
  mode: 'readwrite' as const,
  save: mockSave,
  close: mockClose,
};

function setupCommonMocks() {
  jest.spyOn(dbPathMod, 'resolveDbPath').mockReturnValue(MOCK_DB_PATH);
  jest.spyOn(repoNameMod, 'resolveRepoName').mockReturnValue(MOCK_REPO);
  jest.spyOn(openDbMod, 'openTrailDb').mockResolvedValue(mockOpened);
}

beforeEach(() => {
  jest.clearAllMocks();
  setupCommonMocks();
});

// ---------------------------------------------------------------------------
// READ tools — SQLite direct, no probe
// ---------------------------------------------------------------------------

describe('READ tools: SQLite direct (no probe)', () => {
  const READ_CASES: Array<[string, jest.SpyInstance | null, unknown]> = [
    ['get_c4_model', null, { model: { elements: [], relationships: [] } }],
    ['list_elements', null, []],
    ['list_relationships', null, []],
    ['list_groups', null, []],
    ['list_communities', null, { communities: [] }],
  ];

  test.each([
    ['get_c4_model', 'getC4ModelDirect', { model: {} }],
    ['list_elements', 'listElementsDirect', []],
    ['list_relationships', 'listRelationshipsDirect', []],
    ['list_groups', 'listGroupsDirect', []],
    ['list_communities', 'listCommunitiesDirect', { communities: [] }],
  ] as const)('%s → direct read, probe NOT called', async (toolName, fnName, mockReturn) => {
    const probeSpy = jest.spyOn(probe, 'probeServerAlive');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const readSpy = jest.spyOn(readDirect, fnName as any).mockResolvedValue(mockReturn as any);

    const result = await route(toolName, {}, BASE_OPTS);

    expect(probeSpy).not.toHaveBeenCalled();
    expect(readSpy).toHaveBeenCalledWith(mockDb, MOCK_REPO);
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockReturn);
  });
});

// ---------------------------------------------------------------------------
// WRITE tools — probe alive → HTTP
// ---------------------------------------------------------------------------

describe('WRITE tools: probe alive → HTTP', () => {
  beforeEach(() => {
    jest.spyOn(probe, 'probeServerAlive').mockResolvedValue(true);
  });

  test('add_element → httpClient.addElement', async () => {
    const spy = jest.spyOn(httpClient, 'addElement').mockResolvedValue({ id: 'el-1' });
    const args = { type: 'Service', name: 'MyService', external: false, parentId: null };
    await route('add_element', args, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(SERVER_URL, MOCK_REPO, args);
  });

  test('update_element → httpClient.updateElement', async () => {
    const spy = jest.spyOn(httpClient, 'updateElement').mockResolvedValue({ id: 'el-1' });
    const args = { id: 'el-1', name: 'Updated' };
    await route('update_element', args, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(SERVER_URL, MOCK_REPO, 'el-1', { name: 'Updated' });
  });

  test('remove_element → httpClient.removeElement, returns { id }', async () => {
    const spy = jest.spyOn(httpClient, 'removeElement').mockResolvedValue(undefined);
    const result = await route('remove_element', { id: 'el-1' }, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(SERVER_URL, MOCK_REPO, 'el-1');
    expect(result).toEqual({ id: 'el-1' });
  });

  test('add_group → httpClient.addGroup', async () => {
    const spy = jest.spyOn(httpClient, 'addGroup').mockResolvedValue({ id: 'g-1' });
    const args = { memberIds: ['a', 'b'], label: 'G' };
    await route('add_group', args, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(SERVER_URL, MOCK_REPO, args);
  });

  test('update_group → httpClient.updateGroup, returns { id }', async () => {
    const spy = jest.spyOn(httpClient, 'updateGroup').mockResolvedValue(undefined);
    const result = await route('update_group', { id: 'g-1', label: 'new' }, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(SERVER_URL, MOCK_REPO, 'g-1', { label: 'new' });
    expect(result).toEqual({ id: 'g-1' });
  });

  test('remove_group → httpClient.removeGroup, returns { id }', async () => {
    const spy = jest.spyOn(httpClient, 'removeGroup').mockResolvedValue(undefined);
    const result = await route('remove_group', { id: 'g-1' }, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(SERVER_URL, MOCK_REPO, 'g-1');
    expect(result).toEqual({ id: 'g-1' });
  });

  test('add_relationship → httpClient.addRelationship', async () => {
    const spy = jest.spyOn(httpClient, 'addRelationship').mockResolvedValue({ id: 'r-1' });
    const args = { fromId: 'a', toId: 'b', label: 'uses' };
    await route('add_relationship', args, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(SERVER_URL, MOCK_REPO, args);
  });

  test('remove_relationship → httpClient.removeRelationship, returns { id }', async () => {
    const spy = jest.spyOn(httpClient, 'removeRelationship').mockResolvedValue(undefined);
    const result = await route('remove_relationship', { id: 'r-1' }, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(SERVER_URL, MOCK_REPO, 'r-1');
    expect(result).toEqual({ id: 'r-1' });
  });

  test('upsert_community_summaries → httpClient.upsertCommunitySummaries', async () => {
    const spy = jest.spyOn(httpClient, 'upsertCommunitySummaries').mockResolvedValue({ updated: 2 });
    const summaries = [{ communityId: 1, name: 'n', summary: 's' }];
    await route('upsert_community_summaries', { summaries }, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(SERVER_URL, MOCK_REPO, summaries);
  });

  test('upsert_community_mappings → httpClient.upsertCommunityMappings', async () => {
    const spy = jest.spyOn(httpClient, 'upsertCommunityMappings').mockResolvedValue({ updated: 1, inserted: 0 });
    const mappings = [{ communityId: 1, mappings: [] }];
    await route('upsert_community_mappings', { mappings }, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(SERVER_URL, MOCK_REPO, mappings);
  });
});

// ---------------------------------------------------------------------------
// WRITE tools — probe dead → SQLite direct
// ---------------------------------------------------------------------------

describe('WRITE tools: probe dead → SQLite direct', () => {
  beforeEach(() => {
    jest.spyOn(probe, 'probeServerAlive').mockResolvedValue(false);
  });

  test('add_element → writeDirect.addElementDirect', async () => {
    const spy = jest.spyOn(writeDirect, 'addElementDirect').mockReturnValue({ id: 'el-1' });
    const args = { type: 'Service', name: 'S', external: false, parentId: null };
    await route('add_element', args, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(mockDb, MOCK_REPO, {
      type: 'Service',
      name: 'S',
      external: false,
      parentId: null,
    });
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  test('update_element → writeDirect.updateElementDirect', async () => {
    const spy = jest.spyOn(writeDirect, 'updateElementDirect').mockReturnValue(undefined);
    const args = { id: 'el-1', name: 'X' };
    await route('update_element', args, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(mockDb, MOCK_REPO, 'el-1', args);
  });

  test('remove_element → writeDirect.removeElementDirect, returns { id }', async () => {
    const spy = jest.spyOn(writeDirect, 'removeElementDirect').mockReturnValue(undefined);
    const result = await route('remove_element', { id: 'el-2' }, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(mockDb, MOCK_REPO, 'el-2');
    expect(result).toEqual({ id: 'el-2' });
  });

  test('add_group → writeDirect.addGroupDirect', async () => {
    const spy = jest.spyOn(writeDirect, 'addGroupDirect').mockReturnValue({ id: 'g-1' });
    const args = { memberIds: ['x'] };
    await route('add_group', args, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(mockDb, MOCK_REPO, { memberIds: ['x'] });
  });

  test('update_group → writeDirect.updateGroupDirect', async () => {
    const spy = jest.spyOn(writeDirect, 'updateGroupDirect').mockReturnValue(undefined);
    const args = { id: 'g-1', label: 'L' };
    await route('update_group', args, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(mockDb, MOCK_REPO, 'g-1', args);
  });

  test('remove_group → writeDirect.removeGroupDirect, returns { id }', async () => {
    const spy = jest.spyOn(writeDirect, 'removeGroupDirect').mockReturnValue(undefined);
    const result = await route('remove_group', { id: 'g-2' }, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(mockDb, MOCK_REPO, 'g-2');
    expect(result).toEqual({ id: 'g-2' });
  });

  test('add_relationship → writeDirect.addRelationshipDirect', async () => {
    const spy = jest.spyOn(writeDirect, 'addRelationshipDirect').mockReturnValue({ id: 'r-1' });
    const args = { fromId: 'a', toId: 'b' };
    await route('add_relationship', args, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(mockDb, MOCK_REPO, { fromId: 'a', toId: 'b' });
  });

  test('remove_relationship → writeDirect.removeRelationshipDirect, returns { id }', async () => {
    const spy = jest.spyOn(writeDirect, 'removeRelationshipDirect').mockReturnValue(undefined);
    const result = await route('remove_relationship', { id: 'r-2' }, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(mockDb, MOCK_REPO, 'r-2');
    expect(result).toEqual({ id: 'r-2' });
  });

  test('upsert_community_summaries → writeDirect.upsertCommunitySummariesDirect', async () => {
    const spy = jest.spyOn(writeDirect, 'upsertCommunitySummariesDirect').mockReturnValue({ updated: 1 });
    const summaries = [{ communityId: 2, name: 'n', summary: 's' }];
    await route('upsert_community_summaries', { summaries }, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(mockDb, MOCK_REPO, summaries);
  });

  test('upsert_community_mappings → writeDirect.upsertCommunityMappingsDirect', async () => {
    const spy = jest.spyOn(writeDirect, 'upsertCommunityMappingsDirect').mockReturnValue({ updated: 0, inserted: 1 });
    const mappings = [{ communityId: 2, mappings: [] }];
    await route('upsert_community_mappings', { mappings }, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(mockDb, MOCK_REPO, mappings);
  });
});

// ---------------------------------------------------------------------------
// WRITE tools — forceDirect: true → probe skipped, SQLite direct
// ---------------------------------------------------------------------------

describe('WRITE tools: forceDirect → probe skipped, SQLite direct', () => {
  test('add_element with forceDirect: true skips probe', async () => {
    const probeSpy = jest.spyOn(probe, 'probeServerAlive');
    const writeSpy = jest.spyOn(writeDirect, 'addElementDirect').mockReturnValue({ id: 'el-3' });
    const args = { type: 'DB', name: 'Postgres', external: false, parentId: null };
    await route('add_element', args, { ...BASE_OPTS, forceDirect: true });
    expect(probeSpy).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(mockDb, MOCK_REPO, {
      type: 'DB',
      name: 'Postgres',
      external: false,
      parentId: null,
    });
  });

  test('remove_group with forceDirect: true skips probe', async () => {
    const probeSpy = jest.spyOn(probe, 'probeServerAlive');
    const writeSpy = jest.spyOn(writeDirect, 'removeGroupDirect').mockReturnValue(undefined);
    await route('remove_group', { id: 'g-99' }, { ...BASE_OPTS, forceDirect: true });
    expect(probeSpy).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(mockDb, MOCK_REPO, 'g-99');
  });
});

// ---------------------------------------------------------------------------
// ANALYZE tools — probe alive → HTTP
// ---------------------------------------------------------------------------

describe('ANALYZE tools: probe alive → HTTP', () => {
  beforeEach(() => {
    jest.spyOn(probe, 'probeServerAlive').mockResolvedValue(true);
  });

  test('analyze_current_code → httpClient.analyzeCurrentCode', async () => {
    const spy = jest.spyOn(httpClient, 'analyzeCurrentCode').mockResolvedValue({ status: 'started' } as never);
    await route('analyze_current_code', { workspacePath: '/workspace' }, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(SERVER_URL, { workspacePath: '/workspace' });
  });

  test('analyze_release_code → httpClient.analyzeReleaseCode', async () => {
    const spy = jest.spyOn(httpClient, 'analyzeReleaseCode').mockResolvedValue({ status: 'started' } as never);
    await route('analyze_release_code', {}, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(SERVER_URL);
  });

  test('analyze_all → httpClient.analyzeAll', async () => {
    const spy = jest.spyOn(httpClient, 'analyzeAll').mockResolvedValue({ status: 'started' } as never);
    await route('analyze_all', {}, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(SERVER_URL);
  });

  test('get_analyze_status → httpClient.getAnalyzeStatus', async () => {
    const spy = jest.spyOn(httpClient, 'getAnalyzeStatus').mockResolvedValue({ running: false } as never);
    await route('get_analyze_status', {}, BASE_OPTS);
    expect(spy).toHaveBeenCalledWith(SERVER_URL);
  });
});

// ---------------------------------------------------------------------------
// ANALYZE tools — probe dead → throw
// ---------------------------------------------------------------------------

describe('ANALYZE tools: probe dead → throw', () => {
  beforeEach(() => {
    jest.spyOn(probe, 'probeServerAlive').mockResolvedValue(false);
  });

  test.each(['analyze_current_code', 'analyze_release_code', 'analyze_all', 'get_analyze_status'])(
    '%s with server dead → throws',
    async (toolName) => {
      await expect(route(toolName, {}, BASE_OPTS)).rejects.toThrow(
        'TrailDataServer not running',
      );
    },
  );

  test('analyze_current_code with forceDirect: true → throws (forceDirect has no effect for analyze)', async () => {
    await expect(route('analyze_current_code', {}, { ...BASE_OPTS, forceDirect: true })).rejects.toThrow(
      'TrailDataServer not running',
    );
  });
});

// ---------------------------------------------------------------------------
// Unknown tool → throw
// ---------------------------------------------------------------------------

describe('Unknown tool', () => {
  test('throws Error with Unknown tool message', async () => {
    await expect(route('nonexistent_tool', {}, BASE_OPTS)).rejects.toThrow('Unknown tool: nonexistent_tool');
  });
});

// ---------------------------------------------------------------------------
// DB close on error
// ---------------------------------------------------------------------------

describe('DB close called on error in direct read', () => {
  test('db.close() is called even when direct read function throws', async () => {
    jest.spyOn(probe, 'probeServerAlive').mockResolvedValue(false);
    jest.spyOn(readDirect, 'getC4ModelDirect').mockImplementation(() => { throw new Error('DB error'); });

    await expect(route('get_c4_model', {}, BASE_OPTS)).rejects.toThrow('DB error');
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
