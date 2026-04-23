import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { resolveLocale } from '@anytime-markdown/vscode-common';

type SheetFormat = 'sheet' | 'csv' | 'tsv';

function formatOf(uri: vscode.Uri): SheetFormat {
	const ext = path.extname(uri.fsPath).toLowerCase();
	if (ext === '.csv') return 'csv';
	if (ext === '.tsv') return 'tsv';
	return 'sheet';
}

function currentLocale(): 'ja' | 'en' {
	return resolveLocale(undefined, vscode.env.language);
}

export class SheetEditorProvider implements vscode.CustomTextEditorProvider {
	public static readonly viewTypeSheet = 'anytimeSheet';
	public static readonly viewTypeCsv = 'anytimeSheet.csv';

	public static register(context: vscode.ExtensionContext): vscode.Disposable[] {
		const provider = new SheetEditorProvider(context);
		return [
			vscode.window.registerCustomEditorProvider(
				SheetEditorProvider.viewTypeSheet,
				provider,
				{ supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } },
			),
			vscode.window.registerCustomEditorProvider(
				SheetEditorProvider.viewTypeCsv,
				provider,
				{ supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } },
			),
		];
	}

	private constructor(private readonly context: vscode.ExtensionContext) {}

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken,
	): Promise<void> {
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
		};

		const locale = currentLocale();
		const format = formatOf(document.uri);
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, locale);

		const EMPTY_WORKBOOK = {
			version: 2,
			sheets: [{ name: 'Sheet1', cells: [['']], alignments: [[null]], range: { rows: 1, cols: 1 } }],
			activeSheet: 0,
		};

		const sendSnapshot = () => {
			if (format !== 'sheet') {
				webviewPanel.webview.postMessage({ type: 'init', format, text: document.getText() });
				return;
			}
			try {
				const text = document.getText();
				const parsed = JSON.parse(text.length > 0 ? text : '{}') as Record<string, unknown>;
				if (parsed.version === 2 && Array.isArray(parsed.sheets)) {
					webviewPanel.webview.postMessage({ type: 'init', format, workbook: parsed });
				} else {
					webviewPanel.webview.postMessage({ type: 'init', format, workbook: EMPTY_WORKBOOK });
				}
			} catch {
				webviewPanel.webview.postMessage({ type: 'init', format, workbook: EMPTY_WORKBOOK });
			}
		};

		const sendTheme = () => {
			const kind = vscode.window.activeColorTheme.kind;
			const isDark = kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
			webviewPanel.webview.postMessage({ type: 'theme', kind: isDark ? 'dark' : 'light' });
		};

		const sendLocale = () => {
			webviewPanel.webview.postMessage({ type: 'locale', locale: currentLocale() });
		};

		let isWebviewEdit = false;

		webviewPanel.webview.onDidReceiveMessage(async (message) => {
			switch (message.type) {
				case 'ready':
					sendLocale();
					sendSnapshot();
					sendTheme();
					break;
				case 'edit': {
					let serialized: string;
					if (format === 'sheet') {
						serialized = JSON.stringify({ version: 2, ...(message.workbook as object) }, null, 2);
					} else {
						serialized = message.text as string;
					}
					const edit = new vscode.WorkspaceEdit();
					edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), serialized);
					isWebviewEdit = true;
					await vscode.workspace.applyEdit(edit);
					isWebviewEdit = false;
					break;
				}
			}
		});

		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() === document.uri.toString() && e.contentChanges.length > 0 && !isWebviewEdit) {
				sendSnapshot();
			}
		});

		const themeSubscription = vscode.window.onDidChangeActiveColorTheme(() => sendTheme());

		webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
			themeSubscription.dispose();
		});
	}

	private getHtmlForWebview(webview: vscode.Webview, locale: 'ja' | 'en'): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'),
		);
		const nonce = randomBytes(16).toString('hex');

		return `<!DOCTYPE html>
<html lang="${locale}">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
	<title>Sheet Editor</title>
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
