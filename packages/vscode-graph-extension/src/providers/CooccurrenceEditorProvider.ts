import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import {
	parseCoocFile,
	serializeCoocFile,
	type CooccurrenceFile,
} from '@anytime-markdown/graph-core/src/presets/cooccurrenceFile';
import { resolveLocale } from '@anytime-markdown/vscode-common';

type Locale = 'ja' | 'en';
type ThemeMode = 'dark' | 'light';

function currentLocale(): Locale {
	return resolveLocale(undefined, vscode.env.language);
}

function currentThemeMode(): ThemeMode {
	const kind = vscode.window.activeColorTheme.kind;
	return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast ? 'dark' : 'light';
}

function fullDocumentRange(document: vscode.TextDocument): vscode.Range {
	return new vscode.Range(0, 0, document.lineCount, 0);
}

function filenameFor(file: CooccurrenceFile): string {
	// Why not /[^\w.-]+/: \w は ASCII のみで、日本語タイトルが全文字落ちて常に既定名になる。
	const title = file.spec.title?.trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/^-+|-+$/g, '');
	return `${title || 'cooccurrence'}.png`;
}

export class CooccurrenceEditorProvider implements vscode.CustomTextEditorProvider {
	public static readonly viewType = 'anytimeCooccurrence';

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		return vscode.window.registerCustomEditorProvider(
			CooccurrenceEditorProvider.viewType,
			new CooccurrenceEditorProvider(context),
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

		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, currentLocale());

		// カウンタで持つ。ブールだと save が重なったとき、後発が true にした区間を
		// 先発の finally が false へ戻し、後発の applyEdit がガードを素通りする。
		// 素通りすると sendDocument() が webview へ load を投げ、選択語と倍率が巻き戻る。
		let webviewEditDepth = 0;

		const sendDocument = () => {
			try {
				const file = parseCoocFile(document.getText());
				webviewPanel.webview.postMessage({ type: 'load', file });
			} catch (error) {
				webviewPanel.webview.postMessage({
					type: 'invalid',
					message: error instanceof Error ? error.message : String(error),
				});
			}
		};

		const sendTheme = () => {
			webviewPanel.webview.postMessage({ type: 'theme', themeMode: currentThemeMode() });
		};

		webviewPanel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message?.type) {
					case 'ready':
						webviewPanel.webview.postMessage({
							type: 'host',
							locale: currentLocale(),
							themeMode: currentThemeMode(),
							workerUri: webviewPanel.webview.asWebviewUri(
								vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'layoutWorker.js'),
							).toString(),
						});
						sendDocument();
						break;
					case 'save': {
						try {
							const json = serializeCoocFile(message.file);
							parseCoocFile(json);
							const edit = new vscode.WorkspaceEdit();
							edit.replace(document.uri, fullDocumentRange(document), json);
							webviewEditDepth += 1;
							try {
								await vscode.workspace.applyEdit(edit);
							} finally {
								webviewEditDepth -= 1;
							}
						} catch (error) {
							vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
						}
						break;
					}
					case 'exportPng': {
						// webview からのメッセージは信頼できない入力として扱う。
						// 以前は filenameFor が try の外にあり、file が null だと同期例外が
						// unhandled rejection として捨てられ、ダイアログが開かないだけで
						// 利用者にもログにも何も出なかった。
						if (!Array.isArray(message.bytes)) {
							vscode.window.showErrorMessage('PNG export failed: unexpected payload.');
							return;
						}
						let defaultName: string;
						try {
							defaultName = filenameFor(message.file);
						} catch (error) {
							vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
							return;
						}
						const uri = await vscode.window.showSaveDialog({
							defaultUri: vscode.Uri.joinPath(
								vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(process.cwd()),
								defaultName,
							),
							filters: { PNG: ['png'] },
						});
						if (!uri) return;
						try {
							await vscode.workspace.fs.writeFile(uri, Buffer.from(message.bytes));
						} catch (error) {
							// 書き出し失敗を無言にしない（保存したつもりでファイルが無い状態を作らない）。
							vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
						}
						break;
					}
				}
			},
			undefined,
		);

		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() === document.uri.toString() && e.contentChanges.length > 0 && webviewEditDepth === 0) {
				sendDocument();
			}
		});

		const themeSubscription = vscode.window.onDidChangeActiveColorTheme(() => {
			sendTheme();
		});

		webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
			themeSubscription.dispose();
		});
	}

	private getHtmlForWebview(webview: vscode.Webview, locale: Locale): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'),
		);
		const nonce = randomBytes(16).toString('hex');

		return `<!DOCTYPE html>
<html lang="${locale}">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src ${webview.cspSource} data: blob:; worker-src ${webview.cspSource} blob:; child-src ${webview.cspSource} blob:;">
	<title>Co-occurrence Network</title>
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
		.invalid {
			box-sizing: border-box;
			height: 100%;
			padding: 24px;
			overflow: auto;
			white-space: pre-wrap;
			color: var(--vscode-errorForeground);
			background: var(--vscode-editor-background);
			font: 13px var(--vscode-font-family);
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
