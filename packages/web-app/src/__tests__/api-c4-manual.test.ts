/**
 * /api/c4/manual-elements (POST) と /api/c4/manual-groups (GET/POST) のユニットテスト
 */

const mockResolveSupabaseEnv = jest.fn();
const mockCreateClient = jest.fn();

jest.mock('../lib/supabase-env', () => ({
  resolveSupabaseEnv: mockResolveSupabaseEnv,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

const MockNextResponse = class {
  _body: unknown;
  _status: number;
  static json = jest.fn((body: unknown, init?: { status?: number }) => {
    const r = new MockNextResponse(body, init);
    return r;
  });
  constructor(body: unknown, init?: { status?: number }) {
    this._body = body;
    this._status = init?.status ?? 200;
  }
};

// NextResponse constructor call (used by new NextResponse('text', { status }))
const MockNextResponseClass = function (this: MockNextResponse, body: unknown, init?: { status?: number }) {
  this._body = body;
  this._status = init?.status ?? 200;
} as unknown as typeof MockNextResponse;
MockNextResponseClass.json = MockNextResponse.json;
(MockNextResponseClass.prototype as unknown as { _status: number })._status = 200;
(MockNextResponseClass.prototype as unknown as { _body: unknown })._body = null;

jest.mock('next/server', () => ({
  NextResponse: MockNextResponseClass,
}));

import { POST as elementsPost } from '../app/api/c4/manual-elements/route';
import { GET as groupsGet, POST as groupsPost } from '../app/api/c4/manual-groups/route';

type MockResp = { _body: unknown; _status: number };

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_SHOW_UNLIMITED;

function makeRequest(
  searchParams: Record<string, string>,
  body: Record<string, unknown>,
): import('next/server').NextRequest {
  const sp = new URLSearchParams(searchParams);
  return {
    nextUrl: { searchParams: sp },
    json: jest.fn().mockResolvedValue(body),
  } as unknown as import('next/server').NextRequest;
}

function makeGroupsSupabase(
  existingData: { group_id: string }[] = [],
  insertError: null | { message: string } = null,
  selectData: unknown[] = [],
) {
  const insertMock = jest.fn().mockResolvedValue({ error: insertError });
  const orderMock = jest.fn().mockResolvedValue({ data: selectData, error: null });
  const eqSelectMock = jest.fn().mockReturnValue({ order: orderMock });
  const eqExistingMock = jest.fn().mockReturnValue({
    like: jest.fn().mockResolvedValue({ data: existingData }),
  });

  let fromCallCount = 0;
  const from = jest.fn().mockImplementation(() => {
    const callNum = fromCallCount++;
    return {
      select: jest.fn().mockReturnValue(
        callNum === 0
          ? { eq: eqSelectMock }      // GET - return groups list
          : { eq: eqExistingMock }    // POST - get existing for ID generation
      ),
      insert: insertMock,
    };
  });
  return { from };
}

function makeElementsSupabase(
  existingData: { element_id: string }[] = [],
  insertError: null | { message: string } = null,
) {
  const insertMock = jest.fn().mockResolvedValue({ error: insertError });
  const from = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        like: jest.fn().mockResolvedValue({ data: existingData }),
      }),
    }),
    insert: insertMock,
  });
  return { from };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SHOW_UNLIMITED = '1';
});

afterAll(() => {
  process.env.NEXT_PUBLIC_SHOW_UNLIMITED = ORIGINAL_ENV;
});

