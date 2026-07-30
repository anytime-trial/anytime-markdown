import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { TicketProvider } from '@anytime-markdown/tickets-core';

import type { TicketsLogger } from './ticketsRpcHandler';
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
 * `grep -c "node:crypto" dist/tickets-webview.js` が 0 であることで確認する。
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

/**
 * resolveContext() が例外を投げたときの webview 応答。例外の実メッセージ（GitHub
 * トークン・ファイルパス等の機密を含み得る）は一切埋め込まず、固定の汎用文言のみを返す
 * （詳細は handleRpc の catch 内で Logger へ記録済み）。
 */
function contextResolutionFailedResponse(id: string): TicketsRpcResponse {
  return {
    type: 'rpcResult',
    id,
    error: {
      message: 'リポジトリの解決または GitHub 認証中にエラーが発生しました。再読み込みしてください。',
      status: 500,
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
    private readonly logger: TicketsLogger,
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
      'anytimeAgent.ticketsBoard',
      'Anytime Tickets',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        // チケットボードは入力途中のフォーム状態を保持したいタブである。非表示化のたびに
        // React ツリーが破棄されると編集中の内容が失われるため、メモリ消費とのトレードオフを
        // 踏まえたうえで意図的に retainContextWhenHidden: true を選ぶ（判断記録）。
        retainContextWhenHidden: true,
        // dist/tickets-webview.js 以外のローカルリソースを読み込ませない（CSP と二重の防御）。
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
      // handleMessage 内部（特に handleRpc の resolveContext 呼び出し）は throw しうる。
      // void で fire-and-forget すると例外が未処理 Promise 拒否として消え、Logger に
      // 一切残らない（silent catch より悪い「検知不能」状態）ため、必ず catch してログへ残す。
      // rpc リクエストに対する応答生成（webview 側 Promise の解決）は handleRpc 側の
      // 個別 catch が担うため、ここでは「拾い漏れの最終防衛線」として汎用ログのみ行う。
      this.handleMessage(message).catch((error: unknown) => {
        this.logger.error('webview メッセージの処理に失敗しました', error);
      });
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
    let provider: TicketProvider | null;
    try {
      ({ provider } = await this.resolveContext());
    } catch (error) {
      // resolveContext() は handleTicketsRpc() の try/catch の外側で呼ばれており
      // （getGitHubToken の認証 API 呼び出し・createProvider の初期化等が失敗しうる）、
      // ここで捕捉しないと webview 側 rpcGateway.pending に積まれた Promise が
      // タイムアウト無しで永久に解決しない（画面が固まったまま操作不能になる）。
      // 応答は固定の汎用文言のみとし、error のメッセージ（トークン・パス等の機密を
      // 含み得る）はそのまま webview へは渡さない。詳細は Logger 側にのみ残す。
      this.logger.error(`RPC ${request.method} の前処理(resolveContext)に失敗しました (id=${request.id})`, error);
      this.postToPanel(contextResolutionFailedResponse(request.id));
      return;
    }
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
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'tickets-webview.js'),
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
