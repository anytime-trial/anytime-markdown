import * as path from 'node:path';

import * as vscode from 'vscode';

/**
 * VS Code ネイティブの MCP 探索 (`vscode.lm.registerMcpServerDefinitionProvider`) に対し、
 * 拡張へ同梱した mcp-diagram サーバー (`dist/mcp-diagram-server.js`) の起動定義を提供する。
 *
 * mcp-diagram は読み書きの基準ディレクトリ (rootDir) を環境変数 `ANYTIME_DIAGRAM_ROOT` から
 * 取る。渡さないと子プロセスの cwd（拡張ホストのもの）が使われ、ワークスペースを指さない。
 */
export class McpDiagramServerProvider
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
		// ワークスペースが無いときは定義を出さない。rootDir を渡せないままサーバーを起こすと、
		// 読み書きの基準が拡張ホストの cwd（ホームディレクトリ等になり得る）になり、利用者が
		// 意図しない場所の *.diagram.json へ手が届く。
		if (!workspacePath) {
			return [];
		}
		const serverScriptPath = path.join(this.extensionDistPath, 'mcp-diagram-server.js');
		return [
			new vscode.McpStdioServerDefinition(
				'mcp-diagram',
				process.execPath,
				[serverScriptPath],
				{ ANYTIME_DIAGRAM_ROOT: workspacePath },
				this.version,
			),
		];
	}

	dispose(): void {
		this._foldersWatcher.dispose();
		this._changeEmitter.dispose();
	}
}
