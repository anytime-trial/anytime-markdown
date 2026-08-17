/**
 * memory（caravan-book）取込の対象ワークスペースを決める述語。
 *
 * `import_sessions`（JsonlIngester → SessionImporter）は `~/.claude/projects/` 配下の
 * 全プロジェクトディレクトリを無条件に走査して activity.db へ取り込む。activity.db は
 * 複数ワークスペースのセッションを持つ「観測の器」であり、そこから何を記憶（caravan-book）
 * へ昇格させるかは別の判断になる。この判断をここへ集約する。
 *
 * code / bug history / review(Route A) / drift は既に `repoName` で限定されていた。
 * 会話取込とレビュー指摘取込だけが無限定で、他ワークスペースの会話・指摘が知識グラフへ
 * 混入していた（2026-08-17 のユーザー判断で限定を既定にした）。
 */

/** lep.json `memory.workspaceScope` の値。設定ファイル由来の外部表現。 */
export type WorkspaceScopeMode = 'own' | 'all';

/**
 * 取込対象ワークスペース。判別子付き union にして「repoName が空の own」を
 * 型と生成関数の両方で作れなくする。
 */
export type MemoryWorkspaceScope =
  | { readonly kind: 'own_workspace'; readonly repoName: string }
  | { readonly kind: 'all_workspaces' };

/** SQL 断片とそのバインド引数。repoName を文字列連結で埋め込まないための組。 */
export interface SqlPredicate {
  readonly sql: string;
  readonly params: readonly string[];
}

/** trail.activity_messages に付ける別名。SQL へ埋め込むため呼び出し実態のリテラルだけを許す。 */
export type MessagesAlias = 'm';

/**
 * 自ワークスペース限定のスコープ。
 *
 * repoName は `basename(gitRoot)`（code / bug history / review と同じ値）を想定する。
 * 空文字を弾くのは、空のまま SQL へ流すと `repo_name = ''` が 1 件も一致せず、
 * 「限定した結果 0 件」と「配線ミスで 0 件」が観測上区別できなくなるため。
 */
export function ownWorkspaceScope(repoName: string): MemoryWorkspaceScope {
  if (repoName.trim() === '') {
    throw new Error('ownWorkspaceScope: repoName が空です（自ワークスペースを特定できません）');
  }
  return { kind: 'own_workspace', repoName };
}

/** 全ワークスペースを取り込むスコープ（限定前の従来挙動）。 */
export function allWorkspacesScope(): MemoryWorkspaceScope {
  return { kind: 'all_workspaces' };
}

/** 設定値 (`WorkspaceScopeMode`) と repoName から取込スコープを解決する。 */
export function resolveWorkspaceScope(
  mode: WorkspaceScopeMode,
  repoName: string,
): MemoryWorkspaceScope {
  return mode === 'all' ? allWorkspacesScope() : ownWorkspaceScope(repoName);
}

/**
 * activity_messages 行を対象ワークスペースへ絞る WHERE 述語を返す。
 *
 * `activity_sessions` は Phase H-4 で非正規化キャッシュの `repo_name` 列を物理撤去した
 * ため、`activity_repos` を JOIN して repo 名を復元する。メッセージ側の別名だけで成立する
 * 相関のない副問い合わせにしてあるのは、呼び出し元の 6 経路のうち `activity_sessions` を
 * JOIN しているものが 1 つしかなく、条件の定義を経路ごとに分岐させないため。
 *
 * 一致は完全一致。前方一致へ広げると `anytime-trade` のスコープが
 * `anytime-trade-external`（別リポジトリ）まで拾う。
 */
export function workspaceScopeSql(
  scope: MemoryWorkspaceScope,
  alias?: MessagesAlias,
): SqlPredicate {
  if (scope.kind === 'all_workspaces') {
    return { sql: '1 = 1', params: [] };
  }
  const prefix = alias ? `${alias}.` : '';
  return {
    sql:
      `${prefix}session_id IN (` +
      `SELECT s.id FROM trail.activity_sessions s ` +
      `JOIN trail.activity_repos r ON r.repo_id = s.repo_id ` +
      `WHERE r.repo_name = ?)`,
    params: [scope.repoName],
  };
}
