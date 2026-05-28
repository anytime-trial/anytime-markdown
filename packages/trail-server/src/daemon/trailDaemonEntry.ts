// trail-daemon child process のエントリ。
//
// host (extension) から fork され、IPC で `HostRequest` を受けて `DaemonResponse` を返す。
// 内部で MemoryCoreService + AnalyzeAllRunner を構築・管理する設計。
//
// Phase 1: 骨格のみ (dispatch は未実装メソッドで throw)。Phase 2.2 で実装。
//
// バンドルは vscode-trail-extension/webpack.config.js の `trailDaemonConfig` 経由で
// `dist/trail-daemon.js` として生成され、TrailDaemonHost が fork する。

import type {
  HostMessage,
  DaemonMessage,
  DaemonEvent,
  MethodName,
} from './trailDaemonProtocol';

function send(m: DaemonMessage): void {
  process.send?.(m);
}

function sendEvent<C extends DaemonEvent['channel']>(
  channel: C,
  payload: Extract<DaemonEvent, { channel: C }>['payload'],
): void {
  send({ type: 'event', channel, payload } as DaemonEvent);
}

function ok(id: string, result?: unknown): void {
  send({ type: 'response', id, ok: true, result });
}

function fail(id: string, err: unknown): void {
  const e =
    err instanceof Error
      ? { message: err.message, stack: err.stack }
      : { message: String(err) };
  send({ type: 'response', id, ok: false, error: e });
}

/** Phase 2.2 で各 dispatch ハンドラから利用される構造化ロガー (log event ブリッジ)。 */
export const daemonLogger = {
  debug: (m: string) =>
    sendEvent('log', { level: 'debug', message: m, timestamp: new Date().toISOString() }),
  info: (m: string) =>
    sendEvent('log', { level: 'info', message: m, timestamp: new Date().toISOString() }),
  warn: (m: string) =>
    sendEvent('log', { level: 'warn', message: m, timestamp: new Date().toISOString() }),
  error: (m: string) =>
    sendEvent('log', { level: 'error', message: m, timestamp: new Date().toISOString() }),
};

/** dispatch 中。Phase 2.2 で configure / runOnce / start / ... を実装する。 */
export async function dispatch(method: MethodName | string, _params: unknown): Promise<unknown> {
  throw new Error(`unknown or not-yet-implemented method: ${method}`);
}

async function handle(msg: HostMessage): Promise<void> {
  if (msg.type !== 'request') return;
  try {
    ok(msg.id, await dispatch(msg.method, msg.params));
  } catch (e) {
    fail(msg.id, e);
  }
}

// IPC ループと終了ハンドラ。
process.on('message', (m: HostMessage) => {
  void handle(m);
});
process.on('disconnect', () => {
  process.exit(0);
});
process.on('SIGTERM', () => {
  process.exit(0);
});
