/**
 * レビュー指摘の対象パスがどのリポジトリのものかを決める。
 *
 * caravan-book.db は複数ワークスペース（anytime-markdown / anytime-trade / anytime-lab）の
 * レビューを 1 つの DB に集約している。一方 linkAddresses は長らく単一の repoName で
 * 照合していたため、他ワークスペースの指摘は永久にリンクできず、さらに
 * `src/hooks/useHydrated.ts` のようなリポジトリ名を含まない相対パスは
 * **別リポジトリの同名ファイルへ誤リンクし得る**状態だった。
 *
 * 方針は「実在で決める、推測しない」。プレフィックスの規則で当てにいかず、
 * `trail.activity_commit_files` に実在するかどうかだけで判定する。判定できない場合は
 * null を返して照合対象から外す（fail-closed）。誤ったリンクは無いリンクより悪い。
 */
import type { CaravanDbConnection } from '../../db/connection/types';
import type { NormalizedTargetPath } from './normalizeTargetPath';

export interface ResolvedTargetRepo {
  readonly repo: string;
  /** repo ルートからの相対パス。 */
  readonly path: string;
}

export interface ResolveTargetRepoInput {
  /** activity.db が attach 済みの trail-caravan-book 接続。 */
  readonly db: CaravanDbConnection;
  readonly target: NormalizedTargetPath;
  /** レビューが行われたワークスペースの repo_name。同名衝突時の優先先になる。 */
  readonly workspaceRepo: string;
}

/**
 * LIKE のワイルドカード（`%` `_`）とエスケープ文字自身を無害化する。
 *
 * `normalizeTargetPath` は `*?[]` を拒否するが `_` `%` は通す。このリポジトリでは
 * `__tests__` が普遍的に現れるため、素で LIKE に渡すと `_` が任意 1 文字として効き、
 * `aatestsbb/` のような無関係ディレクトリにまで一致する。`|| '/'` でセグメント境界を
 * 守った意図が同じ述語の中で別方向から破られるので、必ずここを通す。
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * 与えられた相対パスが実在するリポジトリ名を列挙する。
 *
 * `kind` が `'unknown'`（拡張子の有無で判別できない形）のときは完全一致と前方一致の
 * 両方を試す。判定を拡張子ヒューリスティックに委ねると、`spec/92.doctrine` のような
 * ドット入りディレクトリや `scripts/post-commit` のような拡張子なしファイルが
 * 永久に解決できなくなる（症状は「解決できなかった行」に紛れて異常として現れない）。
 */
function reposContaining(
  db: CaravanDbConnection,
  relativePath: string,
  kind: NormalizedTargetPath['kind'],
): string[] {
  const exactSql = `SELECT DISTINCT r.repo_name
       FROM trail.activity_commit_files cf
       JOIN trail.activity_repos r ON r.repo_id = cf.repo_id
      WHERE cf.file_path = ?`;
  // ディレクトリは前方一致。`|| '/'` を挟むのは、`packages/markdown-viewer` が
  // `packages/markdown-viewer-extra/...` に一致しないようにするため（セグメント境界を守る）。
  const prefixSql = `SELECT DISTINCT r.repo_name
       FROM trail.activity_commit_files cf
       JOIN trail.activity_repos r ON r.repo_id = cf.repo_id
      WHERE cf.file_path LIKE ? || '/%' ESCAPE '\\'`;

  const names = new Set<string>();
  const run = (sql: string, param: string): void => {
    const result = db.exec(sql, [param]);
    for (const row of result[0]?.values ?? []) names.add(String(row[0]));
  };

  if (kind !== 'directory') run(exactSql, relativePath);
  if (kind !== 'file') run(prefixSql, escapeLike(relativePath));

  return [...names];
}

/** 既知のリポジトリ名一覧。 */
function knownRepoNames(db: CaravanDbConnection): Set<string> {
  const result = db.exec('SELECT repo_name FROM trail.activity_repos');
  return new Set((result[0]?.values ?? []).map((row) => String(row[0])));
}

/**
 * 絶対パスからリポジトリ名のセグメントを見つけ、`{ repo, 相対パス }` に割る。
 * `/anytime-trade/docs/x.md` と `/Shared/anytime-markdown-docs/proposal/y.md` の
 * 双方（リポジトリ名が 1 段目・2 段目）を扱う。
 */
function splitAbsolute(
  db: CaravanDbConnection,
  absolutePath: string,
): ReadonlyArray<ResolvedTargetRepo> {
  const known = knownRepoNames(db);
  const segments = absolutePath.replace(/^\/+/, '').split('/');
  const splits: ResolvedTargetRepo[] = [];
  // 末尾セグメントは対象そのものなので、リポジトリ名の候補から外す。
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (known.has(segment)) {
      splits.push({ repo: segment, path: segments.slice(i + 1).join('/') });
    }
  }
  return splits;
}

export function resolveTargetRepo(input: ResolveTargetRepoInput): ResolvedTargetRepo | null {
  const { db, target, workspaceRepo } = input;

  if (target.absolute) {
    // 実在検査を通った分割だけを残し、**件数で判定する**。
    // 先頭一致で即 return すると、`/a/b/c` で a と b の双方がリポジトリ名として
    // 実在した場合に浅い側を黙って選ぶことになる。相対パス側は同じ「わからない」を
    // null で返しているので、経路によって推測するかどうかが変わらないよう揃える。
    const viable = splitAbsolute(db, target.path).filter((candidate) =>
      reposContaining(db, candidate.path, target.kind).includes(candidate.repo),
    );
    if (viable.length === 1) return viable[0];
    return null;
  }

  const candidates = reposContaining(db, target.path, target.kind);
  if (candidates.length === 0) return null;
  if (candidates.includes(workspaceRepo)) {
    return { repo: workspaceRepo, path: target.path };
  }
  if (candidates.length === 1) {
    return { repo: candidates[0], path: target.path };
  }
  // 同名ファイルが複数リポジトリに在り、ワークスペースで決められない。
  // ここで 1 つ選ぶと誤リンクになるため「わからない」を返す。
  return null;
}
