import type { DatabaseAdapter } from './DatabaseAdapter';
import type {
  DatabaseCapabilities,
  QueryResult,
  SchemaInfo,
} from './types';
import {
  type ExtToWvMessage,
  type MessageTransport,
  type RpcMethod,
  type RpcRequest,
  type RpcResultMessage,
  type WvToExtMessage,
  makeRpcId,
} from './messaging';

export interface RemoteDatabaseAdapterOptions {
  readonly transport: MessageTransport;
  readonly capabilities: DatabaseCapabilities;
}

interface PendingResolver {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

export class RemoteDatabaseAdapter implements DatabaseAdapter {
  readonly id = 'sqlite-remote' as const;
  readonly displayName = 'SQLite (remote)';
  readonly capabilities: DatabaseCapabilities;
  private readonly transport: MessageTransport;
  private readonly pending = new Map<string, PendingResolver>();
  private readonly unsubscribe: () => void;

  constructor(opts: RemoteDatabaseAdapterOptions) {
    this.transport = opts.transport;
    this.capabilities = opts.capabilities;
    this.unsubscribe = this.transport.onMessage((m) => this.handleMessage(m));
  }

  private handleMessage(m: WvToExtMessage | ExtToWvMessage): void {
    if ((m as RpcResultMessage).type !== 'rpcResult') return;
    const r = m as RpcResultMessage;
    const p = this.pending.get(r.id);
    if (!p) return;
    this.pending.delete(r.id);
    if (r.error) p.reject(new Error(r.error.message));
    else p.resolve(r.result);
  }

  private rpc<T>(method: RpcMethod, params: unknown): Promise<T> {
    const id = makeRpcId();
    const req: RpcRequest = { type: 'rpc', id, method, params };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      this.transport.postMessage(req);
    });
  }

  listSchema(): Promise<SchemaInfo> {
    return this.rpc<SchemaInfo>('listSchema', null);
  }

  selectRows(p: { table: string; limit: number; offset: number }): Promise<QueryResult> {
    return this.rpc<QueryResult>('selectRows', p);
  }

  countRows(table: string): Promise<number> {
    return this.rpc<number>('countRows', { table });
  }

  executeSql(sql: string): Promise<QueryResult> {
    return this.rpc<QueryResult>('executeSql', { sql });
  }

  save(): Promise<void> {
    return this.rpc<void>('save', null);
  }

  revert(): Promise<void> {
    return this.rpc<void>('revert', null);
  }

  async dispose(): Promise<void> {
    this.unsubscribe();
    this.pending.forEach((p) => p.reject(new Error('adapter disposed')));
    this.pending.clear();
  }
}
