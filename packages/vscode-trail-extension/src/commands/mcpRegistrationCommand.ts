import * as path from 'node:path';

import * as vscode from 'vscode';
import {
    reconcileMcpServerRegistration as reconcileCommon,
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

function buildMcpServerEntry(extensionDistPath: string, workspaceRoot: string): McpServerEntry {
    const port = getViewerPort();
    return {
        command: process.execPath,
        args: [path.join(extensionDistPath, 'mcp-trail-server.js')],
        env: {
            TRAIL_SERVER_URL: `http://localhost:${port}`,
            TRAIL_WORKSPACE_PATH: workspaceRoot,
        },
    };
}

function options(extensionDistPath: string): McpJsonRegistrationOptions {
    return {
        serverName: SERVER_NAME,
        displayName: DISPLAY_NAME,
        buildEntry: (workspaceRoot) => buildMcpServerEntry(extensionDistPath, workspaceRoot),
        managedEnvKeys: ['TRAIL_WORKSPACE_PATH'],
        logger: TrailLogger,
        noticeDetail: () => ` (port ${getViewerPort()})`,
        logDetail: () => ` (port=${getViewerPort()})`,
    };
}

/**
 * activate 時の再登録: `<workspaceRoot>/.mcp.json` の `mcpServers.mcp-trail` を追加し、
 * 拡張更新等で陳腐化していれば書き直す。viewer ポート等のユーザー改変は保持する。
 */
export function reconcileMcpServerRegistration(extensionDistPath: string): void {
    reconcileCommon(options(extensionDistPath));
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
