import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import * as path from 'path';

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'anytimeMarkdown';

  private static instance: MarkdownEditorProvider | null = null;
  private activePanel: vscode.WebviewPanel | null = null;
  public compareFileUri: vscode.Uri | null = null;
  public activeDocumentUri: vscode.Uri | null = null;

  private panels = new Map<string, vscode.WebviewPanel>();
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
      { supportsMultipleEditorsPerDocument: false }
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

    let isApplyingWebviewEdit = false;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

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
          lineHeight: config.get<number>('lineHeight', 1.6),
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
      webviewPanel.webview.postMessage({
        type: 'setContent',
        content: document.getText(),
      });
    };

    const docChangeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) { return; }
      if (isApplyingWebviewEdit) { return; }
      updateWebview();
    });

    const configChangeSubscription = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('anytimeMarkdown')) {
        sendSettings();
      }
    });

    const themeChangeSubscription = vscode.window.onDidChangeActiveColorTheme(() => {
      sendTheme();
    });

    webviewPanel.webview.onDidReceiveMessage(async (message: { type: string; content?: string; active?: boolean }) => {
      switch (message.type) {
        case 'ready': {
          updateWebview();
          sendSettings();
          sendTheme();
          const key = document.uri.toString();
          this.readyPanels.add(key);
          const resolvers = this.readyResolvers.get(key);
          if (resolvers) {
            this.readyResolvers.delete(key);
            resolvers.forEach(r => r());
          }
          break;
        }

        case 'compareModeChanged':
          vscode.commands.executeCommand('setContext', 'anytimeMarkdown.compareModeActive', !!message.active);
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
          const newContent = message.content;
          if (typeof newContent !== 'string') { return; }
          if (newContent === document.getText()) { return; }

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
          const href = (message as { type: string; href?: string }).href;
          if (typeof href !== 'string') { return; }
          const docDir = path.dirname(document.uri.fsPath);
          const targetPath = path.resolve(docDir, href);
          const targetUri = vscode.Uri.file(targetPath);
          try {
            await vscode.commands.executeCommand('vscode.open', targetUri);
          } catch {
            vscode.window.showWarningMessage(`Cannot open file: ${href}`);
          }
          break;
        }

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
        vscode.commands.executeCommand('setContext', 'anytimeMarkdown.compareModeActive', false);
      }
      docChangeSubscription.dispose();
      configChangeSubscription.dispose();
      themeChangeSubscription.dispose();
      if (debounceTimer) { clearTimeout(debounceTimer); }
    });
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
