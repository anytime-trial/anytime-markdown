import { randomBytes } from 'node:crypto';

import {
	parseDiagramFileStrict,
	serializeDiagramDocument,
	validateDiagramDocument,
} from '@anytime-markdown/diagram-core';
import { resolveLocale } from '@anytime-markdown/vscode-common';
import * as vscode from 'vscode';

import { DiagramLogger } from '../utils/DiagramLogger';

type Locale = 'ja' | 'en';

function currentLocale(): Locale {
	return resolveLocale(undefined, vscode.env.language);
}

function fullDocumentRange(document: vscode.TextDocument): vscode.Range {
	return new vscode.Range(0, 0, document.lineCount, 0);
}

/**
 * `*.diagram.json` のカスタムエディタ。
 *
 * 保存は**図の全体**を受ける。要素の追加・改名・手で引いた線は配置差分では表現できないため、
 * かつての「配置差分だけを受ける」形から広げた。
 *
 * 広げても「開いただけで中身が変わる」を招かないのは、次の 2 つが効いているため。
 *
 * - webview へ渡す図は `parseDiagramFileStrict` の結果で、**読めない図は 1 か所でも throw する**
 *   （部分的に読めた図を webview が持つことがない）。
 * - テキスト側で書き換えられたら `load` を投げ直し、webview の下書きごと差し替える
 *   （`onDidChangeTextDocument`）。webview が古い写しを持ったまま書き戻すことがない。
 *
 * そのうえで、届いた図は `validateDiagramDocument` に通してから書く（webview からのメッセージは
 * 信頼できない入力として扱う）。
 */
export class DiagramEditorProvider implements vscode.CustomTextEditorProvider {
	public static readonly viewType = 'anytimeDiagram';

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		return vscode.window.registerCustomEditorProvider(
			DiagramEditorProvider.viewType,
			new DiagramEditorProvider(context),
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
			localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
		};
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, currentLocale());

		// カウンタで持つ。ブールだと保存が重なったとき、後発が立てた区間を先発の finally が
		// 倒し、後発の applyEdit がガードを素通りする。素通りすると webview へ load を投げ、
		// 編集中の下書き・倍率・選択が巻き戻る。
		let webviewEditDepth = 0;

		const sendDocument = (): void => {
			try {
				webviewPanel.webview.postMessage({
					type: 'load',
					document: parseDiagramFileStrict(document.getText()),
				});
			} catch (error) {
				webviewPanel.webview.postMessage({
					type: 'invalid',
					message: error instanceof Error ? error.message : String(error),
				});
			}
		};

		webviewPanel.webview.onDidReceiveMessage(async (message) => {
			switch (message?.type) {
				case 'ready':
					webviewPanel.webview.postMessage({ type: 'host', locale: currentLocale() });
					sendDocument();
					break;
				case 'saveDocument': {
					try {
						/*
							受けるのは**ファイルの形の本文**（文字列）。画面の形の図をそのまま受けない
							— 端（`DiagramAnchor`）は画面では種別付きの組、ファイルでは文字列で、
							画面の形を `validateDiagramDocument` へ渡すと線を 1 本でも持つ図が必ず
							断られる。境界を文字列にしておけば、渡す側が直し忘れた日に黙って
							「保存できない画面」になるのではなく、ここで理由が出る。

							webview からのメッセージは信頼できない入力として扱う。画面と同じ検証を
							通してから書く（升目の重なり・件数の上限・刻みの範囲・線の形）。
						*/
						if (typeof message.json !== 'string') {
							throw new Error('[diagram] 保存の要求に図の本文（文字列）がありません');
						}
						const validated = validateDiagramDocument(JSON.parse(message.json));
						if (!validated.ok) throw new Error(validated.errors.join('\n'));
						const json = serializeDiagramDocument(validated.document);
						const edit = new vscode.WorkspaceEdit();
						edit.replace(document.uri, fullDocumentRange(document), json);
						webviewEditDepth += 1;
						try {
							await vscode.workspace.applyEdit(edit);
						} finally {
							webviewEditDepth -= 1;
						}
						webviewPanel.webview.postMessage({ type: 'saved' });
					} catch (error) {
						DiagramLogger.error('[editor] 図の保存に失敗しました', error);
						webviewPanel.webview.postMessage({
							type: 'saveFailed',
							message: error instanceof Error ? error.message : String(error),
						});
					}
					break;
				}
			}
		}, undefined);

		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
			if (
				event.document.uri.toString() === document.uri.toString()
				&& event.contentChanges.length > 0
				&& webviewEditDepth === 0
			) {
				sendDocument();
			}
		});

		webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
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
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src ${webview.cspSource} data:;">
	<title>Genealogy Diagram</title>
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
		#root { display: flex; flex-direction: column; padding: 12px; box-sizing: border-box; }
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
