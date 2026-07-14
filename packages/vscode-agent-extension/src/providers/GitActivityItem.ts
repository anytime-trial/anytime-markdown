import type { GitActivityRow, WorkSnapshot } from '@anytime-markdown/agent-core';
import { formatLocalTime } from '@anytime-markdown/vscode-common';
import * as vscode from 'vscode';

import type { TimelineDateGroup } from './gitActivityModel';

/**
 * TreeView の 1 行。判別可能ユニオンのまま保持する。
 *
 * kind ごとに optional フィールド（group? / row? / snapshot?）へ分解すると、kind が確定していても
 * 型は `T | undefined` のままになり、呼び出し側が不要な undefined チェックとネストした三項演算子を
 * 書かされる。不変条件（kind === 'git' ⇔ row が在る）を型に持たせる。
 */
export type GitActivityItemInput =
  | { readonly kind: 'date'; readonly group: TimelineDateGroup }
  | { readonly kind: 'git'; readonly row: GitActivityRow }
  | { readonly kind: 'snapshot'; readonly snapshot: WorkSnapshot }
  | { readonly kind: 'error' };

function labelFor(input: GitActivityItemInput): string {
  switch (input.kind) {
    case 'date':
      return input.group.dateKey;
    case 'git':
      return `${formatLocalTime(input.row.occurredAt) ?? '時刻不明'}  ${input.row.opType}`;
    case 'snapshot':
      return `${formatLocalTime(input.snapshot.createdAt) ?? '時刻不明'}  スナップショット`;
    case 'error':
      return 'git 操作の履歴を取得できません';
  }
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
  readonly payload: GitActivityItemInput;

  constructor(input: GitActivityItemInput) {
    super(labelFor(input), collapsibleStateFor(input));
    this.payload = input;

    switch (input.kind) {
      case 'date':
        this.description = `${input.group.entries.length} 件`;
        this.contextValue = 'gitActivityDate';
        return;

      case 'git':
        this.description = input.row.refName;
        this.tooltip = gitTooltip(input.row);
        // 色だけに依存しない。破壊的かどうかはアイコンの形でも区別される。
        this.iconPath = input.row.destructive
          ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.red'))
          : new vscode.ThemeIcon('git-commit');
        // 救出コマンドを出せるのは「戻る先（beforeSha）がある破壊的操作」だけ。
        this.contextValue =
          input.row.destructive && input.row.beforeSha !== null
            ? 'gitActivityDestructive'
            : 'gitActivityOp';
        return;

      case 'snapshot':
        this.description = `${input.snapshot.fileCount} ファイル`;
        this.iconPath = new vscode.ThemeIcon('device-camera');
        this.contextValue = 'gitActivitySnapshot';
        return;

      case 'error':
        this.description = 'ワーカー未起動の可能性';
        this.tooltip =
          'agent-status ワーカーに接続できないため、git 操作の履歴を表示できません。\n表示が空なのは「操作が無かった」ためではありません。詳細は出力パネル（Anytime Agent）を参照してください。';
        this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.red'));
        this.contextValue = 'gitActivityError';
        return;
    }
  }
}
