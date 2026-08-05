/**
 * レビュー指摘の対象パスがどのリポジトリのものかを決める。
 *
 * memory-core.db は複数ワークスペース（anytime-markdown / anytime-trade / anytime-lab）の
 * レビューを 1 つの DB に集約している。一方 linkAddresses は長らく単一の repoName で
 * 照合していたため、他ワークスペースの指摘は永久にリンクできず、さらに
 * `src/hooks/useHydrated.ts` のようなリポジトリ名を含まない相対パスは
 * **別リポジトリの同名ファイルへ誤リンクし得る**状態だった。
 *
 * 方針は「実在で決める、推測しない」。プレフィックスの規則で当てにいかず、
 * `trail.commit_files` に実在するかどうかだけで判定する。判定できない場合は
 * null を返して照合対象から外す（fail-closed）。誤ったリンクは無いリンクより悪い。
 */
import type { MemoryDbConnection } from '../db/connection/types';
import type { NormalizedTargetPath } from './normalizeTargetPath';

export interface ResolvedTargetRepo {
  readonly repo: string;
  /** repo ルートからの相対パス。 */
  readonly path: string;
}

export interface ResolveTargetRepoInput {
  /** trail.db が attach 済みの memory-core 接続。 */
  readonly db: MemoryDbConnection;
  readonly target: NormalizedTargetPath;
  /** レビューが行われたワークスペースの repo_name。同名衝突時の優先先になる。 */
  readonly workspaceRepo: string;
}

/** 与えられた相対パスが実在するリポジトリ名を列挙する。 */
function reposContaining(
  db: MemoryDbConnection,
  relativePath: string,
  kind: NormalizedTargetPath['kind'],
): string[] {
  // ディレクトリは前方一致。`|| '/'` を挟むのは、`packages/markdown-viewer` が
  // `packages/markdown-viewer-extra/...` に一致しないようにするため（セグメント境界を守る）。
  const sql =
    kind === 'directory'
      ? `SELECT DISTINCT r.repo_name
           FROM trail.commit_files cf
           JOIN trail.repos r ON r.repo_id = cf.repo_id
          WHERE cf.file_path LIKE ? || '/%'`
      : `SELECT DISTINCT r.repo_name
           FROM trail.commit_files cf
           JOIN trail.repos r ON r.repo_id = cf.repo_id
          WHERE cf.file_path = ?`;

  const result = db.exec(sql, [relativePath]);
  return (result[0]?.values ?? []).map((row) => String(row[0]));
}

/** 既知のリポジトリ名一覧。 */
function knownRepoNames(db: MemoryDbConnection): Set<string> {
  const result = db.exec('SELECT repo_name FROM trail.repos');
  return new Set((result[0]?.values ?? []).map((row) => String(row[0])));
}

/**
 * 絶対パスからリポジトリ名のセグメントを見つけ、`{ repo, 相対パス }` に割る。
 * `/anytime-trade/docs/x.md` と `/Shared/anytime-markdown-docs/proposal/y.md` の
 * 双方（リポジトリ名が 1 段目・2 段目）を扱う。
 */
function splitAbsolute(
  db: MemoryDbConnection,
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
    // 実在するものだけを残す。複数残ったら、より深い（後段の）分割を優先する
    // ——`/a/b/c` で a と b の双方がリポジトリ名でも、実在検査を通るのは片方だけのことが多い。
    for (const candidate of splitAbsolute(db, target.path)) {
      if (reposContaining(db, candidate.path, target.kind).includes(candidate.repo)) {
        return candidate;
      }
    }
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
