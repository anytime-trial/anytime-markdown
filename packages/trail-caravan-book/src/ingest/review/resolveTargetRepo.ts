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

export interface ResolveByBasenameInput {
  /** activity.db が attach 済みの trail-caravan-book 接続。 */
  readonly db: CaravanDbConnection;
  /** ディレクトリ区切りを持たないファイル名（`cli.ts` 等）。 */
  readonly basename: string;
  /** レビューが行われたワークスペースの repo_name。 */
  readonly workspaceRepo: string;
}

/**
 * 裸のファイル名を、ワークスペース内で**一意に決まるときだけ**リポジトリ相対パスへ解決する。
 *
 * 対象パスを書かない指摘（実データでは非 info の 6 割）を救うための経路。`resolveTargetRepo`
 * と同じく実在で決めるが、こちらは入力が曖昧なぶん条件を 2 つ足して fail-closed にする。
 *
 * 1. **ワークスペースを跨いで探さない**。`workspaceRepo` が空なら即 null。同名ファイルは
 *    リポジトリ間で普遍的に衝突するため、跨いだ時点で誤リンクが不可避になる。
 * 2. **候補が 2 本以上あれば採用しない**。`types.ts` は 78 パス、`package.nls.json` は 9 パスに
 *    一致する。1 本選ぶと誤リンクになるので「わからない」を返す。
 *
 * rename 表記（`old => new`）と git のクォート表記（`"..."`）の行は除外する。どちらも
 * `activity_commit_files.file_path` に実在するが、パスそのものではなく差分の表現であり、
 * basename を切り出すと存在しないファイル名になる。
 *
 * SQL の `LIKE` で絞ったあと **JS で末尾セグメントの完全一致を取り直す**。SQLite の `LIKE` は
 * 既定で ASCII の大小文字を区別しないため、SQL だけで決めると `claude.md` が `CLAUDE.md` に
 * 一致する。Linux のパスは大小文字を区別するので、これは別ファイルへの解決であり、
 * `extractBasenameCandidates` の除外リスト（完全一致）も大小文字を変えるだけで素通りする。
 * 一意性の判定は絞り込みではなく完全一致の結果に対して行う（`LIMIT` を置くと、大小文字違いの
 * 行が枠を埋めて本来一意な一致を取り逃す）。
 */
export function resolveByBasename(input: ResolveByBasenameInput): ResolvedTargetRepo | null {
  const { db, basename, workspaceRepo } = input;
  if (workspaceRepo === '' || basename === '' || basename.includes('/')) return null;

  const result = db.exec(
    `SELECT DISTINCT cf.file_path
       FROM trail.activity_commit_files cf
       JOIN trail.activity_repos r ON r.repo_id = cf.repo_id
      WHERE r.repo_name = ?
        AND (cf.file_path = ? OR cf.file_path LIKE '%/' || ? ESCAPE '\\')
        AND cf.file_path NOT LIKE '%=>%' ESCAPE '\\'
        AND cf.file_path NOT LIKE '"%' ESCAPE '\\'`,
    [workspaceRepo, basename, escapeLike(basename)],
  );

  const matches = (result[0]?.values ?? [])
    .map((row) => String(row[0]))
    .filter((filePath) => filePath.slice(filePath.lastIndexOf('/') + 1) === basename);
  if (matches.length !== 1) return null;

  return { repo: workspaceRepo, path: matches[0] };
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
