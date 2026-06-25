import * as vscode from 'vscode';
import type { WorktreeMapping, SessionMapping, MappingState } from '@anytime-markdown/agent-core';
import type { TodayStats } from '@anytime-markdown/vscode-common';

const STATE_ICONS: Record<MappingState, vscode.ThemeIcon> = {
  active: new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green')),
  recent: new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.yellow')),
  stale: new vscode.ThemeIcon('circle-outline'),
};

export class WorktreeTreeItem extends vscode.TreeItem {
  constructor(public readonly mapping: WorktreeMapping) {
    const collapsible = mapping.sessions.length === 0
      ? vscode.TreeItemCollapsibleState.None
      : mapping.aggregatedState === 'active'
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed;
    super(mapping.worktreeName, collapsible);
    const stateLabelMap: Record<MappingState, string> = {
      active: `[${mapping.activeCount} active]`,
      recent: `[${mapping.activeCount} recent]`,
      stale: '[stale]',
    };
    const stateLabel = mapping.sessions.length === 0 ? '' : `  ${stateLabelMap[mapping.aggregatedState]}`;
    this.description = `${mapping.branch}${stateLabel}`;
    this.iconPath = mapping.aggregatedState === 'active'
      ? new vscode.ThemeIcon('folder-active')
      : new vscode.ThemeIcon('folder');
    this.contextValue = `worktree.${mapping.aggregatedState}`;
    this.tooltip = new vscode.MarkdownString(
      `**${mapping.worktreePath}**\n\nbranch: \`${mapping.branch}\`\nsessions: ${mapping.sessions.length}`,
    );
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export class TodaySummaryItem extends vscode.TreeItem {
  constructor(stats: TodayStats, commitCount: number) {
    super('Today');
    const tokenStr = stats.totalTokens > 0 ? `  ${formatTokens(stats.totalTokens)} tokens` : '';
    const commitStr = commitCount > 0 ? `  ${commitCount} commits` : '';
    this.description = `${stats.sessionCount} sessions${commitStr}${tokenStr}`;
    this.iconPath = new vscode.ThemeIcon('calendar');
    this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    this.tooltip = new vscode.MarkdownString(
      `**今日 (JST)**\n\n` +
      `- セッション数: ${stats.sessionCount}\n` +
      `- コミット数: ${commitCount}\n` +
      (stats.totalTokens > 0 ? `- トークン合計: ${formatTokens(stats.totalTokens)}` : ''),
    );
  }
}

/** "abc1234 (HH:mm)" 形式で最新コミットを整形する（時刻はローカル TZ 表示） */
function formatLastCommit(lastCommit: { hash: string; timestamp: string }): string {
  const shortHash = lastCommit.hash.slice(0, 7);
  let timeStr = '';
  const t = new Date(lastCommit.timestamp);
  if (!Number.isNaN(t.getTime())) {
    timeStr = ` (${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(t)})`;
  }
  return `\`${shortHash}\`${timeStr}`;
}

/**
 * 経過時間を相対表示する。60 秒未満は秒、60 分未満は分、それ以上は「Xh Ymin」。
 */
export function formatAge(ageSeconds: number): string {
  if (ageSeconds < 60) {
    return `${ageSeconds} sec ago`;
  }
  const totalMinutes = Math.round(ageSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min ago`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}min ago`;
}

/** コンテキスト肥大の警告閾値（トークン）。設定 anytimeAgent.contextWarnTokens（既定 16万）。 */
function contextWarnTokens(): number {
  const v = vscode.workspace.getConfiguration('anytimeAgent').get<number>('contextWarnTokens');
  return typeof v === 'number' && v > 0 ? v : 160000;
}

export class SessionTreeItem extends vscode.TreeItem {
  constructor(public readonly session: SessionMapping) {
    super(session.sessionId.slice(0, 8));
    const stateStr = session.state === 'active' ? 'editing' : 'idle';
    const age = formatAge(session.ageSeconds);
    const tokenStr = session.contextTokens ? `  ${formatTokens(session.contextTokens)}` : '';
    // コンテキストが閾値を超えたら引き継ぎ推奨バッジ（⚠️）を token の前に出す。
    const bloated = (session.contextTokens ?? 0) >= contextWarnTokens();
    const warnStr = bloated ? '  ⚠️' : '';
    // コミット数・タイトル・ファイル名は行には出さず hover（tooltip）にのみ表示する。
    const committed = session.committedCount ?? 0;
    this.description = `${stateStr} • ${age}${warnStr}${tokenStr}`;
    this.iconPath = STATE_ICONS[session.state];
    this.contextValue = bloated ? `session.${session.state}.bloated` : `session.${session.state}`;
    // セッションのタイトル（コメント）と最終ファイルは hover に表示する。
    let labelInfo = '';
    if (session.sessionTitle) {
      labelInfo += `**タイトル:** ${session.sessionTitle}\n\n`;
    }
    if (session.file) {
      labelInfo += `**ファイル:** \`${session.file}\`\n\n`;
    }
    this.tooltip = new vscode.MarkdownString(
      `**Session:** \`${session.sessionId}\`\n\n` +
      labelInfo +
      (session.contextTokens ? `**Context:** ${formatTokens(session.contextTokens)} tokens\n\n` : '') +
      (bloated ? `⚠️ **引き継ぎ推奨**（コンテキスト肥大）— 新セッションへの引き継ぎを検討してください\n\n` : '') +
      (committed > 0
        ? `**コミット:** ${committed} 件` +
          (session.lastCommit ? ` / 最新 ${formatLastCommit(session.lastCommit)}` : '') +
          '\n\n'
        : '') +
      (session.plannedEdits.length > 0
        ? `\n\n**Planned:**\n${session.plannedEdits.map(f => `- \`${f}\``).join('\n')}`
        : ''),
    );
  }
}
