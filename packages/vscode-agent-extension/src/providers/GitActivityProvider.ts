import * as vscode from 'vscode';
import {
  listWorkSnapshots,
  type AgentStatusClient,
  type GitActivityRow,
  type GitAttribution,
  type WorkSnapshot,
} from '@anytime-markdown/agent-core';
import { resolveLocalTimeZone } from '@anytime-markdown/vscode-common';
import { GitActivityItem } from './GitActivityItem';
import {
  applyFilters,
  buildTimeline,
  groupByLocalDate,
  type TimelineEntry,
  type TimelineFilters,
} from './gitActivityModel';
import { AgentLogger } from '../utils/AgentLogger';

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
      if (element.kind === 'date' && element.group !== undefined) {
        return element.group.entries.map((entry) => this._entryItem(entry));
      }
      return [];
    }

    return this._buildRoot();
  }

  private async _buildRoot(): Promise<GitActivityItem[]> {
    const [rows, snapshots] = await Promise.all([
      this._loadGitActivity(),
      Promise.resolve(this._loadWorkSnapshots()),
    ]);
    const entries = applyFilters(
      buildTimeline(rows, snapshots),
      this._filters,
      new Date().toISOString(),
    );
    return groupByLocalDate(entries, resolveLocalTimeZone()).map(
      (group) => new GitActivityItem({ kind: 'date', group }),
    );
  }

  private async _loadGitActivity(): Promise<readonly GitActivityRow[]> {
    try {
      return await this.client.getGitActivity();
    } catch (err) {
      AgentLogger.warn(`Git activity の取得に失敗しました: ${errorDetail(err)}`);
      return [];
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
