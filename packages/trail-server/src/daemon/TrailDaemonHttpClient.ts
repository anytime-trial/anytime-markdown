// TrailDataServer + CodeGraphService (daemon 内 HTTP サーバ) を操作するホスト側の薄いプロキシ。
//
// AnalyzeAllRunnerClient とは責務が独立しているため別ファイルに切り出す。
// extension (host) はこのクライアントを通じて startHttpServer を呼び出し、
// httpReady イベントで実際のポート / URL を受け取る。

import type { TrailDaemonHost } from './TrailDaemonHost';
import type {
  SerializableHttpServerOptions,
  SerializableSetDocsPathRequest,
  SerializableTokenBudgetConfig,
  SerializableTokenBudgetExceededPayload,
} from './trailDaemonProtocol';

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

  /**
   * daemon 内の TrailDataServer に docsPath を設定する。
   * undefined を渡すとパスをクリアする。
   * startHttpServer() 完了後に呼ぶこと。
   */
  async setDocsPath(docsPath?: string): Promise<void> {
    const req: SerializableSetDocsPathRequest = { docsPath };
    await this.host.call('setDocsPath', req);
  }

  /**
   * daemon 内の TrailDataServer にトークン予算設定を反映する。
   * startHttpServer() 完了後に呼ぶこと。
   */
  async setTokenBudgetConfig(config: SerializableTokenBudgetConfig): Promise<void> {
    await this.host.call('setTokenBudgetConfig', config);
  }

  /**
   * `openDocLink` イベントを購読する。
   * daemon 内の TrailDataServer.onOpenDocLink が呼ばれると発火する。
   * extension 側で VS Code API (vscode.commands.executeCommand 等) を呼ぶ。
   * @returns unsubscribe 関数。
   */
  onOpenDocLink(cb: (payload: { docPath: string }) => void): () => void {
    return this.host.on('openDocLink', cb);
  }

  /**
   * `openFile` イベントを購読する。
   * daemon 内の TrailDataServer.onOpenFile が呼ばれると発火する。
   * extension 側で VS Code API (vscode.workspace.openTextDocument 等) を呼ぶ。
   * @returns unsubscribe 関数。
   */
  onOpenFile(cb: (payload: { filePath: string }) => void): () => void {
    return this.host.on('openFile', cb);
  }

  /**
   * `addNotePage` イベントを購読する。
   * daemon 内の TrailDataServer.onAddNotePage が呼ばれると発火する。
   * extension 側で anytime-agent.addAiNotePage コマンドを実行する。
   * @returns unsubscribe 関数。
   */
  onAddNotePage(cb: (payload: { title: string; contextMarkdown: string; imageDataUrl?: string }) => void): () => void {
    return this.host.on('addNotePage', cb);
  }

  /**
   * `tokenBudgetExceeded` イベントを購読する。
   * daemon 内の TrailDataServer.onTokenBudgetExceeded が呼ばれると発火する。
   * extension 側で VS Code 通知 (vscode.window.showWarningMessage 等) を表示する。
   * @returns unsubscribe 関数。
   */
  onTokenBudgetExceeded(cb: (status: SerializableTokenBudgetExceededPayload) => void): () => void {
    return this.host.on('tokenBudgetExceeded', cb);
  }
}
