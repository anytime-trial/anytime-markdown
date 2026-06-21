import * as fs from 'node:fs';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { MarkdownLogger } from '../utils/MarkdownLogger';

const SERVER_NAME = 'mcp-markdown';
const MCP_JSON_FILENAME = '.mcp.json';

interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpJsonShape {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

function buildMcpServerEntry(extensionDistPath: string, workspaceRoot: string): McpServerEntry {
  return {
    command: process.execPath,
    args: [path.join(extensionDistPath, 'mcp-markdown-server.js')],
    env: { ANYTIME_MARKDOWN_ROOT: workspaceRoot },
  };
}

export function registerMcpRegistrationCommand(
  context: vscode.ExtensionContext,
  extensionDistPath: string,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('anytime-markdown.registerMcpServer', async () => {
      // VS Code のコマンドハンドラは戻り値の Promise を await しないため、
      // ここで明示的に await し、最外側で例外を捕捉して未処理 rejection を防ぐ。
      try {
        await registerMcpServerToJson(extensionDistPath);
      } catch (err) {
        MarkdownLogger.error('[mcp-register] unexpected error', err);
        vscode.window.showErrorMessage(
          `Anytime Markdown: MCP サーバー登録中に予期せぬエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );
}

/**
 * `<workspaceRoot>/.mcp.json` の `mcpServers.mcp-markdown` エントリを追加/更新する。
 *
 * - ファイル不在 → 新規作成
 * - 既存 JSON 内の他 server 設定は保持する (merge)
 * - 既存の mcp-markdown エントリがあれば上書き
 * - パース不能 JSON は `.bak.<timestamp>` に退避してから新規作成 (silent な data loss を回避)
 * - 書き込みは atomic (tmp + rename)
 */
export async function registerMcpServerToJson(extensionDistPath: string): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Anytime Markdown: ワークスペースが開かれていません。');
    return;
  }
  const mcpJsonPath = path.join(workspaceRoot, MCP_JSON_FILENAME);
  const entry = buildMcpServerEntry(extensionDistPath, workspaceRoot);

  let existing: McpJsonShape = {};
  let preexistedEntry: McpServerEntry | undefined;
  if (fs.existsSync(mcpJsonPath)) {
    try {
      const raw = fs.readFileSync(mcpJsonPath, 'utf-8');
      existing = JSON.parse(raw) as McpJsonShape;
      preexistedEntry = existing.mcpServers?.[SERVER_NAME];
    } catch (err) {
      const backupPath = `${mcpJsonPath}.bak.${Date.now()}`;
      try {
        fs.renameSync(mcpJsonPath, backupPath);
        MarkdownLogger.warn(
          `[mcp-register] ${MCP_JSON_FILENAME} was unparseable; backed up to ${path.basename(backupPath)}: ${err instanceof Error ? err.message : String(err)}`,
        );
        vscode.window.showWarningMessage(
          `${MCP_JSON_FILENAME} がパースできなかったため ${path.basename(backupPath)} に退避しました。新規ファイルを作成します。`,
        );
        existing = {};
      } catch (renameErr) {
        const msg = renameErr instanceof Error ? renameErr.message : String(renameErr);
        MarkdownLogger.error('[mcp-register] failed to back up unparseable .mcp.json', renameErr);
        vscode.window.showErrorMessage(`Anytime Markdown: ${MCP_JSON_FILENAME} のバックアップに失敗しました: ${msg}`);
        return;
      }
    }
  }

  existing.mcpServers = existing.mcpServers ?? {};
  existing.mcpServers[SERVER_NAME] = entry;

  const tmpPath = `${mcpJsonPath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmpPath, mcpJsonPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    MarkdownLogger.error(`[mcp-register] failed to write ${mcpJsonPath}`, err);
    vscode.window.showErrorMessage(`Anytime Markdown: ${MCP_JSON_FILENAME} の書き込みに失敗しました: ${msg}`);
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (cleanupErr) {
      MarkdownLogger.warn(`[mcp-register] tmp cleanup failed: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`);
    }
    return;
  }

  const action = preexistedEntry ? '更新' : '追加';
  MarkdownLogger.info(`[mcp-register] ${action} mcp-markdown in ${mcpJsonPath}`);
  const openFile = 'ファイルを開く';
  const choice = await vscode.window.showInformationMessage(
    `Anytime Markdown: mcp-markdown を ${MCP_JSON_FILENAME} に${action}しました`,
    openFile,
  );
  if (choice === openFile) {
    const doc = await vscode.workspace.openTextDocument(mcpJsonPath);
    await vscode.window.showTextDocument(doc, { preview: false });
  }
}
