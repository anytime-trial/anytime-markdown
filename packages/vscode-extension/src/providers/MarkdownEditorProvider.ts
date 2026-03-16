import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import * as path from 'path';
export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'anytimeMarkdown';

  private static instance: MarkdownEditorProvider | null = null;
  private activePanel: vscode.WebviewPanel | null = null;
  public compareFileUri: vscode.Uri | null = null;
  public activeDocumentUri: vscode.Uri | null = null;
  public onHeadingsChanged?: (headings: unknown[]) => void;
  public onCommentsChanged?: (comments: unknown[]) => void;
  public onStatusChanged?: (status: { line: number; col: number; charCount: number; lineCount: number; lineEnding: string; encoding: string }) => void;
  public compareModeActive = false;
  public pendingCompareContent: string | null = null;
  public skipDiffDetection = false;
  private panels = new Map<string, vscode.WebviewPanel>();
  /** diff ビュー検出用: 最後にパネルが開かれた時刻 */
  private lastPanelOpenTime = 0;
  private readyPanels = new Set<string>();
  private readyResolvers = new Map<string, Array<() => void>>();

  public static getInstance(): MarkdownEditorProvider | null {
    return MarkdownEditorProvider.instance;
  }

  public postMessageToActivePanel(message: unknown): void {
    this.activePanel?.webview.postMessage(message);
  }

  public waitForReady(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    if (this.readyPanels.has(key)) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const resolvers = this.readyResolvers.get(key) ?? [];
      resolvers.push(resolve);
      this.readyResolvers.set(key, resolvers);
    });
  }

  public postMessageToPanel(uri: vscode.Uri, message: unknown): boolean {
    const panel = this.panels.get(uri.toString());
    if (panel) {
      panel.webview.postMessage(message);
      return true;
    }
    return false;
  }

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MarkdownEditorProvider(context);
    MarkdownEditorProvider.instance = provider;
    return vscode.window.registerCustomEditorProvider(
      MarkdownEditorProvider.viewType,
      provider,
      { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } }
    );
  }

  private constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const localResourceRoots = [
      vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
      vscode.Uri.joinPath(this.context.extensionUri, 'images'),
    ];

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (workspaceFolder) {
      localResourceRoots.push(workspaceFolder.uri);
    } else {
      const docDir = vscode.Uri.file(path.dirname(document.uri.fsPath));
      localResourceRoots.push(docDir);
    }

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots,
    };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    const docDirUri = vscode.Uri.file(path.dirname(document.uri.fsPath));
    const baseUri = webviewPanel.webview.asWebviewUri(docDirUri).toString();

    this.activePanel = webviewPanel;
    this.activeDocumentUri = document.uri;
    this.panels.set(document.uri.toString(), webviewPanel);

    // diff ビュー検出: 1秒以内に2つ目のパネルが開かれた場合
    // skipDiffDetection が true の場合は拡張機能からの意図的なオープンなのでスキップ
    const now = Date.now();
    const isDiffView = !this.skipDiffDetection && now - this.lastPanelOpenTime < 1000;
    this.lastPanelOpenTime = now;
    this.skipDiffDetection = false;

    let isApplyingWebviewEdit = false;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    // 初回ロード後の TipTap 正規化による contentChanged を無視するタイムスタンプ
    // ready 受信後 3 秒以内の最初の contentChanged をスキップ
    let initialLoadTime = 0;
    let initialNormalizationSkipped = false;

    const isLargeFile = () => document.getText().length > 100 * 1024;

    const sendTheme = () => {
      if (disposed) { return; }
      const kind = vscode.window.activeColorTheme.kind;
      const mode = (kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight) ? 'light' : 'dark';
      webviewPanel.webview.postMessage({ type: 'setTheme', mode });
    };

    const sendSettings = () => {
      if (disposed) { return; }
      const config = vscode.workspace.getConfiguration('anytimeMarkdown');
      webviewPanel.webview.postMessage({
        type: 'setSettings',
        settings: {
          fontSize: config.get<number>('fontSize', 0),
          editorMaxWidth: config.get<number>('editorMaxWidth', 0),
        },
      });
    };

    const updateWebview = () => {
      if (disposed) { return; }
      webviewPanel.webview.postMessage({
        type: 'setBaseUri',
        baseUri,
      });
      const msg: { type: string; content: string; compareContent?: string } = {
        type: 'setContent',
        content: document.getText(),
      };
      if (this.pendingCompareContent !== null) {
        msg.compareContent = this.pendingCompareContent;
        this.pendingCompareContent = null;
      }
      webviewPanel.webview.postMessage(msg);
    };

    // 自身の編集・保存直後（2秒以内）の変更通知を抑制するタイムスタンプ
    let lastApplyTime = 0;

    const docChangeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) { return; }
      if (isApplyingWebviewEdit) { return; }
      // Undo/Redo は即反映、それ以外（外部変更の同期）は VS Code 通知
      if (e.reason === vscode.TextDocumentChangeReason.Undo || e.reason === vscode.TextDocumentChangeReason.Redo) {
        updateWebview();
      } else if (Date.now() - lastApplyTime >= 2000) {
        showExternalChangeNotification(document.getText());
      }
    });

    // 保存前に lastApplyTime を更新（Ctrl+S 等の VS Code ネイティブ保存を含む）
    // onWillSave はファイル書き込み前に発火するため、fileWatcher より先に抑制できる
    const saveSubscription = vscode.workspace.onWillSaveTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        lastApplyTime = Date.now();
      }
    });

    // 外部変更検知（Claude Code、git 操作、他のエディタなど）
    let notificationVisible = false;
    const showExternalChangeNotification = (content: string) => {
      if (disposed || notificationVisible) { return; }
      notificationVisible = true;
      const fileName = path.basename(document.uri.fsPath);
      vscode.window.showInformationMessage(
        `${fileName} が外部で変更されました`,
        '再読込'
      ).then((selection) => {
        notificationVisible = false;
        if (selection === '再読込' && !disposed) {
          webviewPanel.webview.postMessage({ type: 'setBaseUri', baseUri });
          webviewPanel.webview.postMessage({ type: 'setContent', content });
        }
      });
    };

    const fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(path.dirname(document.uri.fsPath)), path.basename(document.uri.fsPath))
    );
    fileWatcher.onDidChange(async () => {
      if (disposed) { return; }
      // 自身の保存直後（2秒以内）は無視
      if (Date.now() - lastApplyTime < 2000) { return; }
      try {
        const bytes = await vscode.workspace.fs.readFile(document.uri);
        const diskContent = new TextDecoder().decode(bytes);
        if (diskContent === document.getText()) { return; }
        showExternalChangeNotification(diskContent);
      } catch {
        // ファイル読み取り失敗時は無視
      }
    });

    const configChangeSubscription = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('anytimeMarkdown')) {
        sendSettings();
      }
    });

    const themeChangeSubscription = vscode.window.onDidChangeActiveColorTheme(() => {
      sendTheme();
    });

    webviewPanel.webview.onDidReceiveMessage(async (message: { type: string; content?: string; active?: boolean; headings?: unknown[]; comments?: unknown[]; status?: { line: number; col: number; charCount: number; lineCount: number; lineEnding: string; encoding: string } }) => {
      switch (message.type) {
        case 'ready': {
          initialLoadTime = Date.now();
          initialNormalizationSkipped = false;
          updateWebview();
          sendSettings();
          sendTheme();
          // diff ビューの場合は全パネルにランディング画面を表示するよう通知
          if (isDiffView) {
            for (const [, panel] of this.panels) {
              panel.webview.postMessage({ type: 'setLanding', landing: true });
            }
          }
          const key = document.uri.toString();
          this.readyPanels.add(key);
          const resolvers = this.readyResolvers.get(key);
          if (resolvers) {
            this.readyResolvers.delete(key);
            resolvers.forEach(r => r());
          }
          break;
        }

        case 'scrollChanged': {
          // 自分以外の全パネルにスクロール位置を中継
          const ratio = (message as { type: string; ratio: number }).ratio;
          for (const [, panel] of this.panels) {
            if (panel !== webviewPanel) {
              panel.webview.postMessage({ type: 'syncScroll', ratio });
            }
          }
          break;
        }

        case 'compareModeChanged':
          this.compareModeActive = !!message.active;
          vscode.commands.executeCommand('setContext', 'anytimeMarkdown.compareModeActive', this.compareModeActive);
          break;

        case 'headingsChanged':
          if (message.headings) { this.onHeadingsChanged?.(message.headings); }
          break;

        case 'commentsChanged':
          if (message.comments) { this.onCommentsChanged?.(message.comments); }
          break;

        case 'statusChanged':
          if (message.status) { this.onStatusChanged?.(message.status); }
          break;

        case 'saveCompareFile':
          if (this.compareFileUri && typeof message.content === 'string') {
            try {
              await vscode.workspace.fs.writeFile(this.compareFileUri, new TextEncoder().encode(message.content));
            } catch (err) {
              vscode.window.showErrorMessage(`Error saving compare file: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
          break;

        case 'contentChanged': {
          let newContent = message.content;
          if (typeof newContent !== 'string') { return; }
          // POSIX 準拠: テキストファイルは末尾改行で終わる
          if (newContent && !newContent.endsWith("\n")) { newContent += "\n"; }
          if (newContent === document.getText()) { return; }
          // 初回ロード後 3 秒以内の最初の contentChanged は TipTap 正規化として無視
          if (!initialNormalizationSkipped && Date.now() - initialLoadTime < 3000) {
            initialNormalizationSkipped = true;
            const fileName = path.basename(document.uri.fsPath);
            vscode.window.showInformationMessage(
              `${fileName}: 保存時にフォーマット整形が行われます`
            );
            return;
          }

          if (debounceTimer) { clearTimeout(debounceTimer); }
          const delay = isLargeFile() ? 800 : 300;
          debounceTimer = setTimeout(async () => {
            if (disposed) { return; }
            if (newContent === document.getText()) { return; }
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
              document.positionAt(0),
              document.positionAt(document.getText().length)
            );
            edit.replace(document.uri, fullRange, newContent);
            lastApplyTime = Date.now();
            isApplyingWebviewEdit = true;
            try {
              const success = await vscode.workspace.applyEdit(edit);
              if (!success) {
                vscode.window.showWarningMessage('Failed to apply edit to the document.');
              }
            } catch (err) {
              vscode.window.showErrorMessage(`Error saving changes: ${err instanceof Error ? err.message : String(err)}`);
            } finally {
              isApplyingWebviewEdit = false;
            }
          }, delay);
          break;
        }

        case 'openLink': {
          const rawHref = (message as { type: string; href?: string }).href;
          if (typeof rawHref !== 'string') { return; }
          const href = decodeURIComponent(rawHref);
          // #L行番号 フラグメントを解析
          const lineMatch = href.match(/#L(\d+)$/);
          const filePath = lineMatch ? href.replace(/#L\d+$/, '') : href;
          // パストラバーサル防止: 絶対パスを拒否
          if (path.isAbsolute(filePath)) {
            vscode.window.showWarningMessage(`Invalid file path: ${filePath}`);
            return;
          }
          const docDir = path.dirname(document.uri.fsPath);
          const targetPath = path.resolve(docDir, filePath);
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          // resolve 後のパスがワークスペースルート配下であることを検証
          if (workspaceRoot && !targetPath.startsWith(workspaceRoot + path.sep) && targetPath !== workspaceRoot) {
            // ワークスペースルートからの相対パスもフォールバックとして試す
            const fromRoot = path.resolve(workspaceRoot, filePath);
            if (!fromRoot.startsWith(workspaceRoot + path.sep)) {
              vscode.window.showWarningMessage(`Invalid file path: ${filePath}`);
              return;
            }
          }
          const candidates = [targetPath];
          if (workspaceRoot) {
            const fromRoot = path.resolve(workspaceRoot, filePath);
            if (fromRoot !== targetPath) { candidates.push(fromRoot); }
          }
          let opened = false;
          for (const candidate of candidates) {
            const uri = vscode.Uri.file(candidate);
            try {
              if (lineMatch) {
                const line = Math.max(0, parseInt(lineMatch[1], 10) - 1);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, {
                  selection: new vscode.Range(line, 0, line, 0),
                });
              } else {
                await vscode.commands.executeCommand('vscode.open', uri);
              }
              opened = true;
              break;
            } catch {
              // 次の候補を試す
            }
          }
          if (!opened) {
            vscode.window.showWarningMessage(`Cannot open file: ${href}`);
          }
          break;
        }

        case 'requestReload':
          try {
            const bytes = await vscode.workspace.fs.readFile(document.uri);
            const diskContent = new TextDecoder().decode(bytes);
            webviewPanel.webview.postMessage({ type: 'setBaseUri', baseUri });
            webviewPanel.webview.postMessage({ type: 'setContent', content: diskContent });
          } catch (err) {
            vscode.window.showErrorMessage(`Error reloading file: ${err instanceof Error ? err.message : String(err)}`);
          }
          break;

        case 'save':
          try {
            await document.save();
          } catch (err) {
            vscode.window.showErrorMessage(`Error saving file: ${err instanceof Error ? err.message : String(err)}`);
          }
          break;
      }
    });

    webviewPanel.onDidDispose(() => {
      disposed = true;
      const key = document.uri.toString();
      this.panels.delete(key);
      this.readyPanels.delete(key);
      const resolvers = this.readyResolvers.get(key);
      if (resolvers) {
        this.readyResolvers.delete(key);
        resolvers.forEach(r => r());
      }
      if (this.activePanel === webviewPanel) {
        this.activePanel = null;
        this.compareFileUri = null;
        this.activeDocumentUri = null;
        this.compareModeActive = false;
        vscode.commands.executeCommand('setContext', 'anytimeMarkdown.compareModeActive', false);
      }
      docChangeSubscription.dispose();
      saveSubscription.dispose();
      configChangeSubscription.dispose();
      themeChangeSubscription.dispose();
      fileWatcher.dispose();
      if (debounceTimer) { clearTimeout(debounceTimer); }
    });
  }

  private async getRelativePath(uri: vscode.Uri): Promise<string | null> {
    const gitExtension = vscode.extensions.getExtension<{ getAPI(version: 1): { getRepository(uri: vscode.Uri): { rootUri: vscode.Uri } | null } }>('vscode.git');
    if (!gitExtension) { return null; }
    if (!gitExtension.isActive) { await gitExtension.activate(); }
    const repo = gitExtension.exports.getAPI(1).getRepository(uri);
    if (!repo) { return null; }
    return path.relative(repo.rootUri.fsPath, uri.fsPath).replace(/\\/g, '/');
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );
    const logoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'images', 'camel_markdown.png')
    );
    const nonce = randomBytes(16).toString('hex');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:;">
    <title>Markdown Editor</title>
    <style>
      html, body, #root { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
      #root > .MuiBox-root { padding: 0 !important; }
      #root > .MuiBox-root > .MuiBox-root:empty { display: none !important; margin: 0 !important; }
    </style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">window.__LOGO_URI__ = "${logoUri}";</script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
