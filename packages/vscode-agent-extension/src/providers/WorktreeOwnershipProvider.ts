import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import type { AirspaceClaim } from '@anytime-markdown/agent-core';
import { isClaimLive } from '@anytime-markdown/agent-core';
import * as vscode from 'vscode';

import { AgentLogger } from '../utils/AgentLogger';
import {
  buildOwnershipRows,
  type OwnershipRow,
  parseWorktreeList,
} from './worktreeOwnershipModel';

type WorktreeOwnershipItemInput =
  | { readonly kind: 'row'; readonly row: OwnershipRow }
  | { readonly kind: 'error'; readonly message: string };

function errorDetail(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAirspaceClaim(value: unknown): value is AirspaceClaim {
  if (!isRecord(value)) return false;
  return (
    typeof value.sessionId === 'string' &&
    typeof value.pid === 'number' &&
    Number.isInteger(value.pid) &&
    typeof value.starttime === 'string' &&
    typeof value.worktree === 'string' &&
    typeof value.branch === 'string' &&
    typeof value.file === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

// 文言は兄弟ビュー（GitActivityItem）に合わせて日本語直書きにする。
// 同じサイドバーに並ぶビューで言語が食い違うと読み手が混乱するため。
function commandForWorktree(branch: string | null): string {
  const suffix = branch === null || branch === '' ? 'new-work' : `${branch.replaceAll('/', '-')}-next`;
  return `git worktree add .worktrees/${suffix} -b ${suffix}`;
}

function itemLabel(input: WorktreeOwnershipItemInput): string {
  if (input.kind === 'error') return '作業ツリーの占有状況を取得できません';
  if (input.row.orphan) return `孤立クレーム  ${input.row.worktreePath}`;
  const branch = input.row.branch ?? '(detached)';
  return `${input.row.state === 'occupied' ? '占有中' : '空き'}  ${branch}`;
}

function itemDescription(input: WorktreeOwnershipItemInput): string | undefined {
  if (input.kind === 'error') return 'Anytime Agent の出力を確認してください';
  if (input.row.state === 'free') return input.row.worktreePath;
  return `pid ${input.row.pid}  ${input.row.sessionId.slice(0, 8)}`;
}

function itemTooltip(row: OwnershipRow): string {
  const lines = [
    `作業ツリー: ${row.worktreePath}`,
    `ブランチ: ${row.branch ?? '(detached)'}`,
    `状態: ${row.state === 'occupied' ? '占有中' : '空き'}`,
  ];
  if (row.sessionId !== null) lines.push(`セッション: ${row.sessionId}`);
  if (row.pid !== null) lines.push(`pid: ${row.pid}`);
  if (row.editingFile !== null) lines.push(`編集中: ${row.editingFile}`);
  if (row.orphan) lines.push('孤立: このクレームの作業ツリーは git worktree list に存在しない');
  return lines.join('\n');
}

export class WorktreeOwnershipItem extends vscode.TreeItem {
  readonly payload: WorktreeOwnershipItemInput;
  readonly worktreeCommand: string | null;

  constructor(input: WorktreeOwnershipItemInput) {
    super(itemLabel(input), vscode.TreeItemCollapsibleState.None);
    this.payload = input;
    this.description = itemDescription(input);

    if (input.kind === 'error') {
      this.tooltip = input.message;
      this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.red'));
      this.contextValue = 'worktreeOwnershipError';
      this.worktreeCommand = null;
      return;
    }

    this.tooltip = itemTooltip(input.row);
    this.contextValue = 'worktreeOwnershipRow';
    this.worktreeCommand = commandForWorktree(input.row.branch);
    this.iconPath =
      input.row.state === 'occupied'
        ? new vscode.ThemeIcon('lock', new vscode.ThemeColor('charts.yellow'))
        : new vscode.ThemeIcon('unlock');
  }
}

export class WorktreeOwnershipProvider implements vscode.TreeDataProvider<WorktreeOwnershipItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly repoRoot: string | null) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: WorktreeOwnershipItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: WorktreeOwnershipItem): vscode.ProviderResult<WorktreeOwnershipItem[]> {
    if (element !== undefined) return [];
    return this._buildRoot();
  }

  private _buildRoot(): WorktreeOwnershipItem[] {
    if (this.repoRoot === null) {
      const message = '[worktree-ownership] disabled: not a git repository';
      AgentLogger.warn(message);
      return [new WorktreeOwnershipItem({ kind: 'error', message })];
    }

    try {
      const worktrees = parseWorktreeList(this._git(['worktree', 'list', '--porcelain']));
      const claims = this._loadClaims(this._resolveGitCommonDir());
      return buildOwnershipRows(worktrees, claims).map(
        (row) => new WorktreeOwnershipItem({ kind: 'row', row }),
      );
    } catch (error: unknown) {
      const message = `[worktree-ownership] failed to load ownership rows: ${errorDetail(error)}`;
      AgentLogger.warn(message);
      return [new WorktreeOwnershipItem({ kind: 'error', message })];
    }
  }

  private _git(args: readonly string[]): string {
    return execFileSync('git', [...args], {
      cwd: this.repoRoot ?? process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  private _resolveGitCommonDir(): string {
    const raw = this._git(['rev-parse', '--git-common-dir']).trim();
    if (raw === '') {
      throw new Error(`git common dir is empty for ${this.repoRoot ?? '(unknown)'}`);
    }
    return isAbsolute(raw) ? raw : resolve(this.repoRoot ?? process.cwd(), raw);
  }

  private _loadClaims(commonDir: string): AirspaceClaim[] {
    const claimsDir = join(commonDir, 'anytime', 'claims');
    if (!existsSync(claimsDir)) return [];
    const claims: AirspaceClaim[] = [];

    for (const name of readdirSync(claimsDir)) {
      if (!name.endsWith('.json')) continue;
      const filePath = join(claimsDir, name);
      try {
        const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
        if (isAirspaceClaim(parsed)) {
          if (isClaimLive(parsed)) {
            claims.push(parsed);
          } else {
            AgentLogger.warn(`[worktree-ownership] ignored stale claim: ${filePath}`);
          }
        } else {
          AgentLogger.warn(`[worktree-ownership] ignored invalid claim: ${filePath}`);
        }
      } catch (error: unknown) {
        AgentLogger.warn(`[worktree-ownership] failed to read claim ${filePath}: ${errorDetail(error)}`);
      }
    }

    return claims;
  }
}
