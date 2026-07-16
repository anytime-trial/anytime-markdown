// Phase 5 S1 (Emergency Protocol): Kill Switch / セーフポイント / 非破壊ロールバックのコマンド群。
//
// - Kill Switch は状態台帳 `<git-common-dir>/anytime/emergency.json`（agent-core が正本）。
//   発動中は Claude Code の Edit/Write/Bash が PreToolUse フックで遮断される。
// - ロールバックは非破壊（`git switch -c recover-<sha>`）。stash → reset --hard は
//   要件定義で却下済み（緊急時ほど誤操作被害が大きい）。
// - 記録（safe_points / emergency_log）は daemon の HTTP API へ POST する。
//   daemon 未起動時は主効果（台帳・ブランチ操作）を優先し、記録失敗は警告のみ。
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  clearEmergencyState,
  readEmergencyState,
  resolveAirspaceDir,
  writeEmergencyState,
} from '@anytime-markdown/agent-core';
import * as vscode from 'vscode';

import { TrailLogger } from '../utils/TrailLogger';

const execFileAsync = promisify(execFile);

const ACTIVATE_LABEL = 'Activate';
const RELEASE_LABEL = 'Release';
const CREATE_LABEL = 'Create';

interface EmergencyCommandDeps {
  getWorkspacePath: () => string | undefined;
  getPort: () => number;
}

interface SafePointDto {
  id: number;
  createdAt: string;
  commitHash: string;
  branch: string;
  worktree: string;
  label: string;
  source: string;
  sessionId: string | null;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

async function postJson(url: string, body: unknown): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    TrailLogger.error(`postJson failed: ${url}`, err);
    return false;
  }
}

async function recordEmergencyEvent(
  port: number,
  event: 'kill_switch_on' | 'kill_switch_off' | 'rollback_executed',
  reason: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const ok = await postJson(`http://127.0.0.1:${port}/api/trail/emergency-log`, {
    occurredAt: new Date().toISOString(),
    event,
    reason,
    actor: 'human',
    sessionId: null,
    detailJson: JSON.stringify(detail),
  });
  if (!ok) {
    void vscode.window.showWarningMessage(
      'Emergency log could not be recorded (trail daemon not running). The operation itself has completed.',
    );
  }
}

function requireWorkspaceAirspaceDir(deps: EmergencyCommandDeps): string | null {
  const wsRoot = deps.getWorkspacePath();
  if (!wsRoot) {
    void vscode.window.showErrorMessage('No workspace folder is open.');
    return null;
  }
  const dir = resolveAirspaceDir(wsRoot);
  if (dir === null) {
    void vscode.window.showErrorMessage(
      `Not a git repository: ${wsRoot}`,
    );
    return null;
  }
  return dir;
}

async function killSwitchCommand(deps: EmergencyCommandDeps): Promise<void> {
  const dir = requireWorkspaceAirspaceDir(deps);
  if (dir === null) return;

  const confirm = await vscode.window.showWarningMessage(
    'Activate Kill Switch? Claude Code tool execution (Edit/Write/Bash) will be blocked for ALL sessions in this workspace.',
    { modal: true },
    ACTIVATE_LABEL,
  );
  if (confirm !== ACTIVATE_LABEL) return;

  const reason = await vscode.window.showInputBox({
    prompt: 'Reason for activating the Kill Switch',
    placeHolder: 'e.g. runaway loop, destructive operation in progress',
  });
  if (reason === undefined) return;

  try {
    writeEmergencyState(dir, {
      active: true,
      reason,
      triggeredBy: 'human',
      triggeredAt: new Date().toISOString(),
    });
  } catch (err) {
    TrailLogger.error('killSwitch: failed to write ledger', err);
    void vscode.window.showErrorMessage(
      `Failed to activate Kill Switch: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }
  TrailLogger.info(`[emergency] kill switch ON: ${reason}`);
  await recordEmergencyEvent(deps.getPort(), 'kill_switch_on', reason);
  void vscode.window.showInformationMessage(
    'Kill Switch activated. Claude tool execution is now blocked.',
  );
}

async function releaseKillSwitchCommand(deps: EmergencyCommandDeps): Promise<void> {
  const dir = requireWorkspaceAirspaceDir(deps);
  if (dir === null) return;

  const state = readEmergencyState(dir);
  if (state === null || !state.active) {
    void vscode.window.showInformationMessage('Kill Switch is not active.');
    return;
  }
  const confirm = await vscode.window.showWarningMessage(
    `Release Kill Switch? (activated: ${state.triggeredAt}, reason: ${state.reason})`,
    { modal: true },
    RELEASE_LABEL,
  );
  if (confirm !== RELEASE_LABEL) return;

  try {
    clearEmergencyState(dir);
  } catch (err) {
    TrailLogger.error('releaseKillSwitch: failed to clear ledger', err);
    void vscode.window.showErrorMessage(
      `Failed to release Kill Switch: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }
  TrailLogger.info('[emergency] kill switch OFF');
  await recordEmergencyEvent(deps.getPort(), 'kill_switch_off', state.reason);
  void vscode.window.showInformationMessage('Kill Switch released.');
}

async function recordSafePointCommand(deps: EmergencyCommandDeps): Promise<void> {
  const wsRoot = deps.getWorkspacePath();
  if (!wsRoot) {
    void vscode.window.showErrorMessage('No workspace folder is open.');
    return;
  }
  const label = await vscode.window.showInputBox({
    prompt: 'Label for this safe point',
    placeHolder: 'e.g. before risky migration',
  });
  if (label === undefined) return;

  let commitHash: string;
  let branch: string;
  try {
    commitHash = await git(['rev-parse', 'HEAD'], wsRoot);
    branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], wsRoot);
  } catch (err) {
    TrailLogger.error('recordSafePoint: git failed', err);
    void vscode.window.showErrorMessage(`Not a git repository: ${wsRoot}`);
    return;
  }
  const ok = await postJson(`http://127.0.0.1:${deps.getPort()}/api/trail/safe-points`, {
    createdAt: new Date().toISOString(),
    commitHash,
    branch: branch === 'HEAD' ? '' : branch,
    worktree: wsRoot,
    label,
    source: 'manual',
    sessionId: null,
  });
  if (ok) {
    void vscode.window.showInformationMessage(
      `Safe point recorded: ${commitHash.slice(0, 8)} (${label})`,
    );
  } else {
    void vscode.window.showErrorMessage(
      'Failed to record safe point (trail daemon not running?).',
    );
  }
}

