import * as vscode from 'vscode';
import { resolveLocale } from '@anytime-markdown/vscode-common';

type Locale = 'ja' | 'en';

const messages = {
	en: {
		title: 'The .graph editor has moved',
		body: 'The general graph editor is no longer included in this VS Code extension. Open the web app and use /graph to continue editing .graph files.',
	},
	ja: {
		title: '.graph エディタは移行しました',
		body: '汎用グラフエディタはこの VS Code 拡張には含まれなくなりました。引き続き .graph ファイルを編集するには Web アプリの /graph を利用してください。',
	},
} as const;

function currentLocale(): Locale {
	return resolveLocale(undefined, vscode.env.language);
}

export class GraphMigrationProvider implements vscode.CustomTextEditorProvider {
	public static readonly viewType = 'anytimeGraph';

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		return vscode.window.registerCustomEditorProvider(
			GraphMigrationProvider.viewType,
			new GraphMigrationProvider(context),
			{
				supportsMultipleEditorsPerDocument: false,
				webviewOptions: { retainContextWhenHidden: true },
			},
		);
	}

	private constructor(private readonly context: vscode.ExtensionContext) {}

	public async resolveCustomTextEditor(
		_document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken,
	): Promise<void> {
		const locale = currentLocale();
		const message = messages[locale];
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, locale, message.title, message.body);
		vscode.window.showInformationMessage(message.body);
	}

	private getHtmlForWebview(webview: vscode.Webview, locale: Locale, title: string, body: string): string {
		return `<!DOCTYPE html>
<html lang="${locale}">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
	<title>${escapeHtml(title)}</title>
	<style>
		html, body {
			margin: 0;
			padding: 0;
			background: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
			font-family: var(--vscode-font-family);
		}
		main {
			box-sizing: border-box;
			max-width: 720px;
			padding: 32px;
		}
		h1 {
			margin: 0 0 12px;
			font-size: 20px;
			font-weight: 600;
		}
		p {
			margin: 0;
			line-height: 1.6;
			color: var(--vscode-descriptionForeground);
		}
	</style>
</head>
<body>
	<main>
		<h1>${escapeHtml(title)}</h1>
		<p>${escapeHtml(body)}</p>
	</main>
</body>
</html>`;
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
