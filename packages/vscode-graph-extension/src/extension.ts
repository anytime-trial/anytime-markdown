import * as path from 'node:path';

import * as vscode from 'vscode';
// DOM 非依存のモジュールから直接取る。index 経由だと graph-core の描画系まで
// 拡張ホスト（node ターゲット・lib は ES2022）の型プログラムとバンドルに入り、
// 型エラーになるうえ extension.js が肥大する。
import {
	parseCoocFile,
	serializeCoocFile,
	type CooccurrenceFile,
} from '@anytime-markdown/graph-core/src/presets/cooccurrenceFile';
import { CooccurrenceEditorProvider } from './providers/CooccurrenceEditorProvider';
import { CooccurrenceListProvider } from './providers/CooccurrenceListProvider';
import { GraphMigrationProvider } from './providers/GraphMigrationProvider';
import { COOC_FILE_GLOB } from './providers/coocListModel';
import { McpGraphServerProvider } from './mcp/McpGraphServerProvider';
import { autoRegisterMcpServerIfMissing, registerMcpRegistrationCommand } from './mcp/mcpRegistrationCommand';
import { GraphLogger } from './utils/GraphLogger';

export function activate(context: vscode.ExtensionContext) {
	// console.* は拡張ホストのコンソールにしか出ずユーザーから見えない。
	const output = vscode.window.createOutputChannel('Anytime Graph');
	context.subscriptions.push(output);
	GraphLogger.init(output);
	const logError = (message: string) => GraphLogger.error(message);

	context.subscriptions.push(CooccurrenceEditorProvider.register(context));
	context.subscriptions.push(GraphMigrationProvider.register(context));

	const listProvider = new CooccurrenceListProvider(logError);
	context.subscriptions.push(listProvider);
	context.subscriptions.push(
		vscode.window.createTreeView(CooccurrenceListProvider.viewId, {
			treeDataProvider: listProvider,
		}),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-graph.refreshNetworks', () => listProvider.refresh()),
	);

	// 同梱した mcp-graph サーバーを VS Code ネイティブ MCP 探索へ登録し、
	// `.mcp.json` 書き出しコマンドも提供する（markdown / trail 拡張と同等の配線）。
	//
	// MCP は本拡張の副次機能なので、ここでの失敗が主機能（共起エディタ・一覧）を
	// 巻き込まないよう、登録より後ろに置いたうえで捕捉する。`vscode.lm` を持たない
	// ホストでは registerMcpServerDefinitionProvider の参照自体が throw する。
	const extensionDistPath = path.join(context.extensionUri.fsPath, 'dist');
	try {
		const mcpGraphServerProvider = new McpGraphServerProvider(
			extensionDistPath,
			context.extension.packageJSON.version as string,
		);
		context.subscriptions.push(
			mcpGraphServerProvider,
			vscode.lm.registerMcpServerDefinitionProvider('anytime-graph.mcp', mcpGraphServerProvider),
		);
		registerMcpRegistrationCommand(context, extensionDistPath);
	} catch (err) {
		GraphLogger.error('[mcp] MCP サーバーの登録に失敗しました', err);
	}
	// Claude Code 向け .mcp.json への登録も activate 時に自動実施する（エントリ不在時のみ追加。
	// 既存エントリ・パース不能ファイルには触れない）。共通実装が内部で捕捉する。
	autoRegisterMcpServerIfMissing(extensionDistPath);

	// ファイルの増減に一覧を追随させる（リネームは delete + create として届く）。
	// 中身の変更は一覧の見た目に影響しないため onDidChange は購読しない。
	const watcher = vscode.workspace.createFileSystemWatcher(COOC_FILE_GLOB);
	context.subscriptions.push(
		watcher,
		watcher.onDidCreate(() => listProvider.refresh()),
		watcher.onDidDelete(() => listProvider.refresh()),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-graph.newCooccurrence', async () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage('Please open a workspace first.');
				return;
			}

			const name = await vscode.window.showInputBox({
				prompt: 'Co-occurrence network file name',
				value: 'untitled.cooc.json',
				// ワークスペース外への書き込みを防ぐ。joinPath は `..` を正規化して外へ出る。
				validateInput: (value) => {
					const trimmed = value.trim();
					if (!trimmed) return 'File name is required.';
					if (/[\\/]/.test(trimmed)) return 'File name must not contain a path separator.';
					if (trimmed === '.' || trimmed === '..' || trimmed.startsWith('..')) return 'Invalid file name.';
					return null;
				},
			});
			if (!name) return;

			const fileName = name.endsWith('.cooc.json') ? name : `${name}.cooc.json`;
			const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, fileName);

			// 既存ファイルを無確認で切り詰めない。空の共起ネットワークで上書きすると
			// 編集済みの語・共起がすべて失われ、カスタムエディタで開いていた場合は
			// 復元経路も自明でない。
			const existing = await vscode.workspace.fs.stat(uri).then(() => true, () => false);
			if (existing) {
				const overwrite = await vscode.window.showWarningMessage(
					`${fileName} already exists. Overwrite it with an empty co-occurrence network?`,
					{ modal: true },
					'Overwrite',
				);
				if (overwrite !== 'Overwrite') return;
			}

			const doc: CooccurrenceFile = {
				meta: {
					schemaVersion: 1,
					generatedAt: new Date().toISOString(),
					origin: 'manual',
				},
				spec: {
					nodes: [],
					links: [],
				},
			};
			const text = serializeCoocFile(doc);
			parseCoocFile(text);

			await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf-8'));
			await vscode.commands.executeCommand('vscode.openWith', uri, CooccurrenceEditorProvider.viewType);
		}),
	);
}

export function deactivate() {}
