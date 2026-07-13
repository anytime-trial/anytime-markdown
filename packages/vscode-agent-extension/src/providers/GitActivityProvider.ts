import {
  type AgentStatusClient,
  type GitActivityRow,
  type GitAttribution,
  listWorkSnapshots,
  type WorkSnapshot,
} from '@anytime-markdown/agent-core';
import { resolveLocalTimeZone } from '@anytime-markdown/vscode-common';
import * as vscode from 'vscode';

import { AgentLogger } from '../utils/AgentLogger';
import { GitActivityItem } from './GitActivityItem';
import {
  applyFilters,
  buildTimeline,
  groupByLocalDate,
  type TimelineEntry,
  type TimelineFilters,
} from './gitActivityModel';

function errorDetail(err: unknown): string {
  return err instanceof Error ? (err.stack ?? err.message) : String(err);
}

export class GitActivityProvider implements vscode.TreeDataProvider<GitActivityItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _filters: TimelineFilters = {
    destructiveOnly: false,
    attribution: 'all',
    days: 7,
  };

  constructor(
    private readonly client: AgentStatusClient,
    private readonly repoRoot: string | null,
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  toggleDestructiveOnly(): void {
    this._filters = {
      ...this._filters,
      destructiveOnly: !this._filters.destructiveOnly,
    };
    this.refresh();
  }

  setAttribution(attribution: GitAttribution | 'all'): void {
    this._filters = {
      ...this._filters,
      attribution,
    };
    this.refresh();
  }

  setDays(days: number | null): void {
    this._filters = {
      ...this._filters,
      days,
    };
    this.refresh();
  }

  getFilters(): TimelineFilters {
    return this._filters;
  }

  getTreeItem(element: GitActivityItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: GitActivityItem): vscode.ProviderResult<GitActivityItem[]> {
    if (element !== undefined) {
      // 子は _buildRoot で構築済みのグループから返す。展開のたびに git / HTTP を叩かない。
      if (element.payload.kind === 'date') {
        return element.payload.group.entries.map((entry) => this._entryItem(entry));
      }
      return [];
    }

    return this._buildRoot();
  }

  private async _buildRoot(): Promise<GitActivityItem[]> {
    // listWorkSnapshots は execFileSync（git for-each-ref）で同期に走る。Promise.all で包むと
    // 並行に見えるが実際は包む前に完走しており、拡張ホストをその間ブロックする。誤読を招くので
    // 同期であることを見た目でも保つ。
    const snapshots = this._loadWorkSnapshots();
    const activity = await this._loadGitActivity();

    const entries = applyFilters(
      buildTimeline(activity.rows, snapshots),
      this._filters,
      new Date().toISOString(),
    );
    const groups = groupByLocalDate(entries, resolveLocalTimeZone()).map(
      (group) => new GitActivityItem({ kind: 'date', group }),
    );

    // 取得失敗を空表示で隠さない。ワーカーが死んでいるだけなのに「破壊的操作は記録されていない」と
    // 読ませるのは、事故調査 UI にとって最悪の失敗様式である。
    if (activity.failed) {
      return [new GitActivityItem({ kind: 'error' }), ...groups];
    }
    return groups;
  }

  private async _loadGitActivity(): Promise<{
    readonly rows: readonly GitActivityRow[];
    readonly failed: boolean;
  }> {
    try {
      const result = await this.client.getGitActivityResult();
      if (result.failed) {
        AgentLogger.warn(
          '[git-activity] 履歴を取得できません（agent-status ワーカーが未起動・接続失敗の可能性）',
        );
      }
      return result;
    } catch (err) {
      AgentLogger.warn(`[git-activity] 履歴の取得に失敗しました: ${errorDetail(err)}`);
      return { rows: [], failed: true };
    }
  }

  private _loadWorkSnapshots(): readonly WorkSnapshot[] {
    if (this.repoRoot === null) {
      return [];
    }
    try {
      return listWorkSnapshots(this.repoRoot);
    } catch (err) {
      AgentLogger.warn(`作業スナップショットの取得に失敗しました: ${errorDetail(err)}`);
      return [];
    }
  }

  private _entryItem(entry: TimelineEntry): GitActivityItem {
    if (entry.kind === 'git') {
      return new GitActivityItem({ kind: 'git', row: entry.row });
    }
    return new GitActivityItem({ kind: 'snapshot', snapshot: entry.snapshot });
  }
}
