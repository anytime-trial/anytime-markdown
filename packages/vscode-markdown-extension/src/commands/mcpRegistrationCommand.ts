import * as path from 'node:path';

import * as vscode from 'vscode';
import {
  autoRegisterMcpServerIfMissing as autoRegisterCommon,
  registerMcpRegistrationCommand as registerCommandCommon,
  registerMcpServerToJson as registerToJsonCommon,
} from '@anytime-markdown/vscode-common';
import type { McpJsonRegistrationOptions, McpServerEntry } from '@anytime-markdown/vscode-common';

import { MarkdownLogger } from '../utils/MarkdownLogger';

const SERVER_NAME = 'mcp-markdown';
const DISPLAY_NAME = 'Anytime Markdown';
const COMMAND_ID = 'anytime-markdown.registerMcpServer';

function buildMcpServerEntry(extensionDistPath: string, workspaceRoot: string): McpServerEntry {
  return {
    command: process.execPath,
    args: [path.join(extensionDistPath, 'mcp-markdown-server.js')],
    env: { ANYTIME_MARKDOWN_ROOT: workspaceRoot },
  };
}

function options(extensionDistPath: string): McpJsonRegistrationOptions {
  return {
    serverName: SERVER_NAME,
    displayName: DISPLAY_NAME,
    buildEntry: (workspaceRoot) => buildMcpServerEntry(extensionDistPath, workspaceRoot),
    logger: MarkdownLogger,
  };
}

/**
 * activate 時の自動登録: `<workspaceRoot>/.mcp.json` に `mcpServers.mcp-markdown` が
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

/** `.mcp.json` の mcp-markdown エントリを追加/更新する（手動経路。既存があれば上書き）。 */
export async function registerMcpServerToJson(extensionDistPath: string): Promise<void> {
  await registerToJsonCommon(options(extensionDistPath));
}
