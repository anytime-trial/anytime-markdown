import * as vscode from 'vscode';
import type { SessionMapping, MappingState, AgentSource } from '@anytime-markdown/agent-core';
import type { TodayStats } from '@anytime-markdown/vscode-common';

const STATE_ICONS: Record<MappingState, vscode.ThemeIcon> = {
  active: new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green')),
  recent: new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.yellow')),
  stale: new vscode.ThemeIcon('circle-outline'),
};

/**
 * Codex は「編集中」概念が無いため、age 由来の active=緑ドットは誤示唆になる。
 * last activity 基準（recent/stale 相当）で robot アイコンの色だけ変える（緑は使わない）。
 */
function codexIcon(state: MappingState): vscode.ThemeIcon {
  if (state === 'stale') {
    return new vscode.ThemeIcon('robot');
  }
  return new vscode.ThemeIcon('robot', new vscode.ThemeColor('charts.blue'));
}

const SOURCE_LABELS: Record<AgentSource, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export class TodaySummaryItem extends vscode.TreeItem {
  constructor(stats: TodayStats, commitCount: number) {
    // 集計は Claude 専用（agent-status DB 由来）。Codex は worker 非対象のため含まない。
    super('Today (Claude)');
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

/** セッションが最後に利用したブランチ / worktree（hover 表示用）。 */
export interface SessionWorktreeContext {
  readonly branch: string;
  readonly worktreeName: string;
}

/** ソース見出しノード（「Claude Code」/「Codex」）。配下にセッションを持つ。 */
export class SourceGroupItem extends vscode.TreeItem {
  constructor(
    public readonly source: AgentSource,
    public readonly children: readonly SessionTreeItem[],
  ) {
    super(SOURCE_LABELS[source], vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${children.length}`;
    this.contextValue = `sourceGroup.${source}`;
    this.iconPath = source === 'codex' ? new vscode.ThemeIcon('robot') : new vscode.ThemeIcon('account');
  }
}

export class SessionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly session: SessionMapping,
    context?: SessionWorktreeContext,
  ) {
    super(session.sessionId.slice(0, 8));
    const isCodex = session.source === 'codex';
    // Codex は editing を持たない（worker 非対象）ため常に idle 表示。
    const stateStr = !isCodex && session.state === 'active' ? 'editing' : 'idle';
    const age = formatAge(session.ageSeconds);
    const tokenStr = session.contextTokens ? `  ${formatTokens(session.contextTokens)}` : '';
    // コンテキストが閾値を超えたら引き継ぎ推奨バッジ（⚠️）を token の前に出す。
    const bloated = (session.contextTokens ?? 0) >= contextWarnTokens();
    const warnStr = bloated ? '  ⚠️' : '';
    // コミット数・タイトルは行には出さず hover（tooltip）にのみ表示する。
    const committed = session.committedCount ?? 0;
    this.description = `${stateStr} • ${age}${warnStr}${tokenStr}`;
    this.iconPath = isCodex ? codexIcon(session.state) : STATE_ICONS[session.state];
    this.contextValue = this._buildContextValue(isCodex, bloated, session.state);
    // セッションのタイトル（コメント）と最後に利用したブランチ / worktree は hover に表示する。
    const labelInfo = session.sessionTitle ? `**タイトル:** ${session.sessionTitle}\n\n` : '';
    const wtInfo = context
      ? `**ブランチ:** \`${context.branch}\`  •  **worktree:** \`${context.worktreeName}\`\n\n`
      : '';
    const sourceInfo = isCodex
      ? `**Source:** Codex（読み取り専用 — 編集中ロック / コミット / 引き継ぎは非対応）\n\n`
      : '';
    this.tooltip = new vscode.MarkdownString(
      `**Session:** \`${session.sessionId}\`\n\n` +
      sourceInfo +
      labelInfo +
      wtInfo +
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

  /** contextValue: Codex は codexSession(.bloated)（handoff/delete メニュー対象外、copy のみ）。 */
  private _buildContextValue(isCodex: boolean, bloated: boolean, state: MappingState): string {
    if (isCodex) {
      return bloated ? 'codexSession.bloated' : 'codexSession';
    }
    return bloated ? `session.${state}.bloated` : `session.${state}`;
  }
}
