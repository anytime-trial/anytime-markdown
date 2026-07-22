import * as fs from 'node:fs';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { writeFileAtomic } from './atomicWrite';
import { mergeMcpServerEntryIfMissing } from './mcpJsonMerge';
import type { McpServerEntry } from './mcpJsonMerge';

const MCP_JSON_FILENAME = '.mcp.json';

interface McpJsonShape {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

/** 拡張ごとのロガー（MarkdownLogger / TrailLogger / GraphLogger）を注入するための最小 I/F。 */
export interface McpRegistrationLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, err?: unknown): void;
}

/**
 * `.mcp.json` 登録の拡張固有部分。共通ロジックはこれを注入されて動く。
 */
export interface McpJsonRegistrationOptions {
  /** `.mcp.json` の `mcpServers` に置くキー。例: `mcp-graph`。 */
  serverName: string;
  /** 通知文言の先頭に出す拡張の表示名。例: `Anytime Graph`。 */
  displayName: string;
  /** ワークスペースルートからエントリを生成する。 */
  buildEntry: (workspaceRoot: string) => McpServerEntry;
  logger: McpRegistrationLogger;
  /**
   * 成功通知へ付ける拡張固有の補足。例: trail の ` (port 19841)`。
   * 移行前の文言を保つための拡張点で、省略時は何も付かない。
   */
  noticeDetail?: () => string;
  /** 成功ログへ付ける拡張固有の補足。例: trail の ` (port=19841)`。 */
  logDetail?: () => string;
}

function workspaceRootOrNull(): string | null {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}

/**
 * activate 時の自動登録: `<workspaceRoot>/.mcp.json` に `mcpServers.<serverName>` が
 * 無い場合のみ追加する（Claude Code 向け。拡張インストールで完結させる）。
 *
 * 手動コマンド {@link registerMcpServerToJson} との違い（自動経路の保守的ポリシー）:
 * - 既存エントリは内容が異なっても上書きしない（ユーザーのカスタム構成を保護）
 * - パース不能 JSON はバックアップ退避せずスキップ（無通知でファイルを動かさない）
 * - UI 通知を出さない（ログのみ）。失敗しても activate を阻害しない
 */
export function autoRegisterMcpServerIfMissing(options: McpJsonRegistrationOptions): void {
  const { serverName, buildEntry, logger } = options;
  try {
    const workspaceRoot = workspaceRootOrNull();
    if (workspaceRoot === null) return;
    const mcpJsonPath = path.join(workspaceRoot, MCP_JSON_FILENAME);
    let raw: string | null = null;
    if (fs.existsSync(mcpJsonPath)) {
      raw = fs.readFileSync(mcpJsonPath, 'utf-8');
    }
    const result = mergeMcpServerEntryIfMissing(raw, serverName, buildEntry(workspaceRoot));
    if (result.action === 'skip') {
      logger.info(`[mcp-register] auto: skip (${result.reason}) ${mcpJsonPath}`);
      return;
    }
    // atomic 書き込み（失敗時は tmp 残骸を掃除。activate 毎に走る経路のため蓄積させない）
    const written = writeFileAtomic(mcpJsonPath, result.nextJson, (m) =>
      logger.warn(`[mcp-register] auto: ${m}`),
    );
    if (!written) return;
    logger.info(`[mcp-register] auto: added ${serverName} to ${mcpJsonPath}`);
  } catch (err) {
    // 自動経路は activate を阻害しない（登録は手動コマンドで再試行可能）
    logger.error('[mcp-register] auto: failed', err);
  }
}

/**
 * `<workspaceRoot>/.mcp.json` の `mcpServers.<serverName>` エントリを追加/更新する（手動経路）。
 *
 * - ファイル不在 → 新規作成
 * - 既存 JSON 内の他 server 設定は保持する (merge)
 * - 既存の同名エントリがあれば上書き
 * - パース不能 JSON は `.bak.<timestamp>` に退避してから新規作成 (silent な data loss を回避)
 * - 書き込みは atomic (tmp + rename)
 */
