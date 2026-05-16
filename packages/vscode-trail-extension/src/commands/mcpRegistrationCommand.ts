import * as fs from 'node:fs';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { TrailLogger } from '../utils/TrailLogger';

const DEFAULT_VIEWER_PORT = 19841;
const SERVER_NAME = 'mcp-trail';
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

function getViewerPort(): number {
    return vscode.workspace
        .getConfiguration('anytimeTrail.viewer')
        .get<number>('port', DEFAULT_VIEWER_PORT);
}

function buildMcpServerEntry(extensionDistPath: string): McpServerEntry {
    const port = getViewerPort();
    return {
        command: process.execPath,
        args: [path.join(extensionDistPath, 'mcp-trail-server.js')],
        env: { TRAIL_SERVER_URL: `http://localhost:${port}` },
    };
}

export function registerMcpRegistrationCommand(
    context: vscode.ExtensionContext,
    extensionDistPath: string,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'anytime-trail.registerMcpServer',
            () => registerMcpServerToJson(extensionDistPath),
        ),
    );
}

/**
 * `<workspaceRoot>/.mcp.json` の `mcpServers.mcp-trail` エントリを追加/更新する。
 *
 * - ファイル不在 → 新規作成
 * - 既存 JSON 内の他 server 設定は保持する (merge)
 * - 既存の mcp-trail エントリがあれば上書き (port 等の変更を反映)
 * - パース不能 JSON は `.bak.<timestamp>` に退避してから新規作成 (silent な
 *   data loss を回避)
 * - 書き込みは atomic (tmp + rename)
 */
export async function registerMcpServerToJson(extensionDistPath: string): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        vscode.window.showErrorMessage('Anytime Trail: ワークスペースが開かれていません。');
        return;
    }
    const mcpJsonPath = path.join(workspaceRoot, MCP_JSON_FILENAME);
    const entry = buildMcpServerEntry(extensionDistPath);

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
                TrailLogger.warn(
                    `[mcp-register] ${MCP_JSON_FILENAME} was unparseable; backed up to ${path.basename(backupPath)}: ${err instanceof Error ? err.message : String(err)}`,
                );
                vscode.window.showWarningMessage(
                    `${MCP_JSON_FILENAME} がパースできなかったため ${path.basename(backupPath)} に退避しました。新規ファイルを作成します。`,
                );
                existing = {};
            } catch (renameErr) {
                const msg = renameErr instanceof Error ? renameErr.message : String(renameErr);
                TrailLogger.error('[mcp-register] failed to back up unparseable .mcp.json', renameErr);
                vscode.window.showErrorMessage(`Anytime Trail: ${MCP_JSON_FILENAME} のバックアップに失敗しました: ${msg}`);
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
        TrailLogger.error(`[mcp-register] failed to write ${mcpJsonPath}`, err);
        vscode.window.showErrorMessage(`Anytime Trail: ${MCP_JSON_FILENAME} の書き込みに失敗しました: ${msg}`);
        try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
            // best-effort cleanup
        }
        return;
    }

    const action = preexistedEntry ? '更新' : '追加';
    const port = getViewerPort();
    TrailLogger.info(`[mcp-register] ${action} mcp-trail in ${mcpJsonPath} (port=${port})`);
    const openFile = 'ファイルを開く';
    const choice = await vscode.window.showInformationMessage(
        `Anytime Trail: mcp-trail を ${MCP_JSON_FILENAME} に${action}しました (port ${port})`,
        openFile,
    );
    if (choice === openFile) {
        const doc = await vscode.workspace.openTextDocument(mcpJsonPath);
        await vscode.window.showTextDocument(doc, { preview: false });
    }
}
