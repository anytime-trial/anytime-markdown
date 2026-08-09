import {
  handleListCaravanCommunities,
  handleUpsertCaravanCommunitySummaries,
} from '../../tools/caravanCommunities';

const mockClose = jest.fn();
const mockListCaravanCommunities = jest.fn();
const mockReassociate = jest.fn();
const mockUpsertCaravanCommunitySummaries = jest.fn();
const mockOpenCaravanBookDb = jest.fn();

jest.mock('../../dbPath', () => ({
  ...jest.requireActual('../../dbPath'),
  resolveCaravanDbPath: () => '/tmp/mcp-trail-test/caravan-book.db',
}));

jest.mock('@anytime-markdown/trail-caravan-book/query', () => ({
  openCaravanBookDb: (...args: unknown[]) => mockOpenCaravanBookDb(...args),
  listCaravanCommunities: (...args: unknown[]) => mockListCaravanCommunities(...args),
  reassociateCaravanCommunitySummaries: (...args: unknown[]) => mockReassociate(...args),
  upsertCaravanCommunitySummaries: (...args: unknown[]) =>
    mockUpsertCaravanCommunitySummaries(...args),
}));

function makeCommunity(communityId: number, memberCount: number) {
  return {
    community_id: communityId,
    graph_version: 'v1',
    stable_key: `key${communityId}`.padEnd(16, '0'),
    member_count: memberCount,
    name: null,
    summary: null,
    sample_members: [],
  };
}

describe('caravanCommunities tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenCaravanBookDb.mockResolvedValue({ db: {}, close: mockClose });
  });

  test('list: resolves db path, maps options, applies limit and closes', async () => {
    mockListCaravanCommunities.mockReturnValue([makeCommunity(1, 30), makeCommunity(2, 12)]);

    const result = await handleListCaravanCommunities({
      min_size: 12,
      unsummarized_only: true,
      sample_size: 5,
      limit: 1,
    });

    expect(mockOpenCaravanBookDb).toHaveBeenCalledWith('/tmp/mcp-trail-test/caravan-book.db');
    // 版キャッシュの追従（書き込み）は list の前に明示的に実行される
    expect(mockReassociate).toHaveBeenCalledWith({});
    expect(mockReassociate.mock.invocationCallOrder[0]).toBeLessThan(
      mockListCaravanCommunities.mock.invocationCallOrder[0],
    );
    expect(mockListCaravanCommunities).toHaveBeenCalledWith(
      {},
      { minSize: 12, unsummarizedOnly: true, sampleSize: 5 },
    );
    expect(result.total).toBe(2);
    expect(result.communities.length).toBe(1);
    expect(result.graph_version).toBe('v1');
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  test('list: empty layout yields graph_version null', async () => {
    mockListCaravanCommunities.mockReturnValue([]);
    const result = await handleListCaravanCommunities({});
    expect(result).toEqual({ graph_version: null, total: 0, communities: [] });
  });

  test('list: closes the db even when the query throws', async () => {
    mockListCaravanCommunities.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(handleListCaravanCommunities({})).rejects.toThrow('boom');
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  test('upsert: passes summaries through and closes', async () => {
    mockUpsertCaravanCommunitySummaries.mockReturnValue({
      upserted: 1,
      skipped_stable_keys: ['dead000000000000'],
    });

    const summaries = [
      { stable_key: 'key1000000000000', name: '検索基盤', summary: '検索まわり' },
      { stable_key: 'dead000000000000', name: '幽霊', summary: '' },
    ];
    const result = await handleUpsertCaravanCommunitySummaries({ summaries });

    expect(mockOpenCaravanBookDb).toHaveBeenCalledWith('/tmp/mcp-trail-test/caravan-book.db');
    expect(mockUpsertCaravanCommunitySummaries).toHaveBeenCalledWith({}, summaries);
    expect(result.upserted).toBe(1);
    expect(result.skipped_stable_keys).toEqual(['dead000000000000']);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
