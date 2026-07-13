import * as vscode from 'vscode';
import type { GitActivityRow, WorkSnapshot } from '@anytime-markdown/agent-core';
import { formatLocalTime } from '@anytime-markdown/vscode-common';
import type { TimelineDateGroup } from './gitActivityModel';

type GitActivityItemInput =
  | { readonly kind: 'date'; readonly group: TimelineDateGroup }
  | { readonly kind: 'git'; readonly row: GitActivityRow }
  | { readonly kind: 'snapshot'; readonly snapshot: WorkSnapshot };

function labelFor(input: GitActivityItemInput): string {
  if (input.kind === 'date') {
    return input.group.dateKey;
  }
  if (input.kind === 'git') {
    return `${formatLocalTime(input.row.occurredAt) ?? '時刻不明'}  ${input.row.opType}`;
  }
  return `${formatLocalTime(input.snapshot.createdAt) ?? '時刻不明'}  スナップショット`;
}

function collapsibleStateFor(input: GitActivityItemInput): vscode.TreeItemCollapsibleState {
  return input.kind === 'date'
    ? vscode.TreeItemCollapsibleState.Expanded
    : vscode.TreeItemCollapsibleState.None;
}

function actorLabel(row: GitActivityRow): string {
  if (row.attribution === 'claude') {
    return `Claude セッション ${row.sessionId ?? '(不明)'}`;
  }
  if (row.attribution === 'agent') {
    return `エージェント ${row.agentKind ?? '(不明)'}`;
  }
  return '人間（ターミナル / 別 IDE）';
}

function gitTooltip(row: GitActivityRow): string {
  return [
    `実行者: ${actorLabel(row)}`,
    `before: ${row.beforeSha ?? '(なし)'}`,
    `after: ${row.afterSha ?? '(なし)'}`,
  ].join('\n');
}

export class GitActivityItem extends vscode.TreeItem {
  readonly kind: GitActivityItemInput['kind'];
  readonly group?: TimelineDateGroup;
  readonly row?: GitActivityRow;
  readonly snapshot?: WorkSnapshot;

  constructor(input: GitActivityItemInput) {
    super(labelFor(input), collapsibleStateFor(input));
    this.kind = input.kind;

    if (input.kind === 'date') {
      this.group = input.group;
      this.description = `${input.group.entries.length} entries`;
      this.contextValue = 'gitActivityDate';
      return;
    }

    if (input.kind === 'git') {
      this.row = input.row;
      this.description = input.row.refName;
      this.tooltip = gitTooltip(input.row);
      this.iconPath = input.row.destructive
        ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.red'))
        : new vscode.ThemeIcon('git-commit');
      this.contextValue = input.row.destructive && input.row.beforeSha !== null
        ? 'gitActivityDestructive'
        : 'gitActivityOp';
      return;
    }

    this.snapshot = input.snapshot;
    this.description = `${input.snapshot.fileCount} files`;
    this.iconPath = new vscode.ThemeIcon('device-camera');
    this.contextValue = 'gitActivitySnapshot';
  }
}
