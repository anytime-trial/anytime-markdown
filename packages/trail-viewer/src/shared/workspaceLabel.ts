/**
 * workspaceLabel — 一覧の「ワークスペース」列に出す表示文字列。
 *
 * 記録元（caravan_drift_events / caravan_bug_history / caravan_review_findings）の
 * `workspace` は空文字を取り得る。取り込み時点でワークスペースを解決できなかった行が
 * それで、「どのワークスペースでもない」ではなく「分からない」を意味する。
 *
 * 空を空セルとして描くと、列そのものが無い行と見分けが付かず「この記録にはワークスペースの
 * 概念が無い」と読めてしまうため、未解決であることが分かるダッシュを出す。
 */
export const WORKSPACE_UNRESOLVED_LABEL = '—';

export function workspaceLabel(workspace: string | null | undefined): string {
  return workspace === null || workspace === undefined || workspace === ''
    ? WORKSPACE_UNRESOLVED_LABEL
    : workspace;
}