async function rollbackToSafePointCommand(deps: EmergencyCommandDeps): Promise<void> {
  const wsRoot = deps.getWorkspacePath();
  if (!wsRoot) {
    void vscode.window.showErrorMessage('No workspace folder is open.');
    return;
  }

  let safePoints: SafePointDto[];
  try {
    const res = await fetch(`http://127.0.0.1:${deps.getPort()}/api/trail/safe-points?limit=50`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    safePoints = ((await res.json()) as { safePoints: SafePointDto[] }).safePoints;
  } catch (err) {
    TrailLogger.error('rollbackToSafePoint: list failed', err);
    void vscode.window.showErrorMessage(
      'Failed to list safe points (trail daemon not running?).',
    );
    return;
  }
  if (safePoints.length === 0) {
    void vscode.window.showInformationMessage('No safe points recorded yet.');
    return;
  }

  const picked = await vscode.window.showQuickPick(
    safePoints.map((p) => ({
      label: `${p.createdAt}  ${p.commitHash.slice(0, 8)}`,
      description: p.branch,
      detail: p.label || (p.source === 'stop_hook' ? '(auto: session end)' : ''),
      point: p,
    })),
    { placeHolder: 'Select a safe point to recover from' },
  );
  if (picked === undefined) return;

  const shortSha = picked.point.commitHash.slice(0, 8);
  const recoverBranch = `recover-${shortSha}`;
  const confirm = await vscode.window.showWarningMessage(
    `Create recovery branch ${recoverBranch} from ${shortSha}? Your current working tree is NOT modified.`,
    { modal: true },
    CREATE_LABEL,
  );
  if (confirm !== CREATE_LABEL) return;

  try {
    // GC 済み・DB にだけ残った sha を切り出そうとして失敗する前に実在検証する（何も変更しない）
    await git(['cat-file', '-e', `${picked.point.commitHash}^{commit}`], wsRoot);
  } catch {
    void vscode.window.showErrorMessage(
      `Commit ${shortSha} no longer exists in this repository.`,
    );
    return;
  }
  try {
    await git(['switch', '-c', recoverBranch, picked.point.commitHash], wsRoot);
  } catch (err) {
    TrailLogger.error('rollbackToSafePoint: git switch failed', err);
    const message = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(
      `Failed to create recovery branch: ${message}`,
    );
    return;
  }
  TrailLogger.info(`[emergency] rollback: created ${recoverBranch} from ${picked.point.commitHash}`);
  await recordEmergencyEvent(deps.getPort(), 'rollback_executed', picked.point.label, {
    commitHash: picked.point.commitHash,
    recoverBranch,
  });
  void vscode.window.showInformationMessage(
    `Switched to recovery branch ${recoverBranch}.`,
  );
}

export function registerEmergencyCommands(
  context: vscode.ExtensionContext,
  deps: EmergencyCommandDeps,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('anytime-trail.killSwitch', () => killSwitchCommand(deps)),
    vscode.commands.registerCommand('anytime-trail.releaseKillSwitch', () => releaseKillSwitchCommand(deps)),
    vscode.commands.registerCommand('anytime-trail.recordSafePoint', () => recordSafePointCommand(deps)),
    vscode.commands.registerCommand('anytime-trail.rollbackToSafePoint', () => rollbackToSafePointCommand(deps)),
  );
}
