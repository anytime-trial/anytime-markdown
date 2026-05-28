import * as path from 'node:path';

import { TrailDaemonHost } from '../TrailDaemonHost';

const DAEMON_PATH = path.resolve(
  __dirname,
  '../../../../vscode-trail-extension/dist/trail-daemon.js',
);

describe('TrailDaemonHost (integration with built daemon)', () => {
  it('未知の method はエラーで reject される', async () => {
    const host = new TrailDaemonHost(DAEMON_PATH);
    host.start();
    try {
      await expect(host.call('unknown' as never)).rejects.toThrow(/unknown or not-yet-implemented/);
    } finally {
      host.dispose();
    }
  });

  it('start 前に call すると例外', () => {
    const host = new TrailDaemonHost(DAEMON_PATH);
    expect(() => host.call('configure')).toThrow(/not started/);
  });

  it('dispose 後に IPC が閉じる (child 終了 = pending reject)', async () => {
    const host = new TrailDaemonHost(DAEMON_PATH);
    host.start();
    const p = host.call('configure');
    host.dispose();
    await expect(p).rejects.toThrow(/exited|kill/i);
  });
});
