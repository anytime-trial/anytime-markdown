import * as vscode from 'vscode';
import type { SessionMapping, MappingState, AgentSource } from '@anytime-markdown/agent-core';
import { formatLocalDateTime, formatLocalTime } from '@anytime-markdown/vscode-common';
import type { TodayStats, UsageLimitRow, UsageSeverity } from '@anytime-markdown/vscode-common';

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

function usageIcon(severity: UsageSeverity): vscode.ThemeIcon {
  if (severity === 'critical') {
    return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.red'));
  }
  if (severity === 'warn') {
    return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
  }
  return new vscode.ThemeIcon('pulse');
}

function formatResetTime(resetsAt: string | null): string {
  if (resetsAt === null) {
    return 'reset unknown';
  }
  const formatted = formatLocalDateTime(resetsAt);
  return formatted === null ? 'reset unknown' : `resets ${formatted}`;
}

function formatObservedTime(observedAt: string): string {
  return formatLocalDateTime(observedAt) ?? observedAt;
}

function usageSummary(rows: readonly UsageLimitRow[]): string {
  const session = rows.find(row => row.key === 'session');
  const weekly = rows.find(row => row.key === 'weekly_all')
    ?? rows.find(row => row.key.startsWith('weekly_scoped:'));
  const parts = [
    session ? `Session ${session.percent}%` : undefined,
    weekly ? `Weekly ${weekly.percent}%` : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.join(' · ');
}

interface TodaySummaryOptions {
  readonly commitCount?: number;
  readonly tokenNote?: string;
}

/**
 * workspacePath から表示用のワークスペース名（末尾ディレクトリ名）を取り出す。
 * 区切りは `/`・`\` の両対応。末尾区切りは無視し、名前が取れない場合は undefined を返す。
 */
export function formatWorkspaceName(workspacePath: string | undefined): string | undefined {
  if (!workspacePath) return undefined;
  const trimmed = workspacePath.replace(/[/\\]+$/, '');
  const name = trimmed.split(/[/\\]/).at(-1);
  return name ? name : undefined;
}

export class TodaySummaryItem extends vscode.TreeItem {
  constructor(stats: TodayStats, options: TodaySummaryOptions = {}) {
    super('Today');
    const tokenStr = stats.totalTokens > 0 ? `  ${formatTokens(stats.totalTokens)} tokens` : '';
    const commitCount = options.commitCount ?? 0;
    const commitStr = commitCount > 0 ? `  ${commitCount} commits` : '';
    this.description = `${stats.sessionCount} sessions${commitStr}${tokenStr}`;
    this.iconPath = new vscode.ThemeIcon('calendar');
    this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    const commitLine = options.commitCount !== undefined ? `- コミット数: ${commitCount}\n` : '';
    const tokenLine = stats.totalTokens > 0 ? `- トークン合計: ${formatTokens(stats.totalTokens)}\n` : '';
    const noteLine = options.tokenNote ? `\n${options.tokenNote}` : '';
    this.tooltip = new vscode.MarkdownString(
      `**今日 (JST)**\n\n` +
      `- セッション数: ${stats.sessionCount}\n` +
      commitLine +
      tokenLine +
      noteLine,
    );
  }
}

export class UsageLimitItem extends vscode.TreeItem {
  static expired(): UsageLimitItem {
    return new UsageLimitItem({
      key: 'expired',
      label: '認証切れ',
      percent: 0,
      severity: 'warn',
      resetsAt: null,
    }, true);
  }

  constructor(
    public readonly row: UsageLimitRow,
    expired = false,
    private readonly options: { readonly observedAt?: string } = {},
  ) {
    super(row.label);
    this.description = expired ? undefined : `${row.percent}% · ${formatResetTime(row.resetsAt)}`;
    this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    this.contextValue = expired ? 'usageLimit.expired' : 'usageLimit';
    this.iconPath = usageIcon(row.severity);
    const observed = this.options.observedAt
      ? `\n\n**観測時刻:** ${formatObservedTime(this.options.observedAt)}\n\nCodex の使用量は最後に Codex が API を叩いた時点のスナップショットです（ライブ値ではありません）。`
      : '';
    this.tooltip = expired
      ? new vscode.MarkdownString('Claude Code の認証が切れています。\n\n`claude` を起動してログインを更新してください。')
      : new vscode.MarkdownString(`**${row.label}:** ${row.percent}%\n\n${formatResetTime(row.resetsAt)}${observed}`);
  }
}

export class UsageGroupItem extends vscode.TreeItem {
  constructor(
    public readonly children: readonly UsageLimitItem[],
    rows: readonly UsageLimitRow[],
    options: { readonly stale?: boolean; readonly expired?: boolean } = {},
  ) {
    super('Usage', vscode.TreeItemCollapsibleState.Collapsed);
    const summary = options.expired ? '認証切れ' : usageSummary(rows);
    this.description = `${summary}${options.stale && summary ? ' (stale)' : ''}`;
    this.contextValue = 'usageGroup';
    this.iconPath = new vscode.ThemeIcon(
      options.expired ? 'warning' : 'graph',
      options.expired ? new vscode.ThemeColor('charts.yellow') : undefined,
    );
    this.tooltip = options.expired
      ? new vscode.MarkdownString('Claude Code の認証が切れています。\n\n`claude` を起動してログインを更新してください。')
      : new vscode.MarkdownString(
          `${summary || 'Claude Code usage'}${options.stale ? ' (stale)' : ''}`,
        );
  }
}

/** "abc1234 (HH:mm)" 形式で最新コミットを整形する（時刻はローカル TZ 表示） */
function formatLastCommit(lastCommit: { hash: string; timestamp: string }): string {
  const shortHash = lastCommit.hash.slice(0, 7);
  const time = formatLocalTime(lastCommit.timestamp);
  const timeStr = time === null ? '' : ` (${time})`;
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

/** セッションの所属情報（hover 表示用）。 */
export interface SessionTreeContext {
  readonly branch: string;
  readonly worktreeName: string;
  /**
   * 解決済みのワークスペースパス（resolveSessionWorkspacePath の結果）。
   * ワークスペース見出しのグルーピングキーと同一ソースにするために渡す。
   * session.workspacePath（Codex は生の cwd）を直接使うと、見出しと hover で別の名前が出てしまう。
   */
  readonly workspacePath: string;
}

/**
 * ソース別 codicon。Codex は商標ロゴを同梱せず中立アイコン（CLI を表す terminal）を使う。
 * Claude は同梱ブランド SVG が無いときのフォールバック。
 */
const SOURCE_CODICONS: Record<AgentSource, string> = {
  claude: 'account',
  codex: 'terminal',
};

/** workspacePath が記録されていないセッションを束ねる見出し。 */
const UNKNOWN_WORKSPACE_LABEL = '(ワークスペース不明)';

/**
 * ワークスペース見出しノード（ソース見出しの配下）。同一ワークスペースで動くセッションをまとめる。
 * ラベルは末尾ディレクトリ名のみのため、同名 worktree の識別用に tooltip でフルパスを見せる。
 */
export class WorkspaceGroupItem extends vscode.TreeItem {
  constructor(
    public readonly workspacePath: string,
    public readonly children: readonly SessionTreeItem[],
  ) {
    super(
      formatWorkspaceName(workspacePath) ?? UNKNOWN_WORKSPACE_LABEL,
      vscode.TreeItemCollapsibleState.Expanded,
    );
    this.description = `${children.length}`;
    this.contextValue = 'workspaceGroup';
    this.iconPath = new vscode.ThemeIcon('folder');
    const pathInfo = workspacePath
      ? `**パス:** \`${workspacePath}\``
      : `**パス:** 不明（workspacePath 未記録）`;
    this.tooltip = new vscode.MarkdownString(
      `${pathInfo}\n\n**セッション:** ${children.length}`,
    );
  }
}

/** ソース見出しノード（「Claude Code」/「Codex」）。配下にワークスペース見出しを持つ。 */
export type SourceGroupChildItem = UsageGroupItem | TodaySummaryItem | WorkspaceGroupItem;

export class SourceGroupItem extends vscode.TreeItem {
  constructor(
    public readonly source: AgentSource,
    public readonly children: readonly SourceGroupChildItem[],
    iconBaseUri?: vscode.Uri,
  ) {
    super(SOURCE_LABELS[source], vscode.TreeItemCollapsibleState.Expanded);
    // 子はワークスペースだが、description は従来どおり配下のセッション総数を示す。
    const sessionCount = children.reduce((n, child) =>
      child instanceof WorkspaceGroupItem ? n + child.children.length : n, 0);
    this.description = `${sessionCount}`;
    this.contextValue = `sourceGroup.${source}`;
    this.iconPath = SourceGroupItem._icon(source, iconBaseUri);
  }

  /** Claude のみ同梱ブランド SVG を使う。Codex は商標配慮で中立 codicon に統一する。 */
  private static _icon(source: AgentSource, iconBaseUri?: vscode.Uri): vscode.Uri | vscode.ThemeIcon {
    if (source === 'claude' && iconBaseUri) {
      return vscode.Uri.joinPath(iconBaseUri, 'images', 'icons', 'claude.svg');
    }
    return new vscode.ThemeIcon(SOURCE_CODICONS[source]);
  }
}

export class SessionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly session: SessionMapping,
    context?: SessionTreeContext,
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
    // セッションが動作しているワークスペース名を hover に表示する。
    // 解決済みの context.workspacePath を優先する（ワークスペース見出しと同じ名前を出すため）。
    // context 無しで構築された場合のみ、生の session.workspacePath にフォールバックする。
    const wsName = formatWorkspaceName(context?.workspacePath ?? session.workspacePath);
    const wsInfo = wsName ? `**ワークスペース:** \`${wsName}\`\n\n` : '';
    this.tooltip = new vscode.MarkdownString(
      `**Session:** \`${session.sessionId}\`\n\n` +
      wsInfo +
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
