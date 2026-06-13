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

/** SIGTERM 後に child が終了するまで待つデフォルト猶予 (ms)。 */
const DEFAULT_TERM_GRACE_MS = 3000;
/** SIGKILL 送出後に OS が child を reap するのを待つ猶予 (ms)。 */
const KILL_REAP_GRACE_MS = 500;

/**
 * `p` が `ms` 以内に解決すれば false、タイムアウトが先なら true を返す。
 * 待機用タイマーは unref して、これ単独でプロセスを生かし続けないようにする。
 */
function raceTimeout(p: Promise<void>, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(true), ms);
    if (typeof timer.unref === 'function') timer.unref();
    void p.then(() => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

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

  /**
   * child を kill する (pending リクエストは start() の 'exit' ハンドラが reject する)。
   *
   * SIGTERM を送り、`timeoutMs` 以内に終了しなければ SIGKILL にエスカレーションする。
   * daemon は同期 better-sqlite3 (重い bug_history スイープ等) でイベントループを
   * ブロックすると SIGTERM/disconnect ハンドラを走らせられず、親 Extension Host が
   * 先に exit すると child が PPID=1 へ reparent されて孤児化する。孤児は trail.db の
   * FD を掴んだまま生き残り、次回リロードで新 daemon 起動を code=1 で阻害する。
   * エスカレーションにより、ブロック中でも child を確実に終了させ孤児化を防ぐ。
   */
  async dispose(timeoutMs = DEFAULT_TERM_GRACE_MS): Promise<void> {
    const child = this.child;
    if (!child) return;

    const waitExit = new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      child.once('exit', () => resolve());
    });

    child.kill('SIGTERM');

    const timedOut = await raceTimeout(waitExit, timeoutMs);
    if (timedOut && child.exitCode === null && child.signalCode === null) {
      // SIGTERM が無視された (イベントループブロック等)。SIGKILL は捕捉不能。
      // trail.db は WAL モードでクラッシュセーフのため、書き込み中の KILL でも
      // 次回 open 時に自動リカバリされる。
      child.kill('SIGKILL');
      await raceTimeout(waitExit, KILL_REAP_GRACE_MS);
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
