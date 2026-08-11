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
import type { CaravanDbConnection } from '../../db/connection/types';
import type { CaravanLogger } from '../../logger';
import { extractBasenameCandidates } from './findingHelpers';
import { normalizeTargetPath } from './normalizeTargetPath';
import { resolveByBasename, resolveTargetRepo } from './resolveTargetRepo';

/**
 * CaravanLogger の `warn` は optional なので、未実装なら `info` へ落とす。
 * `logger.warn?.(...)` だと未実装環境で警告が黙って消える（silent catch と同じ害）。
 */
function warn(logger: CaravanLogger, message: string): void {
  if (logger.warn) logger.warn(message);
  else logger.info(message);
}

export interface ResolveReviewTargetsResult {
  /** workspace を新たに埋めた caravan_reviews の行数。 */
  readonly workspacesFilled: number;
  /** target_repo を新たに埋めた caravan_review_findings の行数。 */
  readonly targetsResolved: number;
  /** target_file_path を正規化して書き換えた行数。 */
  readonly pathsNormalized: number;
  /** 正規化に失敗し NULL へ落とした行数（パスとして成立しなかったもの）。 */
  readonly pathsRejected: number;
  /** 対象パスが空だった指摘のうち、裸のファイル名から一意解決して埋めた行数。 */
  readonly pathsInferred: number;
  /**
   * 対象パスが空のまま残った指摘の件数。
   *
   * 埋めた件数だけでは「元から少なかった」と「ほとんど救えなかった」を区別できない。
   * 上流（レビュー出力書式）の必須化が効いているかは、この残数の推移でしか読めない。
   */
  readonly pathsStillMissing: number;
  /**
   * 処理中に発生した失敗の件数。
   *
   * 0 件と失敗を区別するために持つ。すべて 0 の戻り値は「解決すべき行が無かった」と
   * 「attach 未成立やスキーマ不整合で全件失敗した」のどちらでも生じ、集計行だけを見る
   * 運用では後者が正常運転として通過してしまう。
   */
  readonly failures: number;
}

/**
 * `source_kind='session'` のレビューについて、source_ref 先頭の session_id から
 * trail.activity_sessions → trail.activity_repos を辿って実際のワークスペースを引く。
 *
 * **既定値による一括フォールバックは持たない**。`WHERE workspace = ''` だけで絞ると
 * DB 内の未解決行**全部**が対象になり、複数ワークスペースを集約している
 * caravan-book.db では他ワークスペース由来の行まで取込側のワークスペースとして
 * 刻印される。その値は resolveFindingTargets が同名ファイルの優先先として使うため、
 * 本変更が塞ごうとしている誤リンクを別経路から再導入することになる。
 * 取込側のワークスペースが自明な経路（review_doc / agent）は、その経路の
 * 取込処理が自分の書いた行に対してだけ workspace を設定する。
 */
export function resolveReviewWorkspaces(
  db: CaravanDbConnection,
  logger: CaravanLogger,
): { filled: number; failures: number } {
  let filled = 0;
  let failures = 0;

  // 読み（trail 参照）と書きを必ず分ける。attach ガードは `trail.` を含む書き込み SQL を
  // 一律に拒否するため、相関サブクエリ付き UPDATE は subquery が読み取りだけでも失敗する。
  // 1 文にまとめると本番で毎回失敗し、下の既定値フォールバックが全 session レビューへ
  // 誤ったワークスペースを書き込む（fail-open）。
  let sessionRows: Array<{ id: string; workspace: string }> = [];
  try {
    const result = db.exec(
      `SELECT r.id, rp.repo_name
         FROM caravan_reviews r
         JOIN trail.activity_sessions s
           ON s.id = substr(r.source_ref, 1, instr(r.source_ref, '#') - 1)
         JOIN trail.activity_repos rp ON rp.repo_id = s.repo_id
        WHERE r.workspace = ''
          AND r.source_kind = 'session'
          AND instr(r.source_ref, '#') > 1`,
    );
    sessionRows = (result[0]?.values ?? []).map((row) => ({
      id: String(row[0]),
      workspace: String(row[1]),
    }));
  } catch (err) {
    failures += 1;
    warn(
      logger,
      `[anytime-memory] resolveReviewWorkspaces: session workspace lookup failed: ${String(err)}`,
    );
  }

  for (const row of sessionRows) {
    try {
      db.run(`UPDATE caravan_reviews SET workspace = ? WHERE id = ?`, [row.workspace, row.id]);
      filled += 1;
    } catch (err) {
      failures += 1;
      warn(
        logger,
        `[anytime-memory] resolveReviewWorkspaces: review=${row.id} update failed: ${String(err)}`,
      );
    }
  }

  return { filled, failures };
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
  db: CaravanDbConnection,
  logger: CaravanLogger,
): Pick<
  ResolveReviewTargetsResult,
  'targetsResolved' | 'pathsNormalized' | 'pathsRejected' | 'failures'
