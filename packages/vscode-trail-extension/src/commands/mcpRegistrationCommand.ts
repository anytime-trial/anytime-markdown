import * as path from 'node:path';

import * as vscode from 'vscode';
import {
    autoRegisterMcpServerIfMissing as autoRegisterCommon,
    registerMcpRegistrationCommand as registerCommandCommon,
    registerMcpServerToJson as registerToJsonCommon,
} from '@anytime-markdown/vscode-common';
import type { McpJsonRegistrationOptions, McpServerEntry } from '@anytime-markdown/vscode-common';

import { TrailLogger } from '../utils/TrailLogger';

const DEFAULT_VIEWER_PORT = 19841;
const SERVER_NAME = 'mcp-trail';
const DISPLAY_NAME = 'Anytime Trail';
const COMMAND_ID = 'anytime-trail.registerMcpServer';

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

function options(extensionDistPath: string): McpJsonRegistrationOptions {
    return {
        serverName: SERVER_NAME,
        displayName: DISPLAY_NAME,
        // trail のエントリはワークスペースではなく viewer ポート設定に依存する。
        buildEntry: () => buildMcpServerEntry(extensionDistPath),
        logger: TrailLogger,
        noticeDetail: () => ` (port ${getViewerPort()})`,
        logDetail: () => ` (port=${getViewerPort()})`,
    };
}

/**
 * activate 時の自動登録: `<workspaceRoot>/.mcp.json` に `mcpServers.mcp-trail` が
 * 無い場合のみ追加する。
 *
 * 既存エントリは内容が異なっても上書きしないため、ポートを手で変えた構成は保たれる。
 * 設定変更を反映したい場合は手動コマンド（{@link registerMcpServerToJson}）を使う。
 */
export function autoRegisterMcpServerIfMissing(extensionDistPath: string): void {
    autoRegisterCommon(options(extensionDistPath));
}

export function registerMcpRegistrationCommand(
    context: vscode.ExtensionContext,
    extensionDistPath: string,
): void {
    registerCommandCommon(context, COMMAND_ID, options(extensionDistPath));
}

/** `.mcp.json` の mcp-trail エントリを追加/更新する（手動経路。既存があれば上書き）。 */
export async function registerMcpServerToJson(extensionDistPath: string): Promise<void> {
    await registerToJsonCommon(options(extensionDistPath));
}