// ─────────────────────────────────────────────────────
// POST /api/c4/manual-elements
// ─────────────────────────────────────────────────────
describe('POST /api/c4/manual-elements', () => {
  it('returns 403 when NEXT_PUBLIC_SHOW_UNLIMITED is not 1', async () => {
    process.env.NEXT_PUBLIC_SHOW_UNLIMITED = '0';
    const req = makeRequest({ repoName: 'my-repo' }, { type: 'system', name: 'MySystem' });
    const result = (await elementsPost(req)) as unknown as MockResp;
    expect(result._status).toBe(403);
  });

  it('returns 400 when repoName is missing', async () => {
    const req = makeRequest({}, { type: 'system', name: 'MySystem' });
    const result = (await elementsPost(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
  });

  it('returns 400 for invalid type', async () => {
    const req = makeRequest({ repoName: 'my-repo' }, { type: 'invalid', name: 'MySystem' });
    const result = (await elementsPost(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
  });

  it('returns 400 when name is empty', async () => {
    const req = makeRequest({ repoName: 'my-repo' }, { type: 'system', name: '' });
    const result = (await elementsPost(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
  });

  it('returns 503 when supabase env is not configured', async () => {
    mockResolveSupabaseEnv.mockReturnValue(null);
    const req = makeRequest({ repoName: 'my-repo' }, { type: 'system', name: 'MySystem' });
    const result = (await elementsPost(req)) as unknown as MockResp;
    expect(result._status).toBe(503);
  });

  it('creates element with incremented ID', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = makeElementsSupabase([{ element_id: 'sys_manual_1' }, { element_id: 'sys_manual_3' }]);
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ repoName: 'my-repo' }, { type: 'system', name: 'NewSystem' });
    const result = (await elementsPost(req)) as unknown as MockResp;
    expect(result._status).toBe(201);
    const body = result._body as Record<string, unknown>;
    const element = body.element as Record<string, unknown>;
    expect(element.id).toBe('sys_manual_4');
    expect(element.type).toBe('system');
    expect(element.name).toBe('NewSystem');
  });

  it('uses person_ prefix for person type', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = makeElementsSupabase([]);
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ repoName: 'my-repo' }, { type: 'person', name: 'Alice' });
    const result = (await elementsPost(req)) as unknown as MockResp;
    expect(result._status).toBe(201);
    const element = (result._body as Record<string, unknown>).element as Record<string, unknown>;
    expect(String(element.id)).toMatch(/^person_/);
  });

  it('uses pkg_manual_ prefix for container type', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = makeElementsSupabase([]);
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ repoName: 'my-repo' }, { type: 'container', name: 'Service' });
    const result = (await elementsPost(req)) as unknown as MockResp;
    const element = (result._body as Record<string, unknown>).element as Record<string, unknown>;
    expect(String(element.id)).toMatch(/^pkg_manual_/);
  });

  it('returns 500 when insert fails', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = makeElementsSupabase([], { message: 'db error' });
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ repoName: 'my-repo' }, { type: 'system', name: 'MySystem' });
    const result = (await elementsPost(req)) as unknown as MockResp;
    expect(result._status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────
// GET /api/c4/manual-groups
// ─────────────────────────────────────────────────────
describe('GET /api/c4/manual-groups', () => {
  it('returns 400 when repoName is missing', async () => {
    const req = makeRequest({}, {});
    const result = (await groupsGet(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
  });

  it('returns 503 when supabase env is not configured', async () => {
    mockResolveSupabaseEnv.mockReturnValue(null);
    const req = makeRequest({ repoName: 'my-repo' }, {});
    const result = (await groupsGet(req)) as unknown as MockResp;
    expect(result._status).toBe(503);
  });

  it('returns groups list', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const groups = [
      { group_id: 'grp_manual_1', member_ids: '["n1","n2"]', label: 'My Group', updated_at: '2026-01-01T00:00:00Z' },
    ];
    const supabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: groups, error: null }),
          }),
        }),
      }),
    };
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ repoName: 'my-repo' }, {});
    const result = (await groupsGet(req)) as unknown as MockResp;
    expect(result._status).toBe(200);
    const body = result._body as Record<string, unknown>[];
    expect(body[0].id).toBe('grp_manual_1');
    expect(body[0].memberIds).toEqual(['n1', 'n2']);
    expect(body[0].label).toBe('My Group');
  });

  it('returns 500 on DB error', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
          }),
        }),
      }),
    };
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ repoName: 'my-repo' }, {});
    const result = (await groupsGet(req)) as unknown as MockResp;
    expect(result._status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────
// POST /api/c4/manual-groups
// ─────────────────────────────────────────────────────
describe('POST /api/c4/manual-groups', () => {
  it('returns 403 when NEXT_PUBLIC_SHOW_UNLIMITED is not 1', async () => {
    process.env.NEXT_PUBLIC_SHOW_UNLIMITED = '0';
    const req = makeRequest({ repoName: 'my-repo' }, { memberIds: ['n1', 'n2'] });
    const result = (await groupsPost(req)) as unknown as MockResp;
    expect(result._status).toBe(403);
  });

  it('returns 400 when repoName is missing', async () => {
    const req = makeRequest({}, { memberIds: ['n1', 'n2'] });
    const result = (await groupsPost(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
  });

  it('returns 400 when memberIds has less than 2 elements', async () => {
    const req = makeRequest({ repoName: 'my-repo' }, { memberIds: ['n1'] });
    const result = (await groupsPost(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
  });

  it('returns 400 when memberIds is not an array', async () => {
    const req = makeRequest({ repoName: 'my-repo' }, { memberIds: 'not-array' });
    const result = (await groupsPost(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
  });

  it('returns 503 when supabase env is not configured', async () => {
    mockResolveSupabaseEnv.mockReturnValue(null);
    const req = makeRequest({ repoName: 'my-repo' }, { memberIds: ['n1', 'n2'] });
    const result = (await groupsPost(req)) as unknown as MockResp;
    expect(result._status).toBe(503);
  });

  it('creates group with incremented ID', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            like: jest.fn().mockResolvedValue({ data: [{ group_id: 'grp_manual_2' }] }),
          }),
        }),
        insert: jest.fn().mockResolvedValue({ error: null }),
      }),
    };
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ repoName: 'my-repo' }, { memberIds: ['n1', 'n2'], label: 'My Group' });
    const result = (await groupsPost(req)) as unknown as MockResp;
    expect(result._status).toBe(201);
    const body = result._body as Record<string, unknown>;
    const group = body.group as Record<string, unknown>;
    expect(group.id).toBe('grp_manual_3');
    expect(group.memberIds).toEqual(['n1', 'n2']);
    expect(group.label).toBe('My Group');
  });

  it('returns 500 when insert fails', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            like: jest.fn().mockResolvedValue({ data: [] }),
          }),
        }),
        insert: jest.fn().mockResolvedValue({ error: { message: 'insert failed' } }),
      }),
    };
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ repoName: 'my-repo' }, { memberIds: ['n1', 'n2'] });
    const result = (await groupsPost(req)) as unknown as MockResp;
    expect(result._status).toBe(500);
  });
});