> {
  let pending: PendingFinding[];

  try {
    const result = db.exec(
      `SELECT rf.id, rf.target_file_path, r.workspace
         FROM caravan_review_findings rf
         JOIN caravan_reviews r ON r.id = rf.review_id
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
    return { targetsResolved: 0, pathsNormalized: 0, pathsRejected: 0, failures: 1 };
  }

  let targetsResolved = 0;
  let pathsNormalized = 0;
  let pathsRejected = 0;
  let failures = 0;

  for (const finding of pending) {
    try {
      const normalized = normalizeTargetPath(finding.rawPath);

      if (normalized === null) {
        db.run(`UPDATE caravan_review_findings SET target_file_path = NULL WHERE id = ?`, [
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
        db.run(`UPDATE caravan_review_findings SET target_file_path = ? WHERE id = ?`, [
          storedPath,
          finding.id,
        ]);
        pathsNormalized += 1;
      }

      if (resolved !== null) {
        db.run(`UPDATE caravan_review_findings SET target_repo = ? WHERE id = ?`, [
          resolved.repo,
          finding.id,
        ]);
        targetsResolved += 1;
      }
    } catch (err) {
      failures += 1;
      warn(logger,
        `[anytime-memory] resolveFindingTargets: finding=${finding.id} failed: ${String(err)}`,
      );
    }
  }

  return { targetsResolved, pathsNormalized, pathsRejected, failures };
}

interface PathlessFinding {
  readonly id: string;
  readonly text: string;
  readonly workspace: string;
}

/**
 * 対象パスが空の findings を、本文中の裸のファイル名から救う。
 *
 * 実データでは非 info の指摘の 6 割が対象パスを持たず、その大半は本文に
 * `` `cli.ts` `` `` `pipelineWatchdog.ts:33-38` `` のようにファイル名だけを書いている。
 * ディレクトリ接頭辞を必須にする `extractTargetFromFinding` は 1 件も拾えない。
 *
 * `resolveFindingTargets` と同じく**独立した 1 パス**にして、増分取込とバックフィルを
 * 同じ実装に乗せる。埋めた行は `target_inferred_by='basename'` を刻む — 推測由来は
 * 「移動済みファイルの旧パスへ一意解決して、以後どのコミットとも一致しない」という
 * 固有の失敗モードを持ち、明示された対象と混ぜると対処率の低下要因を切り分けられない。
 *
 * `severity='info'` は設計上リンク対象外なので走査しない（無駄な照会を避ける）。
 */
export function resolveMissingFindingPaths(
  db: CaravanDbConnection,
  logger: CaravanLogger,
): Pick<ResolveReviewTargetsResult, 'pathsInferred' | 'pathsStillMissing' | 'failures'> {
  let pending: PathlessFinding[];

  try {
    const result = db.exec(
      `SELECT rf.id, rf.finding_text, rf.suggestion_text, r.workspace
         FROM caravan_review_findings rf
         JOIN caravan_reviews r ON r.id = rf.review_id
        WHERE (rf.target_file_path IS NULL OR rf.target_file_path = '')
          AND rf.severity <> 'info'`,
      [],
    );
    pending = (result[0]?.values ?? []).map((row) => ({
      id: String(row[0]),
      text: `${String(row[1] ?? '')}\n${String(row[2] ?? '')}`,
      workspace: String(row[3] ?? ''),
    }));
  } catch (err) {
    warn(
      logger,
      `[anytime-memory] resolveMissingFindingPaths: failed to query pathless findings: ${String(err)}`,
    );
    return { pathsInferred: 0, pathsStillMissing: 0, failures: 1 };
  }

  let pathsInferred = 0;
  let failures = 0;

  for (const finding of pending) {
    try {
      const resolved = firstResolvableBasename(db, finding);
      if (resolved === null) continue;

      db.run(
        `UPDATE caravan_review_findings
            SET target_file_path = ?, target_repo = ?, target_inferred_by = 'basename'
          WHERE id = ?`,
        [resolved.path, resolved.repo, finding.id],
      );
      pathsInferred += 1;
    } catch (err) {
      failures += 1;
      warn(
        logger,
        `[anytime-memory] resolveMissingFindingPaths: finding=${finding.id} failed: ${String(err)}`,
      );
    }
  }

  return { pathsInferred, pathsStillMissing: pending.length - pathsInferred, failures };
}

/**
 * 候補を出現順に試し、最初に一意解決したものを採る。
 *
 * 出現順にするのは、指摘は「まず対象を名指してから周辺を説明する」書き方が支配的で、
 * 先に出るファイル名ほど対象である確度が高いため。順位付けを増やすと推測が強くなるので、
 * 曖昧さの排除は `resolveByBasename` の一意性検査だけに任せる。
 */
function firstResolvableBasename(
  db: CaravanDbConnection,
  finding: PathlessFinding,
): { repo: string; path: string } | null {
  for (const basename of extractBasenameCandidates(finding.text)) {
    const resolved = resolveByBasename({ db, basename, workspaceRepo: finding.workspace });
    if (resolved !== null) return resolved;
  }
  return null;
}

/** ワークスペース解決 → 対象リポジトリ解決 → 対象パス欠落の補完をまとめて実行する。 */
export function resolveReviewTargets(input: {
  db: CaravanDbConnection;
  logger: CaravanLogger;
}): ResolveReviewTargetsResult {
  const { db, logger } = input;
  const workspaces = resolveReviewWorkspaces(db, logger);
  const findings = resolveFindingTargets(db, logger);
  // 順序は固定。resolveFindingTargets は正規化に失敗したパスを NULL へ落とすため、
  // 先に走らせておくと「誤抽出で埋まっていた行」も補完の対象に入る。
  const inferred = resolveMissingFindingPaths(db, logger);
  return {
    ...findings,
    ...inferred,
    workspacesFilled: workspaces.filled,
    failures: workspaces.failures + findings.failures + inferred.failures,
  };
}
