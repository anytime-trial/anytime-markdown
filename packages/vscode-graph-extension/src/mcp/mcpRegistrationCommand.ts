import * as path from 'node:path';

import * as vscode from 'vscode';
import {
	autoRegisterMcpServerIfMissing as autoRegisterCommon,
	registerMcpRegistrationCommand as registerCommandCommon,
	registerMcpServerToJson as registerToJsonCommon,
} from '@anytime-markdown/vscode-common';
import type { McpJsonRegistrationOptions, McpServerEntry } from '@anytime-markdown/vscode-common';

import { GraphLogger } from '../utils/GraphLogger';

const SERVER_NAME = 'mcp-graph';
const DISPLAY_NAME = 'Anytime Graph';
const COMMAND_ID = 'anytime-graph.registerMcpServer';

function buildMcpServerEntry(extensionDistPath: string, workspaceRoot: string): McpServerEntry {
	return {
		command: process.execPath,
		args: [path.join(extensionDistPath, 'mcp-graph-server.js')],
		env: { ANYTIME_GRAPH_ROOT: workspaceRoot },
	};
}

function options(extensionDistPath: string): McpJsonRegistrationOptions {
	return {
		serverName: SERVER_NAME,
		displayName: DISPLAY_NAME,
		buildEntry: (workspaceRoot) => buildMcpServerEntry(extensionDistPath, workspaceRoot),
		logger: GraphLogger,
	};
}

/**
 * activate 時の自動登録: `<workspaceRoot>/.mcp.json` に `mcpServers.mcp-graph` が
 * 無い場合のみ追加する。保守的ポリシー（既存は上書きしない・パース不能は触らない・
 * UI 通知なし）は vscode-common の共通実装が持つ。
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

/** `.mcp.json` の mcp-graph エントリを追加/更新する（手動経路。既存があれば上書き）。 */
export async function registerMcpServerToJson(extensionDistPath: string): Promise<void> {
	await registerToJsonCommon(options(extensionDistPath));
}
