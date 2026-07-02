import * as path from 'node:path';

import * as vscode from 'vscode';

import { resolveDocDbPath } from '../docCore/docDbPath';
import { MarkdownLogger } from '../utils/MarkdownLogger';

/**
 * VS Code ネイティブの MCP 探索 (`vscode.lm.registerMcpServerDefinitionProvider`)
 * に対し、拡張へ同梱した mcp-markdown サーバー (`dist/mcp-markdown-server.js`) の
 * 起動定義を提供する。
 *
 * mcp-markdown はファイル読み書きの基準ディレクトリ (rootDir) を環境変数
 * `ANYTIME_MARKDOWN_ROOT` から、doc 検索 DB を `ANYTIME_MARKDOWN_DOC_DB` から取得する。
 * ここでワークスペースルートと ingest 側と一致する DB パスを渡す。
 */
export class McpMarkdownServerProvider
  implements vscode.McpServerDefinitionProvider, vscode.Disposable
{
  private readonly _changeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeMcpServerDefinitions = this._changeEmitter.event;
  private readonly _foldersWatcher: vscode.Disposable;

  constructor(private readonly extensionDistPath: string) {
    // ワークスペースフォルダが変わったら rootDir env を更新するため再評価を促す。
    this._foldersWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this._changeEmitter.fire();
    });
  }

  provideMcpServerDefinitions(_token: vscode.CancellationToken): vscode.McpServerDefinition[] {
    const serverScriptPath = path.join(this.extensionDistPath, 'mcp-markdown-server.js');
    const env: Record<string, string | number | null> = {};
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspacePath) {
      env['ANYTIME_MARKDOWN_ROOT'] = workspacePath;
      // 検索 DB を ingest 側と一致させる（dbPath 設定があれば反映）。
      const configuredDbPath = vscode.workspace
        .getConfiguration('anytimeMarkdown.docSearch')
        .get<string>('dbPath');
      env['ANYTIME_MARKDOWN_DOC_DB'] = resolveDocDbPath(
        workspacePath,
        configuredDbPath,
        (msg) => MarkdownLogger.warn(msg),
      );
    }
    const definition = new vscode.McpStdioServerDefinition(
      'mcp-markdown',
      process.execPath,
      [serverScriptPath],
      env,
      '1.4.0',
    );
    return [definition];
  }

  dispose(): void {
    this._foldersWatcher.dispose();
    this._changeEmitter.dispose();
  }
}
