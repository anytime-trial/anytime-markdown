/**
 * レビュー記録のワークスペース／対象リポジトリを解決する後段パス。
 *
 * 取込（persist）の中で解決せず独立した 1 パスにしているのは 2 つの理由による。
 *
 * 1. **増分取込とバックフィルが同じ実装になる**。取込側に埋め込むと、既存行を直す
 *    バックフィルが別実装になり、片方だけ直る（このバグ自体がその形で生まれた）。
 * 2. **未解決は永続的な失敗ではない**。対象ファイルがまだコミットされていない時点の
 *    指摘は解決できないが、後でコミットが届けば解決できる。毎回 NULL の行だけを
 *    再試行することで、時間差で解決する。
 *
 * どちらの関数も「解決できたものだけ埋める」。推測で埋めない。
 */
import type { MemoryDbConnection } from '../../db/connection/types';
import type { MemoryLogger } from '../../logger';
import { normalizeTargetPath } from './normalizeTargetPath';
import { resolveTargetRepo } from './resolveTargetRepo';

/**
 * MemoryLogger の `warn` は optional なので、未実装なら `info` へ落とす。
 * `logger.warn?.(...)` だと未実装環境で警告が黙って消える（silent catch と同じ害）。
 */
function warn(logger: MemoryLogger, message: string): void {
  if (logger.warn) logger.warn(message);
  else logger.info(message);
}

export interface ResolveReviewTargetsResult {
  /** workspace を新たに埋めた memory_reviews の行数。 */
  readonly workspacesFilled: number;
  /** target_repo を新たに埋めた memory_review_findings の行数。 */
  readonly targetsResolved: number;
  /** target_file_path を正規化して書き換えた行数。 */
  readonly pathsNormalized: number;
  /** 正規化に失敗し NULL へ落とした行数（パスとして成立しなかったもの）。 */
  readonly pathsRejected: number;
}

/**
 * `memory_reviews.workspace` が未設定（''）の行を埋める。
 *
 * `source_kind='session'` は source_ref 先頭の session_id から trail.sessions →
 * trail.repos を辿って実際のワークスペースを引く。それ以外（review_doc / agent /
 * pr_comment）は取込を実行しているワークスペースを使う。
 */
export function resolveReviewWorkspaces(
  db: MemoryDbConnection,
  defaultWorkspace: string,
  logger: MemoryLogger,
): number {
  let filled = 0;

  try {
    // session 経路: 実際のセッションのリポジトリを引く。
    db.run(
      `UPDATE memory_reviews
          SET workspace = COALESCE((
                SELECT rp.repo_name
                  FROM trail.sessions s
                  JOIN trail.repos rp ON rp.repo_id = s.repo_id
                 WHERE s.id = substr(memory_reviews.source_ref, 1, instr(memory_reviews.source_ref, '#') - 1)
              ), '')
        WHERE workspace = ''
          AND source_kind = 'session'
          AND instr(source_ref, '#') > 1`,
      [],
    );
    filled += db.getRowsModified();
  } catch (err) {
    warn(logger,
      `[anytime-memory] resolveReviewWorkspaces: session workspace resolution failed: ${String(err)}`,
    );
  }

  try {
    db.run(`UPDATE memory_reviews SET workspace = ? WHERE workspace = ''`, [defaultWorkspace]);
    filled += db.getRowsModified();
  } catch (err) {
    warn(logger,
      `[anytime-memory] resolveReviewWorkspaces: default workspace fill failed: ${String(err)}`,
    );
  }

  return filled;
}

interface PendingFinding {
  readonly id: string;
  readonly rawPath: string;
  readonly workspace: string;
}

/**
 * `target_repo` が未解決の findings について、パスを正規化しリポジトリを解決する。
 *
 * 正規化できなかったパス（コマンド行・URL・散文の誤抽出）は NULL へ落とす。
 * 残しておくと `target_file_path IS NOT NULL` を条件にする下流（linkAddresses /
 * linkPrecedesBugs / review_unfixed 検知）が永久に空振りし続けるため。
 */
export function resolveFindingTargets(
  db: MemoryDbConnection,
  logger: MemoryLogger,
): Pick<ResolveReviewTargetsResult, 'targetsResolved' | 'pathsNormalized' | 'pathsRejected'> {
  let pending: PendingFinding[];

  try {
    const result = db.exec(
      `SELECT rf.id, rf.target_file_path, r.workspace
         FROM memory_review_findings rf
         JOIN memory_reviews r ON r.id = rf.review_id
        WHERE rf.target_repo IS NULL
          AND rf.target_file_path IS NOT NULL
          AND rf.target_file_path != ''`,
      [],
    );
    pending = (result[0]?.values ?? []).map((row) => ({
      id: String(row[0]),
      rawPath: String(row[1]),
      workspace: String(row[2] ?? ''),
    }));
  } catch (err) {
    warn(logger,
      `[anytime-memory] resolveFindingTargets: failed to query pending findings: ${String(err)}`,
    );
    return { targetsResolved: 0, pathsNormalized: 0, pathsRejected: 0 };
  }

  let targetsResolved = 0;
  let pathsNormalized = 0;
  let pathsRejected = 0;

  for (const finding of pending) {
    try {
      const normalized = normalizeTargetPath(finding.rawPath);

      if (normalized === null) {
        db.run(`UPDATE memory_review_findings SET target_file_path = NULL WHERE id = ?`, [
          finding.id,
        ]);
        pathsRejected += 1;
        continue;
      }

      const resolved = resolveTargetRepo({
        db,
        target: normalized,
        workspaceRepo: finding.workspace,
      });

      // 解決できたら repo 相対パスへ書き換える（絶対パスが相対に畳まれる）。
      // 解決できなくても正規化後の値は保存する（行番号サフィックス等は落ちる）。
      const storedPath = resolved?.path ?? normalized.path;
      if (storedPath !== finding.rawPath) {
        db.run(`UPDATE memory_review_findings SET target_file_path = ? WHERE id = ?`, [
          storedPath,
          finding.id,
        ]);
        pathsNormalized += 1;
      }

      if (resolved !== null) {
        db.run(`UPDATE memory_review_findings SET target_repo = ? WHERE id = ?`, [
          resolved.repo,
          finding.id,
        ]);
        targetsResolved += 1;
      }
    } catch (err) {
      warn(logger,
        `[anytime-memory] resolveFindingTargets: finding=${finding.id} failed: ${String(err)}`,
      );
    }
  }

  return { targetsResolved, pathsNormalized, pathsRejected };
}

/** ワークスペース解決 → 対象リポジトリ解決をまとめて実行する。 */
export function resolveReviewTargets(input: {
  db: MemoryDbConnection;
  defaultWorkspace: string;
  logger: MemoryLogger;
}): ResolveReviewTargetsResult {
  const { db, defaultWorkspace, logger } = input;
  const workspacesFilled = resolveReviewWorkspaces(db, defaultWorkspace, logger);
  const findings = resolveFindingTargets(db, logger);
  return { workspacesFilled, ...findings };
}
