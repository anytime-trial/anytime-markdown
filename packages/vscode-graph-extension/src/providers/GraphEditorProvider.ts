import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';

export class GraphEditorProvider implements vscode.CustomTextEditorProvider {
	public static readonly viewType = 'anytimeGraph';

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		return vscode.window.registerCustomEditorProvider(
			GraphEditorProvider.viewType,
			new GraphEditorProvider(context),
			{
				supportsMultipleEditorsPerDocument: false,
				webviewOptions: { retainContextWhenHidden: true },
			},
		);
	}

	private constructor(private readonly context: vscode.ExtensionContext) {}

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken,
	): Promise<void> {
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
			],
		};

		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		// Send initial document content to webview
		const sendDocument = () => {
			try {
				const json = JSON.parse(document.getText());
				webviewPanel.webview.postMessage({ type: 'load', document: json });
			} catch {
				// Invalid JSON — send empty document
				webviewPanel.webview.postMessage({
					type: 'load',
					document: {
						id: '',
						name: 'Untitled',
						nodes: [],
						edges: [],
						viewport: { offsetX: 0, offsetY: 0, scale: 1 },
						createdAt: Date.now(),
						updatedAt: Date.now(),
					},
				});
			}
		};

		// Send theme info
		const sendTheme = () => {
			const kind = vscode.window.activeColorTheme.kind;
			const isDark = kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
			webviewPanel.webview.postMessage({ type: 'theme', kind: isDark ? 'dark' : 'light' });
		};

		// Track edits originating from webview to avoid echo
		let isWebviewEdit = false;

		// Handle messages from webview
		webviewPanel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.type) {
					case 'ready':
						sendDocument();
						sendTheme();
						break;
					case 'update': {
						const json = JSON.stringify(message.document, null, 2);
						const edit = new vscode.WorkspaceEdit();
						edit.replace(
							document.uri,
							new vscode.Range(0, 0, document.lineCount, 0),
							json,
						);
						isWebviewEdit = true;
						await vscode.workspace.applyEdit(edit);
						isWebviewEdit = false;
						break;
					}
				}
			},
			undefined,
		);

		// Update webview when document changes externally
		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() === document.uri.toString() && e.contentChanges.length > 0 && !isWebviewEdit) {
				sendDocument();
			}
		});

		// Theme change
		const themeSubscription = vscode.window.onDidChangeActiveColorTheme(() => {
			sendTheme();
		});

		webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
			themeSubscription.dispose();
		});
	}

	private getHtmlForWebview(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'),
		);
		const nonce = randomBytes(16).toString('hex');

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
	<title>Graph Editor</title>
	<style>
		html, body, #root {
			margin: 0;
			padding: 0;
			width: 100%;
			height: 100vh;
			overflow: hidden;
			background: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
			font-family: var(--vscode-font-family);
		}
	</style>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}
