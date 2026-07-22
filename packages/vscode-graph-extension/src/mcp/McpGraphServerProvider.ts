import * as path from 'node:path';

import * as vscode from 'vscode';

/**
 * VS Code ネイティブの MCP 探索 (`vscode.lm.registerMcpServerDefinitionProvider`)
 * に対し、拡張へ同梱した mcp-graph サーバー (`dist/mcp-graph-server.js`) の
 * 起動定義を提供する。
 *
 * mcp-graph は読み書きの基準ディレクトリ (rootDir) を環境変数 `ANYTIME_GRAPH_ROOT`
 * から取る。渡さないと子プロセスの cwd（拡張ホストのもの）が使われ、ワークスペースを
 * 指さない。
 */
export class McpGraphServerProvider
	implements vscode.McpServerDefinitionProvider, vscode.Disposable
{
	private readonly _changeEmitter = new vscode.EventEmitter<void>();
	public readonly onDidChangeMcpServerDefinitions = this._changeEmitter.event;
	private readonly _foldersWatcher: vscode.Disposable;

	/**
	 * @param version 拡張の版数。VS Code はこの値の変化でサーバー定義の更新を判断するため、
	 *   リテラルで二重管理せず package.json から渡す。
	 */
	constructor(
		private readonly extensionDistPath: string,
		private readonly version: string,
	) {
		// ワークスペースフォルダが変わったら rootDir env を更新するため再評価を促す。
		this._foldersWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
			this._changeEmitter.fire();
		});
	}

	provideMcpServerDefinitions(_token: vscode.CancellationToken): vscode.McpServerDefinition[] {
		const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		// ワークスペースが無いときは定義を出さない。rootDir を渡せないままサーバーを
		// 起こすと、読み書きの基準が拡張ホストの cwd（ホームディレクトリ等になり得る）
		// になり、利用者が意図しない場所の *.cooc.json へ手が届く。
		// フォルダを開けば onDidChangeWorkspaceFolders で再評価される。
		if (!workspacePath) {
			return [];
		}
		const serverScriptPath = path.join(this.extensionDistPath, 'mcp-graph-server.js');
		const definition = new vscode.McpStdioServerDefinition(
			'mcp-graph',
			process.execPath,
			[serverScriptPath],
			{ ANYTIME_GRAPH_ROOT: workspacePath },
			this.version,
		);
		return [definition];
	}

	dispose(): void {
		this._foldersWatcher.dispose();
		this._changeEmitter.dispose();
	}
}