export async function registerMcpServerToJson(options: McpJsonRegistrationOptions): Promise<void> {
  const { serverName, displayName, buildEntry, logger, noticeDetail, logDetail } = options;
  const workspaceRoot = workspaceRootOrNull();
  if (workspaceRoot === null) {
    vscode.window.showErrorMessage(`${displayName}: ワークスペースが開かれていません。`);
    return;
  }
  const mcpJsonPath = path.join(workspaceRoot, MCP_JSON_FILENAME);
  const entry = buildEntry(workspaceRoot);

  let existing: McpJsonShape = {};
  let preexistedEntry: McpServerEntry | undefined;
  if (fs.existsSync(mcpJsonPath)) {
    try {
      const raw = fs.readFileSync(mcpJsonPath, 'utf-8');
      existing = JSON.parse(raw) as McpJsonShape;
      preexistedEntry = existing.mcpServers?.[serverName];
    } catch (err) {
      const backupPath = `${mcpJsonPath}.bak.${Date.now()}`;
      try {
        fs.renameSync(mcpJsonPath, backupPath);
        logger.warn(
          `[mcp-register] ${MCP_JSON_FILENAME} was unparseable; backed up to ${path.basename(backupPath)}: ${err instanceof Error ? err.message : String(err)}`,
        );
        vscode.window.showWarningMessage(
          `${MCP_JSON_FILENAME} がパースできなかったため ${path.basename(backupPath)} に退避しました。新規ファイルを作成します。`,
        );
        existing = {};
      } catch (renameErr) {
        const msg = renameErr instanceof Error ? renameErr.message : String(renameErr);
        logger.error('[mcp-register] failed to back up unparseable .mcp.json', renameErr);
        vscode.window.showErrorMessage(
          `${displayName}: ${MCP_JSON_FILENAME} のバックアップに失敗しました: ${msg}`,
        );
        return;
      }
    }
  }

  existing.mcpServers = existing.mcpServers ?? {};
  existing.mcpServers[serverName] = entry;

  // 手動経路は失敗理由を UI へ出すため、生の例外メッセージが要る。
  // writeFileAtomic は warn コールバックで整形済み文字列しか渡さないので、ここは自前で書く。
  const tmpPath = `${mcpJsonPath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmpPath, mcpJsonPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[mcp-register] failed to write ${mcpJsonPath}`, err);
    vscode.window.showErrorMessage(
      `${displayName}: ${MCP_JSON_FILENAME} の書き込みに失敗しました: ${msg}`,
    );
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (cleanupErr) {
      logger.warn(
        `[mcp-register] tmp cleanup failed: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`,
      );
    }
    return;
  }

  const action = preexistedEntry ? '更新' : '追加';
  logger.info(
    `[mcp-register] ${action} ${serverName} in ${mcpJsonPath}${logDetail ? logDetail() : ''}`,
  );
  const openFile = 'ファイルを開く';
  const choice = await vscode.window.showInformationMessage(
    `${displayName}: ${serverName} を ${MCP_JSON_FILENAME} に${action}しました${noticeDetail ? noticeDetail() : ''}`,
    openFile,
  );
  if (choice === openFile) {
    const doc = await vscode.workspace.openTextDocument(mcpJsonPath);
    await vscode.window.showTextDocument(doc, { preview: false });
  }
}

/**
 * 手動登録コマンドを登録する。
 *
 * VS Code のコマンドハンドラは戻り値の Promise を await しないため、ここで明示的に
 * await し、最外側で例外を捕捉して未処理 rejection を防ぐ
 * （registerMcpServerToJson 末尾の showTextDocument 等が reject し得る）。
 */
export function registerMcpRegistrationCommand(
  context: vscode.ExtensionContext,
  commandId: string,
  options: McpJsonRegistrationOptions,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(commandId, async () => {
      try {
        await registerMcpServerToJson(options);
      } catch (err) {
        options.logger.error('[mcp-register] unexpected error', err);
        vscode.window.showErrorMessage(
          `${options.displayName}: MCP サーバー登録中に予期せぬエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );
}
