import * as path from 'node:path';

import * as vscode from 'vscode';
import {
  reconcileMcpServerRegistration as reconcileCommon,
  registerMcpRegistrationCommand as registerCommandCommon,
  registerMcpServerToJson as registerToJsonCommon,
} from '@anytime-markdown/vscode-common';
import type { McpJsonRegistrationOptions, McpServerEntry } from '@anytime-markdown/vscode-common';

import { MarkdownLogger } from '../utils/MarkdownLogger';

const SERVER_NAME = 'mcp-markdown';
const DISPLAY_NAME = 'Anytime Markdown';
const COMMAND_ID = 'anytime-markdown.registerMcpServer';

function buildMcpServerEntry(extensionDistPath: string): McpServerEntry {
  return {
    command: process.execPath,
    args: [path.join(extensionDistPath, 'mcp-markdown-server.js')],
  };
}

function options(extensionDistPath: string): McpJsonRegistrationOptions {
  return {
    serverName: SERVER_NAME,
    displayName: DISPLAY_NAME,
    buildEntry: () => buildMcpServerEntry(extensionDistPath),
    obsoleteEnvKeys: ['ANYTIME_MARKDOWN_ROOT'],
    logger: MarkdownLogger,
  };
}

/**
 * activate 時の再登録: `<workspaceRoot>/.mcp.json` の `mcpServers.mcp-markdown` を追加し、
 * 拡張更新等で陳腐化していれば書き直す。現行環境で解決できるユーザー改変は保持する。
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

/** `.mcp.json` の mcp-markdown エントリを追加/更新する（手動経路。既存があれば上書き）。 */
export async function registerMcpServerToJson(extensionDistPath: string): Promise<void> {
  await registerToJsonCommon(options(extensionDistPath));
}
