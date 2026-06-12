import { EventEmitter } from 'node:events';

// fork を mock し、実 daemon を起動せず dispose() の kill エスカレーションを検証する。
// 既存の TrailDaemonHost.test.ts は dist/trail-daemon.js を実 fork する統合テストで、
// CI ではビルド成果物が無くスキップされる。孤児化対策の核 (SIGTERM → SIGKILL) は
// この mock 単体テストで担保する。
jest.mock('node:child_process', () => ({ fork: jest.fn() }));

import { fork } from 'node:child_process';

import { TrailDaemonHost } from '../TrailDaemonHost';

/** SIGTERM に反応しない / する子プロセスを模した fake。 */
class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: string | null = null;
  /** 'ignore' = SIGTERM 無視 (イベントループブロック相当)、'exitOnTerm' = SIGTERM で即終了。 */
  killBehavior: 'ignore' | 'exitOnTerm' = 'ignore';

  readonly kill = jest.fn((signal?: NodeJS.Signals | number): boolean => {
    const sig = signal ?? 'SIGTERM';
    const isKill = sig === 'SIGKILL' || sig === 9;
    const isTerm = sig === 'SIGTERM' || sig === 15;
    if (isKill || (isTerm && this.killBehavior === 'exitOnTerm')) {
      this.signalCode = String(sig);
      this.emit('exit', null, String(sig));
    }
    return true;
  });

  readonly send = jest.fn();
}

const forkMock = fork as jest.MockedFunction<typeof fork>;
let lastChild: FakeChild | null = null;

beforeEach(() => {
  lastChild = null;
  forkMock.mockReset();
  forkMock.mockImplementation((): never => {
    lastChild = new FakeChild();
    return lastChild as never;
  });
});

describe('TrailDaemonHost.dispose() の kill エスカレーション', () => {
  it('SIGTERM に無反応な child には timeout 後 SIGKILL を送る', async () => {
    const host = new TrailDaemonHost('/fake/trail-daemon.js');
    host.start();
    const child = lastChild!;
    child.killBehavior = 'ignore';

    await host.dispose(30);

    const signals = child.kill.mock.calls.map((c) => c[0]);
    expect(signals).toContain('SIGTERM');
    expect(signals).toContain('SIGKILL');
    // SIGTERM が SIGKILL より先に送られていること。
    expect(signals.indexOf('SIGTERM')).toBeLessThan(signals.indexOf('SIGKILL'));
  });

  it('SIGTERM で即終了する child には SIGKILL を送らない', async () => {
    const host = new TrailDaemonHost('/fake/trail-daemon.js');
    host.start();
    const child = lastChild!;
    child.killBehavior = 'exitOnTerm';

    await host.dispose(30);

    const signals = child.kill.mock.calls.map((c) => c[0]);
    expect(signals).toContain('SIGTERM');
    expect(signals).not.toContain('SIGKILL');
  });

  it('start 前の dispose は no-op で resolve する', async () => {
    const host = new TrailDaemonHost('/fake/trail-daemon.js');
    await expect(host.dispose(30)).resolves.toBeUndefined();
    expect(forkMock).not.toHaveBeenCalled();
  });

  it('dispose は child 終了後に resolve する (await 可能)', async () => {
    const host = new TrailDaemonHost('/fake/trail-daemon.js');
    host.start();
    lastChild!.killBehavior = 'exitOnTerm';

    let resolved = false;
    await host.dispose(30).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(true);
  });
});
