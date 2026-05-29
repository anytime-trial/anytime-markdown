// trail-daemon child process を fork し、IPC リクエスト・レスポンス・イベントを
// ホスト側で取り回す薄いラッパ。AnalyzeAllRunnerClient はこの host に対して
// `.call(method, params)` を発行する。

import { fork, type ChildProcess } from 'node:child_process';

import type {
  DaemonEvent,
  DaemonMessage,
  HostMessage,
  MethodName,
} from './trailDaemonProtocol';

interface PendingResolver {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

type EventListener = (payload: unknown) => void;

export class TrailDaemonHost {
  private child: ChildProcess | null = null;
  private readonly pending = new Map<string, PendingResolver>();
  private readonly listeners = new Map<DaemonEvent['channel'], Set<EventListener>>();
  private nextId = 0;

  constructor(private readonly daemonPath: string) {}

  /** child process を fork して IPC を確立する。多重 start は無視する。 */
  start(): void {
    if (this.child) return;
    this.child = fork(this.daemonPath, [], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    this.child.on('message', (m: DaemonMessage) => this.onMessage(m));
    this.child.on('exit', (code) => {
      const err = new Error(`trail-daemon exited (code=${code ?? 'null'})`);
      for (const [, resolver] of this.pending) resolver.reject(err);
      this.pending.clear();
      this.child = null;
    });
  }

  /** daemon に request を送り response を待つ。 */
  call(method: MethodName, params?: unknown): Promise<unknown> {
    if (!this.child) throw new Error('TrailDaemonHost not started');
    const id = `r${++this.nextId}`;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const msg: HostMessage = { type: 'request', id, method, params };
      this.child!.send(msg);
    });
  }

  /** daemon が emit する event を購読する。返値で unsubscribe。 */
  on<C extends DaemonEvent['channel']>(
    channel: C,
    listener: (payload: Extract<DaemonEvent, { channel: C }>['payload']) => void,
  ): () => void {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
    }
    set.add(listener as EventListener);
    return () => {
      this.listeners.get(channel)?.delete(listener as EventListener);
    };
  }

  /** child を kill し pending リクエストを reject する。 */
  dispose(): void {
    if (this.child) {
      this.child.kill();
    }
  }

  private onMessage(m: DaemonMessage): void {
    if (m.type === 'response') {
      const resolver = this.pending.get(m.id);
      if (!resolver) return;
      this.pending.delete(m.id);
      if (m.ok) {
        resolver.resolve(m.result);
      } else {
        const err = new Error(m.error.message);
        if (m.error.stack) err.stack = m.error.stack;
        resolver.reject(err);
      }
    } else if (m.type === 'event') {
      const set = this.listeners.get(m.channel);
      if (!set) return;
      for (const listener of set) {
        try {
          listener(m.payload);
        } catch (err) {
          // listener 内のエラーは握り潰す (host 側の責務)。
          // eslint-disable-next-line no-console
          console.error('[TrailDaemonHost] listener error', err);
        }
      }
    }
  }
}
