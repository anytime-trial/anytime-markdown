import { handleTicketsRpc, type TicketsRpcRequest } from '../ticketsRpcHandler';
import type { TicketProvider } from '@anytime-markdown/tickets-core';

const record = {
  path: '.tickets/T-1.md',
  version: 'v1',
  frontmatter: {
    id: 'T-1',
    title: 't',
    status: 'backlog' as const,
    priority: 'low' as const,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  },
  extras: {},
  body: 'body',
  archived: false,
};

function makeProvider(overrides: Partial<TicketProvider> = {}): TicketProvider {
  return {
    kind: 'github-contents',
    list: jest.fn().mockResolvedValue({ tickets: [record], invalid: [] }),
    get: jest.fn(),
    create: jest.fn().mockResolvedValue(record),
    update: jest.fn().mockResolvedValue({ path: record.path, version: 'v2' }),
    remove: jest.fn().mockResolvedValue(undefined),
    archive: jest.fn().mockResolvedValue({ newPath: '.tickets/archive/T-1.md' }),
    ...overrides,
  };
}

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), dispose: jest.fn() };

async function call(provider: TicketProvider, request: TicketsRpcRequest) {
  return handleTicketsRpc({ provider, logger, request });
}

describe('handleTicketsRpc', () => {
  beforeEach(() => {
    // logger は describe 直下の共有モックのため、呼び出し履歴を残したまま次のテストへ
    // 持ち越すと「ログへ残る」の検証が前テストの副作用で通ってしまう（fail-open）。
    jest.clearAllMocks();
  });

  it('list は includeArchive を provider へ渡す', async () => {
    const provider = makeProvider();
    const result = await call(provider, { type: 'rpc', id: '1', method: 'list', params: { includeArchive: true } });

    expect(provider.list).toHaveBeenCalledWith({ includeArchive: true });
    expect(result).toEqual({ type: 'rpcResult', id: '1', result: { tickets: [record], invalid: [] } });
  });

  it('save は frontmatter と body を直列化して update へ渡す', async () => {
    const provider = makeProvider();
    const result = await call(provider, {
      type: 'rpc',
      id: '2',
      method: 'save',
      params: { path: record.path, version: 'v1', frontmatter: record.frontmatter, extras: {}, body: 'next' },
    });

    expect(provider.update).toHaveBeenCalledTimes(1);
    const arg = (provider.update as jest.Mock).mock.calls[0][0];
    expect(arg.version).toBe('v1');
    expect(typeof arg.content).toBe('string');
    expect(arg.content).toContain('next');
    expect((result as { result: { version: string } }).result.version).toBe('v2');
  });

  it('archive は newPath を返す', async () => {
    const provider = makeProvider();
    const result = await call(provider, {
      type: 'rpc',
      id: '3',
      method: 'archive',
      params: { path: record.path, version: 'v1' },
    });

    expect(result).toEqual({
      type: 'rpcResult',
      id: '3',
      result: { newPath: '.tickets/archive/T-1.md' },
    });
  });

  it('409 を投げる provider エラーは conflict フラグ付きで返る', async () => {
    const provider = makeProvider({
      list: jest.fn().mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 })),
    });
    const result = await call(provider, { type: 'rpc', id: '4', method: 'list', params: { includeArchive: false } });

    expect(result).toEqual({
      type: 'rpcResult',
      id: '4',
      error: { message: 'conflict', status: 409, conflict: true, validationErrors: [] },
    });
  });

  it('一般エラーは conflict なしで返り、ログへ残る', async () => {
    const provider = makeProvider({ list: jest.fn().mockRejectedValue(new Error('boom')) });
    const result = await call(provider, { type: 'rpc', id: '5', method: 'list', params: { includeArchive: false } });

    expect(result).toMatchObject({ error: { message: 'boom', conflict: false } });
    expect(logger.error).toHaveBeenCalled();
  });

  it('未知の method はエラーを返し provider を呼ばない', async () => {
    const provider = makeProvider();
    const result = await call(provider, {
      type: 'rpc',
      id: '6',
      method: 'drop' as never,
      params: {},
    });

    expect(result).toMatchObject({ error: { message: expect.stringContaining('drop') } });
    expect(provider.list).not.toHaveBeenCalled();
  });

  it('list の params が不正な型だと validationErrors 付きで返り provider を呼ばない', async () => {
    const provider = makeProvider();
    const result = await call(provider, {
      type: 'rpc',
      id: '7',
      method: 'list',
      params: { includeArchive: 'yes' },
    });

    expect(provider.list).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      type: 'rpcResult',
      id: '7',
      error: { status: 400, conflict: false },
    });
    const error = (result as { error: { validationErrors: string[] } }).error;
    expect(error.validationErrors.length).toBeGreaterThan(0);
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('save の frontmatter に必須フィールドが欠けていると validationErrors 付きで返り update を呼ばない', async () => {
    const provider = makeProvider();
    const result = await call(provider, {
      type: 'rpc',
      id: '8',
      method: 'save',
      params: {
        path: record.path,
        version: 'v1',
        frontmatter: { title: 't' },
        extras: {},
        body: 'next',
      },
    });

    expect(provider.update).not.toHaveBeenCalled();
    const error = (result as { error: { validationErrors: string[] } }).error;
    expect(error.validationErrors.some((message) => message.includes('id'))).toBe(true);
    expect(error.validationErrors.some((message) => message.includes('status'))).toBe(true);
  });

  it('create の status が不正な列挙値だと validationErrors 付きで返り create を呼ばない', async () => {
    const provider = makeProvider();
    const result = await call(provider, {
      type: 'rpc',
      id: '9',
      method: 'create',
      params: {
        title: 't',
        status: 'not-a-status',
        priority: 'low',
        now: '2026-07-01T00:00:00.000Z',
      },
    });

    expect(provider.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ error: { status: 400 } });
  });

  it('remove は path/version を provider へ渡す', async () => {
    const provider = makeProvider();
    const result = await call(provider, {
      type: 'rpc',
      id: '10',
      method: 'remove',
      params: { path: record.path, version: 'v1' },
    });

    expect(provider.remove).toHaveBeenCalledWith({ path: record.path, version: 'v1', message: undefined });
    expect(result).toEqual({ type: 'rpcResult', id: '10', result: null });
  });

  it('create は params を CreateTicketInput として provider へ渡す', async () => {
    const provider = makeProvider();
    await call(provider, {
      type: 'rpc',
      id: '11',
      method: 'create',
      params: { title: 't', status: 'backlog', priority: 'low', now: '2026-07-01T00:00:00.000Z' },
    });

    expect(provider.create).toHaveBeenCalledWith({
      title: 't',
      status: 'backlog',
      priority: 'low',
      now: '2026-07-01T00:00:00.000Z',
      assignee: undefined,
      workspace: undefined,
      creator: undefined,
      dependencies: undefined,
      estimate: undefined,
      description: undefined,
      message: undefined,
    });
  });
});
