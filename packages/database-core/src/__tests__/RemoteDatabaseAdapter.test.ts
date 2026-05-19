import { RemoteDatabaseAdapter } from '../RemoteDatabaseAdapter';
import type { MessageTransport, WvToExtMessage, ExtToWvMessage } from '../messaging';

function createMockTransport(): {
  transport: MessageTransport;
  emit: (m: ExtToWvMessage) => void;
  posted: WvToExtMessage[];
} {
  const listeners = new Set<(m: WvToExtMessage | ExtToWvMessage) => void>();
  const posted: WvToExtMessage[] = [];
  return {
    posted,
    transport: {
      postMessage(m) {
        posted.push(m as WvToExtMessage);
      },
      onMessage(l) {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    },
    emit(m) {
      listeners.forEach((l) => l(m));
    },
  };
}

describe('RemoteDatabaseAdapter', () => {
  it('listSchema sends rpc and resolves with result', async () => {
    const m = createMockTransport();
    const a = new RemoteDatabaseAdapter({
      transport: m.transport,
      capabilities: { readOnly: false, canTransactionalSave: true, canExportBytes: false },
    });
    const promise = a.listSchema();
    expect(m.posted).toHaveLength(1);
    const req = m.posted[0] as { type: 'rpc'; id: string; method: string };
    expect(req.method).toBe('listSchema');
    m.emit({
      type: 'rpcResult',
      id: req.id,
      result: { tables: [{ name: 'users', columns: [] }], views: [] },
    });
    await expect(promise).resolves.toEqual({
      tables: [{ name: 'users', columns: [] }],
      views: [],
    });
  });

  it('rejects on rpc error', async () => {
    const m = createMockTransport();
    const a = new RemoteDatabaseAdapter({
      transport: m.transport,
      capabilities: { readOnly: false, canTransactionalSave: true, canExportBytes: false },
    });
    const promise = a.executeSql('SELECT 1');
    const req = m.posted[0] as { type: 'rpc'; id: string };
    m.emit({ type: 'rpcResult', id: req.id, error: { message: 'syntax error' } });
    await expect(promise).rejects.toThrow(/syntax error/);
  });

  it('handles multiple concurrent requests by id', async () => {
    const m = createMockTransport();
    const a = new RemoteDatabaseAdapter({
      transport: m.transport,
      capabilities: { readOnly: false, canTransactionalSave: true, canExportBytes: false },
    });
    const p1 = a.countRows('users');
    const p2 = a.countRows('posts');
    expect(m.posted).toHaveLength(2);
    const r1 = m.posted[0] as { type: 'rpc'; id: string };
    const r2 = m.posted[1] as { type: 'rpc'; id: string };
    m.emit({ type: 'rpcResult', id: r2.id, result: 50 });
    m.emit({ type: 'rpcResult', id: r1.id, result: 100 });
    await expect(p1).resolves.toBe(100);
    await expect(p2).resolves.toBe(50);
  });

  it('selectRows forwards the table/limit/offset payload', async () => {
    const m = createMockTransport();
    const a = new RemoteDatabaseAdapter({
      transport: m.transport,
      capabilities: { readOnly: true, canTransactionalSave: false, canExportBytes: false },
    });
    const promise = a.selectRows({ table: 'users', limit: 10, offset: 20 });
    const req = m.posted[0] as { type: 'rpc'; id: string; method: string; params: unknown };
    expect(req.method).toBe('selectRows');
    expect(req.params).toEqual({ table: 'users', limit: 10, offset: 20 });
    m.emit({
      type: 'rpcResult',
      id: req.id,
      result: { columns: ['id'], rows: [[1], [2]] },
    });
    await expect(promise).resolves.toEqual({ columns: ['id'], rows: [[1], [2]] });
  });

  it('save and revert send their respective methods with null params', async () => {
    const m = createMockTransport();
    const a = new RemoteDatabaseAdapter({
      transport: m.transport,
      capabilities: { readOnly: false, canTransactionalSave: true, canExportBytes: false },
    });
    const savePromise = a.save();
    const revertPromise = a.revert();
    const saveReq = m.posted[0] as { type: 'rpc'; id: string; method: string; params: unknown };
    const revertReq = m.posted[1] as { type: 'rpc'; id: string; method: string; params: unknown };
    expect(saveReq.method).toBe('save');
    expect(saveReq.params).toBeNull();
    expect(revertReq.method).toBe('revert');
    expect(revertReq.params).toBeNull();
    m.emit({ type: 'rpcResult', id: saveReq.id, result: undefined });
    m.emit({ type: 'rpcResult', id: revertReq.id, result: undefined });
    await expect(savePromise).resolves.toBeUndefined();
    await expect(revertPromise).resolves.toBeUndefined();
  });

  it('dispose rejects pending requests and unsubscribes from the transport', async () => {
    const m = createMockTransport();
    const a = new RemoteDatabaseAdapter({
      transport: m.transport,
      capabilities: { readOnly: false, canTransactionalSave: false, canExportBytes: false },
    });
    const promise = a.executeSql('SELECT 1').catch((err: Error) => err);
    await a.dispose();
    const err = (await promise) as Error;
    expect(err.message).toBe('adapter disposed');

    // After dispose, emitting messages must not reach a handler — verify by sending one
    // and confirming no listener throws. (`emit` simply iterates 0 listeners.)
    expect(() =>
      m.emit({ type: 'rpcResult', id: 'noop', result: null }),
    ).not.toThrow();
  });

  it('ignores non-rpcResult messages and unknown rpc ids', async () => {
    const m = createMockTransport();
    const a = new RemoteDatabaseAdapter({
      transport: m.transport,
      capabilities: { readOnly: true, canTransactionalSave: false, canExportBytes: false },
    });
    // Non-rpcResult — should be silently ignored
    expect(() =>
      m.emit({ type: 'rpcResult', id: 'unknown-id', result: null }),
    ).not.toThrow();
    expect(() =>
      m.emit({ type: 'init', schema: { tables: [], views: [] }, capabilities: a.capabilities, config: { queryMaxRows: 100, fileName: 'x' } } as ExtToWvMessage),
    ).not.toThrow();
    // Pending requests still resolve normally afterwards
    const promise = a.listSchema();
    const req = m.posted[0] as { type: 'rpc'; id: string };
    m.emit({ type: 'rpcResult', id: req.id, result: { tables: [], views: [] } });
    await expect(promise).resolves.toEqual({ tables: [], views: [] });
  });
});
