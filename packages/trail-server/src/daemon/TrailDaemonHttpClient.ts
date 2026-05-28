// TrailDataServer + CodeGraphService (daemon 内 HTTP サーバ) を操作するホスト側の薄いプロキシ。
//
// AnalyzeAllRunnerClient とは責務が独立しているため別ファイルに切り出す。
// extension (host) はこのクライアントを通じて startHttpServer を呼び出し、
// httpReady イベントで実際のポート / URL を受け取る。

import type { TrailDaemonHost } from './TrailDaemonHost';
import type { SerializableHttpServerOptions } from './trailDaemonProtocol';

export class TrailDaemonHttpClient {
  constructor(private readonly host: TrailDaemonHost) {}

  /**
   * `httpReady` イベントを購読する。
   * @returns unsubscribe 関数。不要になったら呼ぶこと。
   */
  onHttpReady(cb: (info: { port: number; url: string }) => void): () => void {
    return this.host.on('httpReady', cb);
  }

  /**
   * daemon 内で TrailDataServer + CodeGraphService を起動するよう指示する。
   * 結果 (port / url) は `onHttpReady` で非同期に受け取る。
   * 冪等: 既に起動済みなら daemon が httpReady を再 emit して返す。
   */
  async start(opts: SerializableHttpServerOptions): Promise<void> {
    await this.host.call('startHttpServer', opts);
  }
}
