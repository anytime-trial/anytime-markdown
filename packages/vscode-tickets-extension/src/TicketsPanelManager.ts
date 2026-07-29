import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { TicketProvider } from '@anytime-markdown/tickets-core';

import type { Logger } from './logger';
import {
  handleTicketsRpc,
  TICKETS_RPC_METHODS,
  type TicketsRpcMethod,
  type TicketsRpcRequest,
  type TicketsRpcResponse,
} from './ticketsRpcHandler';
import type { TicketSource } from './repoResolver';

/**
 * CSP nonce の生成。このファイルは extension バンドル（webpack.config.js の
 * extensionConfig, target: 'node'）専用で webview バンドル（target: 'web'）からは
 * import されないため node:crypto を安全に使える
 * （vscode-graph-extension の CooccurrenceEditorProvider と同じパターン）。
 * 万一 import が webview 側へ混入していないかは、ビルド後に
 * `grep -c "node:crypto" dist/webview.js` が 0 であることで確認する。
 */
function makeNonce(): string {
  return randomBytes(16).toString('hex');
}

export interface PanelContext {
  source: TicketSource | null;
  provider: TicketProvider | null;
  currentUser?: string;
  locale: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTicketsRpcMethod(value: unknown): value is TicketsRpcMethod {
  return typeof value === 'string' && (TICKETS_RPC_METHODS as readonly string[]).includes(value);
}

/**
 * webview からの postMessage は信頼できない外部入力のため、`as TicketsRpcRequest` のような
 * 型アサーションではなく実行時に形を検査する（ticketsRpcHandler.ts / rpcGateway.ts /
 * initMessage.ts と同じ isRecord ベースの型ガードパターンに揃える）。
 * `params` は未検証のまま通す（各メソッドの dispatch 内で個別にバリデーションされるため、
 * ここでの責務は type/id/method の外形検査に限定する）。
 */
export function isTicketsRpcRequest(value: unknown): value is TicketsRpcRequest {
  return (
    isRecord(value) &&
    value.type === 'rpc' &&
    typeof value.id === 'string' &&
    isTicketsRpcMethod(value.method)
  );
}

/** TicketSource を webview 表示用のラベルへ変換する純粋関数。branch が空文字列なら省略する。 */
export function describeTicketSource(source: TicketSource): string {
  return source.branch ? `${source.repo} / ${source.branch}` : source.repo;
}

function authRequiredResponse(id: string): TicketsRpcResponse {
  return {
    type: 'rpcResult',
    id,
    error: {
      message: 'GitHub 認証またはリポジトリ設定が未完了です',
      status: 401,
      conflict: false,
      validationErrors: [],
    },
  };
}

/** チケットボードの WebviewPanel を 1 枚だけ保持し、RPC を拡張ホストへ橋渡しする。 */
export class TicketsPanelManager {
  private panel: vscode.WebviewPanel | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger,
    private readonly resolveContext: () => Promise<PanelContext>,
    private readonly onSelectRepo: () => Promise<void>,
  ) {}

  async open(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active);
      await this.postInit();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'anytimeTickets.board',
      'Anytime Tickets',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        // チケットボードは入力途中のフォーム状態を保持したいタブである。非表示化のたびに
        // React ツリーが破棄されると編集中の内容が失われるため、メモリ消費とのトレードオフを
        // 踏まえたうえで意図的に retainContextWhenHidden: true を選ぶ（判断記録）。
        retainContextWhenHidden: true,
        // dist/webview.js 以外のローカルリソースを読み込ませない（CSP と二重の防御）。
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
      },
    );
    // html 設定（webview 側スクリプトの実行開始）より前に dispose / message ハンドラを
    // 登録しておく。順序を逆にすると理論上 'ready' 受信を取りこぼす窓ができる。
    this.panel = panel;
    panel.onDidDispose(() => {
      this.panel = null;
    });
    panel.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleMessage(message);
    });
    panel.webview.html = this.buildHtml(panel.webview);
  }

  async reload(): Promise<void> {
    await this.postInit();
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isRecord(message)) return;
    const type = message.type;
    if (type === 'ready') {
      await this.postInit();
      return;
    }
    if (type === 'selectRepo') {
      await this.onSelectRepo();
      return;
    }
    if (type !== 'rpc') return;
    if (!isTicketsRpcRequest(message)) {
      this.logger.warn('不正な RPC メッセージを無視しました（type/id/method の形が想定外です）。');
      return;
    }
    await this.handleRpc(message);
  }

  private async handleRpc(request: TicketsRpcRequest): Promise<void> {
    const { provider } = await this.resolveContext();
    if (!provider) {
      this.postToPanel(authRequiredResponse(request.id));
      return;
    }
    const response = await handleTicketsRpc({ provider, logger: this.logger, request });
    this.postToPanel(response);
  }

  private async postInit(): Promise<void> {
    const ctx = await this.resolveContext();
    this.postToPanel({
      type: 'init',
      source: ctx.source ? { label: describeTicketSource(ctx.source) } : null,
      currentUser: ctx.currentUser,
      locale: ctx.locale,
    });
  }

  /**
   * resolveContext() の await 中にパネルが破棄され得る（onDidDispose で this.panel = null）
   * ため、送信直前に一度だけ null チェックする単一の書き込み経路にまとめる。破棄後の
   * webview へ postMessage を試みても届け先が無く無意味なため、ここで打ち切る。
   */
  private postToPanel(message: unknown): void {
    if (!this.panel) return;
    void this.panel.webview.postMessage(message);
  }

  private buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'),
    );
    const nonce = makeNonce();
    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' ${webview.cspSource}; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
<title>Anytime Tickets</title>
<style>
  html, body, #root { height: 100%; margin: 0; padding: 0; }
</style>
</head><body>
<div id="root"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body></html>`;
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = null;
  }
}
