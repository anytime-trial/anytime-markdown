import * as fs from 'node:fs';
import * as path from 'node:path';

import { TrailDaemonHost } from '../TrailDaemonHost';

const DAEMON_PATH = path.resolve(
  __dirname,
  '../../../../vscode-trail-extension/dist/trail-daemon.js',
);

// この統合テストは vscode-trail-extension の webpack 出力 (dist/trail-daemon.js) を
// 実際に fork する。CI の単体テスト工程は拡張をビルドしないため成果物が無く、その場合は
// スキップする。daemon の protocol / dispatch ロジックは trailDaemonProtocol /
// trailDaemonEntry.* / AnalyzeCommandClient 等の単体テストで個別にカバー済み。
const daemonBuilt = fs.existsSync(DAEMON_PATH);
if (!daemonBuilt) {
  console.warn(
    `[TrailDaemonHost.test] skip integration suite: built daemon not found at ${DAEMON_PATH}`,
  );
}
const describeIfBuilt = daemonBuilt ? describe : describe.skip;

describeIfBuilt('TrailDaemonHost (integration with built daemon)', () => {
  it('未知の method はエラーで reject される', async () => {
    const host = new TrailDaemonHost(DAEMON_PATH);
    host.start();
    try {
      await expect(host.call('unknown' as never)).rejects.toThrow(/unknown method/);
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
