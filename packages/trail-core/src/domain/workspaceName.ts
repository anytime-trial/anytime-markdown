// worktree ディレクトリ名が単一セグメントに畳まれた repo_name（例:
// `anytime-markdown--claude-worktrees-foo`）のサフィックスマーカー。
// パスセグメント単位の worktree 正規化（trail-db の deriveRepoNameFromCwd）を
// 素通りした名前を、表示・集計時に親リポジトリ名へ畳むために使う。
const WORKSPACE_SUFFIX_MARKERS = ['--claude-worktrees-', '--worktrees-'];

/**
 * repos.repo_name をワークスペース名へ正規化する。worktree 由来のサフィックス
 * （`--worktrees-〜` / `--claude-worktrees-〜`）を除去して親リポジトリ名に集約する。
 * 除去すると空になる名前・マーカーを含まない名前はそのまま返す。
 *
 * 用途: 分析パネルのワークスペース切替（getCombinedData の workspace フィルタ・
 * 一覧生成・ドリルダウンのセッション絞り込み）。trail-db / trail-viewer の両方が
 * 本実装を単一の正として参照する。詳細は trail-viewer-screen-analytics.ja.md §5.2.1。
 */
export function normalizeWorkspaceName(repoName: string): string {
  let idx = -1;
  for (const marker of WORKSPACE_SUFFIX_MARKERS) {
    const i = repoName.indexOf(marker);
    if (i >= 0 && (idx < 0 || i < idx)) idx = i;
  }
  if (idx <= 0) return repoName;
  return repoName.slice(0, idx);
}
