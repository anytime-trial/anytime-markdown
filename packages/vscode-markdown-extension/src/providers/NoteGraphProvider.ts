/**
 * ノート網ビューア（サイドバー Webview View）。
 *
 * 対象 git リポジトリの `.md` フロントマターを走査し、ドキュメント関係グラフを
 * webview（graph-core 描画）へ送る。DB には一切書き込まない。
 *
 * webview → 拡張ホストのメッセージ:
 * - `ready`            : webview 初期化完了 → 初回スキャン
 * - `openDoc {path}`   : ノードクリック → 該当 `.md` を開く
 * - `connect {from,to}`: 接続モード → from の frontmatter `related` に to を追記
 * - `refresh`          : 再スキャン要求
 * - `pickRepository`   : 対象リポジトリ選択コマンドを起動
 */

import * as vscode from 'vscode';
import * as fsp from 'fs/promises';
import { randomBytes } from 'crypto';
import { resolveRepositoryRoot, scanRepository, resolveDocPath } from '../noteGraph/scan';
import { addRelatedEntry } from '../noteGraph/frontmatter';

type Log = (line: string) => void;

const CONFIG_SECTION = 'anytimeMarkdown';
const CONFIG_KEY = 'noteGraph.repositoryPath';

export class NoteGraphProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'anytimeMarkdown.noteGraph';

  private view: vscode.WebviewView | undefined;
  private watcher: vscode.FileSystemWatcher | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: Log,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg) => this.handleMessage(msg), undefined, this.context.subscriptions);
    webviewView.onDidDispose(
      () => {
        this.disposeWatcher();
        this.view = undefined;
      },
      undefined,
      this.context.subscriptions,
    );

    // テーマ変更で配色を更新
    this.context.subscriptions.push(
      vscode.window.onDidChangeActiveColorTheme(() => this.refresh()),
    );
  }

  /** 対象リポジトリのルートを解決する。 */
  private repositoryRoot(): string | null {
    const configPath = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(CONFIG_KEY, '') ?? '';
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return resolveRepositoryRoot(configPath, workspaceDir);
  }

  private isDark(): boolean {
    const kind = vscode.window.activeColorTheme.kind;
    return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
  }

  /** 再スキャンしてグラフを webview へ送る。 */
  async refresh(): Promise<void> {
    if (!this.view) return;
    const root = this.repositoryRoot();
    if (!root) {
      void this.view.webview.postMessage({ type: 'error', message: 'noRepository' });
      return;
    }
    try {
      const docs = await scanRepository(root, this.log);
      this.ensureWatcher(root);
      void this.view.webview.postMessage({ type: 'docs', docs, isDark: this.isDark(), root });
      this.log(`[noteGraph] scanned ${docs.length} docs in ${root}`);
    } catch (err) {
      this.log(`[noteGraph] scan error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
      void this.view.webview.postMessage({ type: 'error', message: 'scanFailed' });
    }
  }

  private async handleMessage(msg: unknown): Promise<void> {
    if (typeof msg !== 'object' || msg === null) return;
    const m = msg as { type?: string; path?: string; from?: string; to?: string };
    switch (m.type) {
      case 'ready':
        await this.refresh();
        break;
      case 'refresh':
        await this.refresh();
        break;
      case 'openDoc':
        if (m.path) await this.openDoc(m.path);
        break;
      case 'connect':
        if (m.from && m.to) await this.connect(m.from, m.to);
        break;
      case 'pickRepository':
        await vscode.commands.executeCommand('anytime-markdown.selectNoteGraphRepository');
        break;
      default:
        break;
    }
  }

  private async openDoc(relPath: string): Promise<void> {
    const root = this.repositoryRoot();
    if (!root) return;
    let uri: vscode.Uri;
    try {
      uri = vscode.Uri.file(resolveDocPath(root, relPath));
    } catch (err) {
      // パストラバーサル等でルート外を指す参照はここで弾く
      this.log(`[noteGraph] openDoc rejected: ${relPath} ${String(err)}`);
      return;
    }
    try {
      await vscode.commands.executeCommand('vscode.openWith', uri, 'anytimeMarkdown');
    } catch (err) {
      // カスタムエディタで開けない場合は通常エディタへフォールバック
      this.log(`[noteGraph] openWith failed (falling back): ${relPath} ${String(err)}`);
      await vscode.window.showTextDocument(uri).then(undefined, (e) => {
        this.log(`[noteGraph] openDoc failed: ${relPath} ${String(e)}`);
      });
    }
  }

  private async connect(fromRel: string, toRel: string): Promise<void> {
    if (fromRel === toRel) return;
    const root = this.repositoryRoot();
    if (!root) return;
    const fromPath = resolveDocPath(root, fromRel);
    try {
      const content = await fsp.readFile(fromPath, 'utf8');
      const next = addRelatedEntry(content, toRel);
      if (next === content) return; // 冪等（既存）
      await fsp.writeFile(fromPath, next, 'utf8');
      this.log(`[noteGraph] linked ${fromRel} -> ${toRel}`);
      await this.refresh();
    } catch (err) {
      this.log(`[noteGraph] connect failed: ${fromRel} -> ${toRel} ${String(err)}`);
      void vscode.window.showErrorMessage(`関連付けに失敗しました: ${fromRel}`);
    }
  }

  private ensureWatcher(root: string): void {
    this.disposeWatcher();
    const pattern = new vscode.RelativePattern(vscode.Uri.file(root), '**/*.md');
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const onChange = (): void => this.scheduleRefresh();
    this.watcher.onDidCreate(onChange);
    this.watcher.onDidDelete(onChange);
    this.watcher.onDidChange(onChange);
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refresh(), 400);
  }

  private disposeWatcher(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.watcher?.dispose();
    this.watcher = undefined;
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'noteGraph.js'),
    );
    const nonce = randomBytes(16).toString('hex');
    return `<!DOCTYPE html>
<html lang="${vscode.env.language}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:;">
    <title>Note Graph</title>
    <style>
      html, body, #root { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    </style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
