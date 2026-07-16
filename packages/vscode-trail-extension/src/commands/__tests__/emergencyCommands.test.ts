/**
 * emergencyCommands — Phase 5 S5 の FR-S5-5 / FR-S5-6。
 *
 * S1 の実機受け入れ（要件書 §16）で「理由入力を Esc で閉じると無言キャンセルになり、
 * 発動したつもりが空振りする」事故が実際に起きた。キャンセルの明示フィードバックと、
 * 記録失敗の OutputChannel 記録を回帰として固定する。
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { execFileSync } from 'node:child_process';
import { readEmergencyState, resolveAirspaceDir } from '@anytime-markdown/agent-core';
import * as vscode from 'vscode';

import { registerEmergencyCommands } from '../emergencyCommands';
import { TrailLogger } from '../../utils/TrailLogger';

type CommandHandler = () => Promise<void>;

const mockedWindow = vscode.window as unknown as {
  showWarningMessage: jest.Mock;
  showInformationMessage: jest.Mock;
  showErrorMessage: jest.Mock;
  showInputBox: jest.Mock;
  showQuickPick: jest.Mock;
};
const mockedCommands = vscode.commands as unknown as { registerCommand: jest.Mock };

function collectCommands(workspacePath: string): Map<string, CommandHandler> {
  const registry = new Map<string, CommandHandler>();
  mockedCommands.registerCommand.mockImplementation((id: string, handler: CommandHandler) => {
    registry.set(id, handler);
    return { dispose: () => undefined };
  });
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  registerEmergencyCommands(context, {
    getWorkspacePath: () => workspacePath,
    getPort: () => 19841,
  });
  return registry;
}

describe('emergencyCommands', () => {
  let repoRoot: string;
  let airspaceDir: string;
  let commands: Map<string, CommandHandler>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    repoRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'emergency-cmd-')));
    execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'pipe' });
    airspaceDir = resolveAirspaceDir(repoRoot) as string;
    commands = collectCommands(repoRoot);
    // 記録 POST は本テストの対象外。既定は成功させる。
    globalThis.fetch = (() => Promise.resolve({ ok: true } as Response)) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  describe('FR-S5-5: キャンセルの明示フィードバック', () => {
    it('理由入力を Esc で閉じたら通知を出し、台帳を書かない', async () => {
      mockedWindow.showWarningMessage.mockResolvedValue('Activate');
      mockedWindow.showInputBox.mockResolvedValue(undefined); // Esc

      await commands.get('anytime-trail.killSwitch')?.();

      expect(readEmergencyState(airspaceDir)).toBeNull();
      // 「発動したつもり」を防ぐため、キャンセルしたことを必ず知らせる
      expect(mockedWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringMatching(/cancel/i),
      );
    });

    it('確認ダイアログを閉じた場合も通知を出す', async () => {
      mockedWindow.showWarningMessage.mockResolvedValue(undefined); // Esc

      await commands.get('anytime-trail.killSwitch')?.();

      expect(readEmergencyState(airspaceDir)).toBeNull();
      expect(mockedWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringMatching(/cancel/i),
      );
    });

    it('解除の確認を閉じた場合も通知を出し、台帳を消さない', async () => {
      mockedWindow.showWarningMessage.mockResolvedValueOnce('Activate');
      mockedWindow.showInputBox.mockResolvedValueOnce('runaway');
      await commands.get('anytime-trail.killSwitch')?.();
      expect(readEmergencyState(airspaceDir)?.active).toBe(true);
      jest.clearAllMocks();

      mockedWindow.showWarningMessage.mockResolvedValue(undefined); // Esc
      await commands.get('anytime-trail.releaseKillSwitch')?.();

      expect(readEmergencyState(airspaceDir)?.active).toBe(true);
      expect(mockedWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringMatching(/cancel/i),
      );
    });

    it('正常に発動したときはキャンセル通知を出さない', async () => {
      mockedWindow.showWarningMessage.mockResolvedValue('Activate');
      mockedWindow.showInputBox.mockResolvedValue('runaway');

      await commands.get('anytime-trail.killSwitch')?.();

      expect(readEmergencyState(airspaceDir)?.active).toBe(true);
      const messages = mockedWindow.showInformationMessage.mock.calls.map((c) => String(c[0]));
      expect(messages.some((m) => /cancel/i.test(m))).toBe(false);
    });
  });

  describe('FR-S5-6: 記録失敗を OutputChannel へ残す', () => {
    it('サーバーが非 200 を返したときもログへ残す（例外にならないので見落としやすい）', async () => {
      const errorSpy = jest.spyOn(TrailLogger, 'error').mockImplementation(() => undefined);
      const warnSpy = jest.spyOn(TrailLogger, 'warn').mockImplementation(() => undefined);
      // fetch は成功し res.ok だけが false。例外経路と違い catch に落ちないため、
      // ここが「トーストのみで OutputChannel に残らない」実際の穴だった（要件書 §16 の所見）。
      globalThis.fetch = (() =>
        Promise.resolve({ ok: false, status: 500 } as Response)) as typeof fetch;
      mockedWindow.showWarningMessage.mockResolvedValue('Activate');
      mockedWindow.showInputBox.mockResolvedValue('runaway');

      await commands.get('anytime-trail.killSwitch')?.();

      expect(readEmergencyState(airspaceDir)?.active).toBe(true);
      expect(errorSpy.mock.calls.length + warnSpy.mock.calls.length).toBeGreaterThan(0);
    });

    it('emergency_log の記録に失敗したらトーストだけでなくログにも残す', async () => {
      const errorSpy = jest.spyOn(TrailLogger, 'error').mockImplementation(() => undefined);
      const warnSpy = jest.spyOn(TrailLogger, 'warn').mockImplementation(() => undefined);
      globalThis.fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch;
      mockedWindow.showWarningMessage.mockResolvedValue('Activate');
      mockedWindow.showInputBox.mockResolvedValue('runaway');

      await commands.get('anytime-trail.killSwitch')?.();

      // 主効果（台帳）は成立させる。記録失敗で操作を巻き戻さない
      expect(readEmergencyState(airspaceDir)?.active).toBe(true);
      expect(mockedWindow.showWarningMessage).toHaveBeenCalledWith(
        expect.stringMatching(/log|record/i),
      );
      // トーストは消える。恒久記録が無いと後から追えない
      expect(errorSpy.mock.calls.length + warnSpy.mock.calls.length).toBeGreaterThan(0);
    });
  });
});
