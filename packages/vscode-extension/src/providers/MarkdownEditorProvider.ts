import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import * as path from 'path';

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'anytimeMarkdownEditor';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      MarkdownEditorProvider.viewType,
      new MarkdownEditorProvider(context),
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

    let isApplyingWebviewEdit = false;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const isLargeFile = () => document.getText().length > 100 * 1024;

    const sendSettings = () => {
      if (disposed) { return; }
      const config = vscode.workspace.getConfiguration('anytimeMarkdownEditor');
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
      if (e.affectsConfiguration('anytimeMarkdownEditor')) {
        sendSettings();
      }
    });

    webviewPanel.webview.onDidReceiveMessage(async (message: { type: string; content?: string }) => {
      switch (message.type) {
        case 'ready':
          updateWebview();
          sendSettings();
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
      docChangeSubscription.dispose();
      configChangeSubscription.dispose();
      if (debounceTimer) { clearTimeout(debounceTimer); }
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );
    const nonce = randomBytes(16).toString('hex');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:;">
    <title>Markdown Editor</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
