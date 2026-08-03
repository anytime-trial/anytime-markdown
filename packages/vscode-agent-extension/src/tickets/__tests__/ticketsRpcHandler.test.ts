import { handleTicketsRpc, type TicketsRpcRequest } from '../ticketsRpcHandler';
import { parseTicketMarkdown, type TicketProvider } from '@anytime-markdown/tickets-core';

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

  it('save は永続化する updated_at と応答の updated_at を一致させ、webview が送った古い値を上書きする（回帰: web-app PUT と同じ契約）', async () => {
    const provider = makeProvider();
    const staleUpdatedAt = record.frontmatter.updated_at;
    const result = await call(provider, {
      type: 'rpc',
      id: '2b',
      method: 'save',
      params: { path: record.path, version: 'v1', frontmatter: record.frontmatter, extras: {}, body: 'next' },
    });

    const arg = (provider.update as jest.Mock).mock.calls[0][0];
    const parsed = parseTicketMarkdown(arg.content as string);
    if (parsed === null) {
      throw new Error('直列化された content の frontmatter を解析できなかった');
    }
    const persistedUpdatedAt = parsed.frontmatter.updated_at;
    const responseUpdatedAt = (result as { result: { updated_at: string } }).result.updated_at;

    // 永続化内容（ディスクに書かれる値）と RPC 応答が同一の値であること。
    expect(persistedUpdatedAt).toBe(responseUpdatedAt);
    // かつ webview から送られてきた古い updated_at ではなく、上書きされていること。
    expect(persistedUpdatedAt).not.toBe(staleUpdatedAt);
  });

  it('save は tickets-core の validateTicketFrontmatter（ビジネスルール検証）を通し、不正な frontmatter は update を呼ばずに拒否する（回帰: web-app PUT との非対称バイパス）', async () => {
    const provider = makeProvider();
    const result = await call(provider, {
      type: 'rpc',
      id: '2d',
      method: 'save',
      params: {
        path: record.path,
        version: 'v1',
        frontmatter: {
          ...record.frontmatter,
          title: 'bad\ntitle', // 制御文字（改行）— checkNoControlChars
          estimate: -1, // 範囲外（min 0）— checkOptionalNumber
        },
        extras: {},
        body: 'next',
      },
    });

    expect(provider.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ type: 'rpcResult', id: '2d', error: { status: 400, conflict: false } });
    const error = (result as { error: { validationErrors: string[] } }).error;
    expect(error.validationErrors.length).toBeGreaterThan(0);
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

  it('create は params を CreateTicketInput として provider へ渡し、now は拡張ホスト側で生成する（webview から送られた now があっても無視する）', async () => {
    const provider = makeProvider();
    // CreateTicketClientInput（webview 側の型）に now は存在しない契約。ここで仮に now を
    // 送ってきても、拡張ホストが自分の時計で上書きすることを確認する（クライアント時計の非信頼）。
    const clientSuppliedNow = '2020-01-01T00:00:00.000Z';
    const before = new Date().toISOString();
    await call(provider, {
      type: 'rpc',
      id: '11',
      method: 'create',
      params: { title: 't', status: 'backlog', priority: 'low', now: clientSuppliedNow },
    });
    const after = new Date().toISOString();

    expect(provider.create).toHaveBeenCalledTimes(1);
    const arg = (provider.create as jest.Mock).mock.calls[0][0] as { now: string };
    expect(arg.now).not.toBe(clientSuppliedNow);
    expect(arg.now >= before && arg.now <= after).toBe(true);
    expect(provider.create).toHaveBeenCalledWith({
      title: 't',
      status: 'backlog',
      priority: 'low',
      now: arg.now,
      assignee: undefined,
      workspace: undefined,
      creator: undefined,
      dependencies: undefined,
      estimate: undefined,
      description: undefined,
      message: undefined,
    });
  });


  it('save の extras に __proto__ が来てもプロトタイプ差し替えにならず書き戻される', async () => {
    // RPC の JSON は `__proto__` を自身のプロパティとして持てる。素のオブジェクト
    // リテラルへ代入するとプロトタイプの差し替えになり、そのキーだけが黙って消える
    // （tickets-core のパーサ側は Object.create(null) 化済み。ここが literal のままだと
    // 拡張 RPC 経由の更新でだけキーが失われ、経路によって挙動が食い違う）。
    const provider = makeProvider();
    await call(provider, {
      type: 'rpc',
      id: 'proto',
      method: 'save',
      params: {
        path: record.path,
        version: 'v1',
        frontmatter: record.frontmatter,
        extras: JSON.parse('{"__proto__":"kept"}'),
        body: 'next',
      },
    });

    const arg = (provider.update as jest.Mock).mock.calls[0][0];
    // 実効的な回帰ガードはこの 1 行（リテラルへ戻すとキーが消えて落ちる）。
    expect(arg.content).toContain('__proto__: kept');
  });
});
