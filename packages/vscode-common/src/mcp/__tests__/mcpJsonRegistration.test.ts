import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import * as vscode from 'vscode';

import {
  autoRegisterMcpServerIfMissing,
  registerMcpServerToJson,
} from '../mcpJsonRegistration';
import type { McpJsonRegistrationOptions, McpRegistrationLogger } from '../mcpJsonRegistration';

const mockVscode = vscode as unknown as {
  workspace: { workspaceFolders: Array<{ uri: { fsPath: string } }> | undefined };
  window: {
    showInformationMessage: jest.Mock;
    showWarningMessage: jest.Mock;
    showErrorMessage: jest.Mock;
  };
  __resetVscodeMock: () => void;
};

function makeLogger(): McpRegistrationLogger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info: (m) => lines.push(`INFO ${m}`),
    warn: (m) => lines.push(`WARN ${m}`),
    error: (m) => lines.push(`ERROR ${m}`),
  };
}

describe('mcpJsonRegistration', () => {
  let dir: string;
  let logger: ReturnType<typeof makeLogger>;
  let options: McpJsonRegistrationOptions;

  const mcpJson = () => path.join(dir, '.mcp.json');
  const readMcpJson = () => fs.readFileSync(mcpJson(), 'utf-8');

  beforeEach(() => {
    mockVscode.__resetVscodeMock();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-registration-'));
    mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: dir } }];
    logger = makeLogger();
    options = {
      serverName: 'mcp-test',
      displayName: 'Anytime Test',
      buildEntry: (workspaceRoot) => ({
        command: '/usr/bin/node',
        args: ['/ext/dist/server.js'],
        env: { ANYTIME_TEST_ROOT: workspaceRoot },
      }),
      logger,
    };
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('autoRegisterMcpServerIfMissing', () => {
    test('ファイル不在: エントリを作成する', () => {
      autoRegisterMcpServerIfMissing(options);
      const parsed = JSON.parse(readMcpJson());
      expect(parsed.mcpServers['mcp-test']).toEqual({
        command: '/usr/bin/node',
        args: ['/ext/dist/server.js'],
        env: { ANYTIME_TEST_ROOT: dir },
      });
    });

    test('他サーバーの設定は保持する', () => {
      fs.writeFileSync(mcpJson(), JSON.stringify({ mcpServers: { other: { command: 'x', args: [] } } }));
      autoRegisterMcpServerIfMissing(options);
      const parsed = JSON.parse(readMcpJson());
      expect(parsed.mcpServers.other).toEqual({ command: 'x', args: [] });
      expect(parsed.mcpServers['mcp-test']).toBeDefined();
    });

    test('既存エントリ: 内容が異なっても上書きしない（ユーザーのカスタム構成を保護）', () => {
      const custom = JSON.stringify(
        { mcpServers: { 'mcp-test': { command: 'npx', args: ['tsx', 'src/stdio.ts'] } } },
        null,
        2,
      );
      fs.writeFileSync(mcpJson(), custom);
      autoRegisterMcpServerIfMissing(options);
      // バイト単位で不変であることまで見る（整形し直しも「触った」に含める）
      expect(readMcpJson()).toBe(custom);
      expect(logger.lines.some((l) => l.includes('skip (exists)'))).toBe(true);
    });

    test('パース不能 JSON: 書き換えない・退避もしない', () => {
      fs.writeFileSync(mcpJson(), '{ this is not json');
      autoRegisterMcpServerIfMissing(options);
      expect(readMcpJson()).toBe('{ this is not json');
      expect(fs.readdirSync(dir)).toEqual(['.mcp.json']);
      expect(logger.lines.some((l) => l.includes('skip (unparseable)'))).toBe(true);
    });

    test('ワークスペース未オープン: 何も書かない', () => {
      mockVscode.workspace.workspaceFolders = undefined;
      autoRegisterMcpServerIfMissing(options);
      expect(fs.existsSync(mcpJson())).toBe(false);
    });

    test('UI 通知を出さない（自動経路のポリシー）', () => {
      autoRegisterMcpServerIfMissing(options);
      expect(mockVscode.window.showInformationMessage).not.toHaveBeenCalled();
      expect(mockVscode.window.showWarningMessage).not.toHaveBeenCalled();
      expect(mockVscode.window.showErrorMessage).not.toHaveBeenCalled();
    });
  });

  describe('registerMcpServerToJson', () => {
    test('既存エントリを上書きする（手動経路）', async () => {
      fs.writeFileSync(
        mcpJson(),
        JSON.stringify({ mcpServers: { 'mcp-test': { command: 'stale', args: [] } } }),
      );
      await registerMcpServerToJson(options);
      const parsed = JSON.parse(readMcpJson());
      expect(parsed.mcpServers['mcp-test'].command).toBe('/usr/bin/node');
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Anytime Test: mcp-test を .mcp.json に更新しました',
        'ファイルを開く',
      );
    });

    test('新規作成時の通知は「追加」', async () => {
      await registerMcpServerToJson(options);
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Anytime Test: mcp-test を .mcp.json に追加しました',
        'ファイルを開く',
      );
    });

    test('noticeDetail / logDetail が通知とログへ付く（trail のポート表示互換）', async () => {
      await registerMcpServerToJson({
        ...options,
        noticeDetail: () => ' (port 19841)',
        logDetail: () => ' (port=19841)',
      });
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Anytime Test: mcp-test を .mcp.json に追加しました (port 19841)',
        'ファイルを開く',
      );
      expect(logger.lines.some((l) => l.includes('(port=19841)'))).toBe(true);
    });

    test('パース不能 JSON: .bak へ退避してから新規作成する', async () => {
      fs.writeFileSync(mcpJson(), '{ broken');
      await registerMcpServerToJson(options);
      const backups = fs.readdirSync(dir).filter((f) => f.includes('.bak.'));
      expect(backups).toHaveLength(1);
      expect(fs.readFileSync(path.join(dir, backups[0]), 'utf-8')).toBe('{ broken');
      expect(JSON.parse(readMcpJson()).mcpServers['mcp-test']).toBeDefined();
      expect(mockVscode.window.showWarningMessage).toHaveBeenCalled();
    });

    test('ワークスペース未オープン: エラー通知を出して何も書かない', async () => {
      mockVscode.workspace.workspaceFolders = undefined;
      await registerMcpServerToJson(options);
      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Anytime Test: ワークスペースが開かれていません。',
      );
      expect(fs.existsSync(mcpJson())).toBe(false);
    });

    test('tmp 残骸を残さない', async () => {
      await registerMcpServerToJson(options);
      expect(fs.readdirSync(dir)).toEqual(['.mcp.json']);
    });
  });
});
