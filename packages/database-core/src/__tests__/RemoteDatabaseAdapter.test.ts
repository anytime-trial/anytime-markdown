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
});
