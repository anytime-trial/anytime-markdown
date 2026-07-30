import { createRpcTicketsGateway, type RpcTransport } from '../rpcGateway';

function makeTransport() {
  const listeners: ((m: unknown) => void)[] = [];
  const sent: { id: string; method: string; params: unknown }[] = [];
  return {
    sent,
    postMessage: (m: { type: 'rpc'; id: string; method: string; params: unknown }) => sent.push(m),
    onMessage: (l: (m: unknown) => void) => {
      listeners.push(l);
      return () => {};
    },
    reply: (id: string, payload: object) =>
      listeners.forEach((l) => l({ type: 'rpcResult', id, ...payload })),
    emit: (message: unknown) => listeners.forEach((l) => l(message)),
  };
}

describe('createRpcTicketsGateway', () => {
  it('list を送信し、対応する id の応答で解決する', async () => {
    const transport = makeTransport();
    const gateway = createRpcTicketsGateway(transport);

    const promise = gateway.list(true);
    expect(transport.sent[0].method).toBe('list');
    expect(transport.sent[0].params).toEqual({ includeArchive: true });

    transport.reply(transport.sent[0].id, { result: { tickets: [], invalid: [] } });
    await expect(promise).resolves.toEqual({ tickets: [], invalid: [] });
  });

  it('応答は id で対応付けられ、順不同でも取り違えない', async () => {
    const transport = makeTransport();
    const gateway = createRpcTicketsGateway(transport);

    const first = gateway.list(false);
    const second = gateway.archive({ path: '.tickets/T-1.md', version: 'v1' });

    transport.reply(transport.sent[1].id, { result: { newPath: 'archived' } });
    transport.reply(transport.sent[0].id, { result: { tickets: [], invalid: [] } });

    await expect(second).resolves.toEqual({ newPath: 'archived' });
    await expect(first).resolves.toEqual({ tickets: [], invalid: [] });
  });

  it('error 応答は TicketsClientError へ写像される', async () => {
    const transport = makeTransport();
    const gateway = createRpcTicketsGateway(transport);

    const promise = gateway.list(false);
    transport.reply(transport.sent[0].id, {
      error: { message: '競合しました', status: 409, conflict: true, validationErrors: [] },
    });

    await expect(promise).rejects.toMatchObject({
      name: 'TicketsClientError',
      conflict: true,
      status: 409,
    });
  });

  it('validationErrors を保持する', async () => {
    const transport = makeTransport();
    const gateway = createRpcTicketsGateway(transport);

    const promise = gateway.create({ title: '', status: 'backlog', priority: 'low' });
    transport.reply(transport.sent[0].id, {
      error: { message: '不正', status: 400, conflict: false, validationErrors: ['title は必須'] },
    });

    await expect(promise).rejects.toMatchObject({ validationErrors: ['title は必須'] });
  });

  it('remove は結果を void として解決する', async () => {
    const transport = makeTransport();
    const gateway = createRpcTicketsGateway(transport);

    const promise = gateway.remove({ path: '.tickets/T-1.md', version: 'v1' });
    transport.reply(transport.sent[0].id, { result: null });

    await expect(promise).resolves.toBeUndefined();
  });

  it('save は SaveTicketInput をそのまま params として送信する', () => {
    const transport = makeTransport();
    const gateway = createRpcTicketsGateway(transport);

    const input = {
      path: '.tickets/T-1.md',
      version: 'v1',
      frontmatter: {
        id: 'T-1',
        title: 'title',
        status: 'backlog' as const,
        priority: 'low' as const,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      extras: {},
      body: 'body',
    };
    void gateway.save(input);

    expect(transport.sent[0].method).toBe('save');
    expect(transport.sent[0].params).toEqual(input);
  });

  it('未知の id への応答が来ても待機中の Promise を壊さない', async () => {
    const transport = makeTransport();
    const gateway = createRpcTicketsGateway(transport);

    const promise = gateway.list(false);
    transport.reply('unknown-id', { result: { tickets: [], invalid: [] } });
    transport.reply(transport.sent[0].id, { result: { tickets: [], invalid: [] } });

    await expect(promise).resolves.toEqual({ tickets: [], invalid: [] });
  });

  it('type が rpcResult でないメッセージを無視する', async () => {
    const transport = makeTransport();
    const gateway = createRpcTicketsGateway(transport);

    const promise = gateway.list(false);
    transport.emit({ type: 'somethingElse', id: transport.sent[0].id, result: 'ignored' });
    transport.reply(transport.sent[0].id, { result: { tickets: [], invalid: [] } });

    await expect(promise).resolves.toEqual({ tickets: [], invalid: [] });
  });

  it('error も result も無い応答は明示的に reject する（undefined で静かに解決しない）', async () => {
    const transport = makeTransport();
    const gateway = createRpcTicketsGateway(transport);

    const promise = gateway.list(false);
    transport.emit({ type: 'rpcResult', id: transport.sent[0].id });

    await expect(promise).rejects.toMatchObject({ name: 'TicketsClientError' });
  });

  it('error の形が不正な応答は原因不明のまま握り潰さず reject する', async () => {
    const transport = makeTransport();
    const gateway = createRpcTicketsGateway(transport);

    const promise = gateway.list(false);
    transport.emit({ type: 'rpcResult', id: transport.sent[0].id, error: 'not-an-object' });

    await expect(promise).rejects.toMatchObject({ name: 'TicketsClientError' });
  });
});
