import * as path from 'node:path';

import * as vscode from 'vscode';
import {
	createEmptyDiagramDocument,
	parseDiagramFileStrict,
	serializeDiagramDocument,
} from '@anytime-markdown/diagram-core';

import { DiagramEditorProvider } from './providers/DiagramEditorProvider';
import { DiagramListProvider } from './providers/DiagramListProvider';
import { DIAGRAM_FILE_GLOB } from './providers/diagramListModel';
import { McpDiagramServerProvider } from './mcp/McpDiagramServerProvider';
import { reconcileMcpServerRegistration, registerMcpRegistrationCommand } from './mcp/mcpRegistrationCommand';
import { DiagramLogger } from './utils/DiagramLogger';

export function activate(context: vscode.ExtensionContext) {
	// console.* は拡張ホストのコンソールにしか出ずユーザーから見えない。
	const output = vscode.window.createOutputChannel('Anytime Diagram');
	context.subscriptions.push(output);
	DiagramLogger.init(output);

	context.subscriptions.push(DiagramEditorProvider.register(context));

	const listProvider = new DiagramListProvider((message) => DiagramLogger.error(message));
	context.subscriptions.push(listProvider);
	context.subscriptions.push(
		vscode.window.createTreeView(DiagramListProvider.viewId, { treeDataProvider: listProvider }),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-diagram.refreshDiagrams', () => listProvider.refresh()),
	);

	// 同梱した mcp-diagram サーバーを VS Code ネイティブ MCP 探索へ登録し、`.mcp.json` 書き出し
	// コマンドも提供する（markdown / graph / trail 拡張と同等の配線）。
	//
	// MCP は本拡張の副次機能なので、ここでの失敗が主機能（エディタ・一覧）を巻き込まないよう、
	// 登録より後ろに置いたうえで捕捉する。`vscode.lm` を持たないホストでは参照自体が throw する。
	const extensionDistPath = path.join(context.extensionUri.fsPath, 'dist');
	try {
		const provider = new McpDiagramServerProvider(
			extensionDistPath,
			context.extension.packageJSON.version as string,
		);
		context.subscriptions.push(
			provider,
			vscode.lm.registerMcpServerDefinitionProvider('anytime-diagram.mcp', provider),
		);
		registerMcpRegistrationCommand(context, extensionDistPath);
	} catch (err) {
		DiagramLogger.error('[mcp] MCP サーバーの登録に失敗しました', err);
	}
	// Claude Code 向け .mcp.json への登録も activate 時に自動実施する（エントリ不在時のみ追加。
	// 既存エントリ・パース不能ファイルには触れない）。共通実装が内部で捕捉する。
	reconcileMcpServerRegistration(extensionDistPath);

	// ファイルの増減に一覧を追随させる（リネームは delete + create として届く）。
	// 中身の変更は一覧の見た目に影響しないため onDidChange は購読しない。
	const watcher = vscode.workspace.createFileSystemWatcher(DIAGRAM_FILE_GLOB);
	context.subscriptions.push(
		watcher,
		watcher.onDidCreate(() => listProvider.refresh()),
		watcher.onDidDelete(() => listProvider.refresh()),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-diagram.newDiagram', async () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage('Please open a workspace first.');
				return;
			}

			const name = await vscode.window.showInputBox({
				prompt: 'Diagram file name',
				value: 'untitled.diagram.json',
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

			const fileName = name.endsWith('.diagram.json') ? name : `${name}.diagram.json`;
			const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, fileName);

			// 既存ファイルを無確認で切り詰めない。空の系図で上書きすると、人物・家族・整えた配置が
			// すべて失われ、カスタムエディタで開いていた場合は復元経路も自明でない。
			const existing = await vscode.workspace.fs.stat(uri).then(() => true, () => false);
			if (existing) {
				const overwrite = await vscode.window.showWarningMessage(
					`${fileName} already exists. Overwrite it with an empty diagram?`,
					{ modal: true },
					'Overwrite',
				);
				if (overwrite !== 'Overwrite') return;
			}

			const title = fileName.replace(/\.diagram\.json$/, '');
			const text = serializeDiagramDocument(createEmptyDiagramDocument(title));
			// 書いたものを読み戻せることを確かめてから置く（開いた瞬間「読めません」にしない）。
			parseDiagramFileStrict(text);

			await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf-8'));
			await vscode.commands.executeCommand('vscode.openWith', uri, DiagramEditorProvider.viewType);
		}),
	);
}

export function deactivate() {}
