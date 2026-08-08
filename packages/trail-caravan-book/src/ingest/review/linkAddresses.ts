import type { CaravanDbConnection } from '../../db/connection/types';
import { entityId } from '../../canonical/entityId';
import { normalizeTargetPath } from './normalizeTargetPath';
import { escapeLike } from './resolveTargetRepo';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LinkAddressesInput = {
  db: CaravanDbConnection;
  windowDays?: number; // default 30
  logger: { warn: (msg: string) => void };
};

/**
 * 自動リンクの母集合から外れた指摘の件数（理由別・排他）。
 *
 * この内訳を返すのは、対象外の指摘が Flight Record 上で「未対処」と読まれるため。
 * 実測（2026-08-06）では session 経路 947 件のうち 889 件が母集合外で、その大半が
 * 対象パス欠落だった。件数を出さないと「レビュー指摘がほとんど放置されている」に
 * 見えるが、実際に追跡できていないのは記録の側。
 */
export type LinkAddressesSkipCounts = {
  /** severity=info（設計上リンク対象外）。 */
  severity_info: number;
  /** 対象ファイルパスが記録されていない。 */
  no_target_path: number;
  /** パスはあるがリポジトリを実在検査で解決できない。 */
  unresolved_repo: number;
};

export type LinkAddressesResult = {
  findings_linked: number;
  edges_inserted: number;
  /** 照合を試みた指摘（母集合）の件数。 */
  candidates: number;
  /** 母集合に入ったが窓内に一致するコミットが無かった指摘。 */
  no_matching_commit: number;
  /** 理由別の除外件数。集計に失敗したときは null（0 件と区別する）。 */
  skipped: LinkAddressesSkipCounts | null;
};

// ── Stop words ────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'in', 'of', 'to', 'and', 'or',
  'it', 'its', 'this', 'that', 'with', 'for', 'on', 'at',
  'by', 'are', 'was', 'be', 'as', 'from', 'not', 'but',
  'have', 'had', 'has',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract top N keywords from text (stop words removed, lowercased).
 */
function topKeywords(text: string, n: number): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      unique.push(w);
    }
  }

  return unique.slice(0, n);
}

/**
 * Extract a chapter title proxy: first line up to '.' or '\n', max 60 chars.
 */
function extractChapterTitleProxy(findingText: string): string {
  const firstLine = findingText.split('\n')[0] ?? '';
  const dotIdx = firstLine.indexOf('.');
  const raw = dotIdx >= 0 ? firstLine.slice(0, dotIdx) : firstLine;
  return raw.slice(0, 60).trim();
}

/**
 * Score a commit message against a finding.
 * Returns a numeric score (accept threshold >= 2).
 */
function scoreCommit(commitMessage: string, findingText: string): number {
  const lowerMsg = commitMessage.toLowerCase();
  const lowerFinding = findingText.toLowerCase();

  let score = 0;

  // +3: finding text (or 20-char excerpt) is a substring of commit message
  const excerpt = lowerFinding.slice(0, 20).trim();
  if (excerpt.length >= 4 && lowerMsg.includes(excerpt)) {
    score += 3;
  }

  // +1 per matching keyword (top 3). 一致数に比例させるのは、照合対象が件名 1 行から
  // フルメッセージ（件名＋本文）へ広がったため。以前は「3 語のうち 1 語でも当たれば +2」
  // で、それだけで受理閾値（>= 2）に届いた。数百文字の本文が相手ではありふれた 1 語が
  // ほぼ必ず当たるので、この配点のままだと指摘とコミットが無関係でもリンクされる。
  const keywords = topKeywords(findingText, 3);
  const keywordHits = keywords.filter((kw) => lowerMsg.includes(kw));
  score += keywordHits.length;

  // +1: chapter title proxy appears in commit message
  const titleProxy = extractChapterTitleProxy(findingText).toLowerCase();
  if (titleProxy.length > 2 && lowerMsg.includes(titleProxy)) {
    score += 1;
  }

  return score;
}

// ── Internal types ─────────────────────────────────────────────────────────────

type FindingRow = {
  id: string;
  finding_entity_id: string;
  target_file_path: string;
  /** 実在検査で解決済みの対象リポジトリ（resolveTargetRepo が埋める）。 */
  target_repo: string;
  finding_text: string;
  reviewed_at: string;
};

/**
 * 受理スコアの下限。
 *
 * ディレクトリ指定はファイル指定より特定性が低く、前方一致で候補コミットが桁違いに
 * 増える。同じ閾値のままだと、ありふれた語が偶然当たっただけの無関係なコミットが
 * 受理されてしまうため 1 段上げて補償する。
 */
const SCORE_THRESHOLD_FILE = 2;
const SCORE_THRESHOLD_DIRECTORY = 3;

// ── Per-finding helper ─────────────────────────────────────────────────────────

/**
 * Attempt to link one finding to the oldest qualifying commit.
 * Returns { edgeInserted: boolean } on success, null if no commit matched.
 */
function linkOneFinding(
  db: CaravanDbConnection,
  finding: FindingRow,
  effectiveWindowDays: number,
): { edgeInserted: boolean } | null {
  // 対象がファイルかディレクトリかは、格納済みの正規化パスから判定する。
  // 'unknown'（既知拡張子でも明らかなディレクトリでもない形）は両方式を試す。
  const normalized = normalizeTargetPath(finding.target_file_path);
  if (normalized === null) return null;
  const predicates: ReadonlyArray<'exact' | 'prefix'> =
    normalized.kind === 'file' ? ['exact'] : normalized.kind === 'directory' ? ['prefix'] : ['exact', 'prefix'];

  // リポジトリは finding.target_repo で絞る。かつては呼び出し元の単一 repoName で
  // 絞っており、他ワークスペースの指摘が永久にリンクできず、かつリポジトリ名を
  // 含まない相対パスが別リポジトリの同名ファイルへ誤リンクし得た。
  //
  // Phase H-4: trail.activity_session_commits / activity_commit_files から repo_name 列を撤去した。
  // 窓の下限は `committed_at >= reviewed_at`（同時刻の即時修正＝同一セッション内の対処も拾う）。
  // 兄弟 linkPrecedesBugs は後続バグを探すため `> reviewed_at`（厳密大なり）で、境界差は意図的。
  //
  // ディレクトリ指定は前方一致。`|| '/'` を挟んでセグメント境界を守る
  // （`packages/markdown-viewer` が `packages/markdown-viewer-extra/...` に当たらないように）。
  let acceptedCommit: { commit_hash: string; committed_at: string } | null = null;

  for (const predicate of predicates) {
    const isPrefix = predicate === 'prefix';
    const commitResult = db.exec(
      `SELECT DISTINCT sc.commit_hash, sc.commit_message, sc.committed_at
       FROM trail.activity_session_commits sc
       JOIN trail.activity_commit_files cf ON cf.commit_hash = sc.commit_hash
                                  AND cf.repo_id = sc.repo_id
       JOIN trail.activity_repos r ON r.repo_id = sc.repo_id
       WHERE ${isPrefix ? `cf.file_path LIKE ? || '/%' ESCAPE '\\'` : `cf.file_path = ?`}
         AND r.repo_name = ?
         AND sc.committed_at >= ?
         AND sc.committed_at <= datetime(?, '+' || ? || ' days')
       ORDER BY sc.committed_at ASC`,
      [
        isPrefix ? escapeLike(finding.target_file_path) : finding.target_file_path,
        finding.target_repo,
        finding.reviewed_at,
        finding.reviewed_at,
        effectiveWindowDays,
      ],
    );

    const commitRows = commitResult[0];
    if (!commitRows) continue;

    const threshold = isPrefix ? SCORE_THRESHOLD_DIRECTORY : SCORE_THRESHOLD_FILE;
    for (const row of commitRows.values) {
      const score = scoreCommit(String(row[1]), finding.finding_text);
      if (score >= threshold) {
        acceptedCommit = { commit_hash: String(row[0]), committed_at: String(row[2]) };
        break;
      }
    }
    if (acceptedCommit) break;
  }
  if (!acceptedCommit) return null;

  const now = new Date().toISOString();

  db.run(
    `UPDATE caravan_review_findings SET addressed_commit_sha = ?, addressed_at = ? WHERE id = ?`,
    [acceptedCommit.commit_hash, now, finding.id]
  );

  const commitEntityId = entityId('Commit', acceptedCommit.commit_hash);
  db.run(
    `INSERT OR IGNORE INTO caravan_entities
       (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Commit', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
    [commitEntityId, acceptedCommit.commit_hash, acceptedCommit.commit_hash, now, now, now]
  );

  const edgeId = entityId('edge', `addresses:${commitEntityId}:${finding.finding_entity_id}`);
  db.run(
    `INSERT OR IGNORE INTO caravan_edges
       (id, subject_entity_id, predicate, object_entity_id,
        valid_from, valid_to, recorded_at,
        source_type, source_ref,
        confidence, confidence_label, modality)
     VALUES (?, ?, 'addresses', ?, ?, NULL, ?, 'review', ?, 0.7, 'INFERRED', 'asserted')`,
    [edgeId, commitEntityId, finding.finding_entity_id, acceptedCommit.committed_at, now, `review_finding#${finding.id}`]
  );

  return { edgeInserted: db.getRowsModified() > 0 };
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * 未リンクの指摘が母集合から外れた理由を数える。
 *
 * 理由は排他（severity → パス → リポジトリの順に 1 つだけ数える）。重複して数えると
 * 合計が母数と合わず、「どこを直せば追跡できるようになるか」の判断に使えなくなる。
 * 集計に失敗しても本処理は止めない（可観測性の欠落は照合の失敗ではない）。
 * ただし 0 件で埋めずに null を返す — 「除外なし」と「数えられなかった」は別物。
 */
function countSkips(
  db: CaravanDbConnection,
  logger: { warn: (msg: string) => void },
): LinkAddressesSkipCounts | null {
  try {
    const result = db.exec(`
      SELECT
        SUM(CASE WHEN severity = 'info' THEN 1 ELSE 0 END),
        SUM(CASE WHEN severity != 'info' AND target_file_path IS NULL THEN 1 ELSE 0 END),
        SUM(CASE WHEN severity != 'info' AND target_file_path IS NOT NULL
                  AND target_repo IS NULL THEN 1 ELSE 0 END)
      FROM caravan_review_findings
      WHERE addressed_at IS NULL
    `);
    const row = result[0]?.values[0];
    if (!row) return { severity_info: 0, no_target_path: 0, unresolved_repo: 0 };
    return {
      severity_info: Number(row[0] ?? 0),
      no_target_path: Number(row[1] ?? 0),
      unresolved_repo: Number(row[2] ?? 0),
    };
  } catch (err) {
    logger.warn(`[anytime-memory] linkAddresses: failed to count skipped findings: ${String(err)}`);
    return null;
  }
}

export function linkAddresses(input: LinkAddressesInput): LinkAddressesResult {
  const { db, windowDays = 30, logger } = input;
  const effectiveWindowDays = Number.isFinite(windowDays) && windowDays > 0 ? windowDays : 30;
  const skipped = countSkips(db, logger);

  /** 母集合を作れなかったときの戻り値。除外内訳だけは残す（調査の起点になる）。 */
  const emptyResult: LinkAddressesResult = {
    findings_linked: 0,
    edges_inserted: 0,
    candidates: 0,
    no_matching_commit: 0,
    skipped,
  };

  let findings: FindingRow[];

  try {
    // コミット窓のアンカーは caravan_reviews.reviewed_at（実レビュー時刻）を使う。
    // caravan_review_findings.recorded_at は ingest 時刻なので、一括 re-ingest 後に
    // 全 finding が「今日」付けとなり、reviewed_at 直後の修正コミットを取りこぼす（誤り）。
    // linkPrecedesBugs と同じ修正。
    // target_repo が NULL の行は照合対象から外す（fail-closed）。NULL は
    // 「対象がどのリポジトリのものか確認できなかった」を意味し、ここで単一の
    // repoName を仮定して照合すると別リポジトリの同名ファイルへ誤リンクする。
    const result = db.exec(`
      SELECT mrf.id, mrf.finding_entity_id, mrf.target_file_path, mrf.target_repo,
             mrf.finding_text, r.reviewed_at
      FROM caravan_review_findings mrf
      JOIN caravan_reviews r ON r.id = mrf.review_id
      WHERE mrf.addressed_at IS NULL
        AND mrf.target_file_path IS NOT NULL
        AND mrf.target_repo IS NOT NULL
        AND mrf.severity != 'info'
    `);

    const rows = result[0];
    if (!rows) {
      return emptyResult;
    }

    findings = rows.values.map((r) => ({
      id: String(r[0]),
      finding_entity_id: String(r[1]),
      target_file_path: String(r[2]),
      target_repo: String(r[3]),
      finding_text: String(r[4]),
      reviewed_at: String(r[5]),
    }));
  } catch (err) {
    logger.warn(
      `[anytime-memory] linkAddresses: failed to query review findings: ${String(err)}`
    );
    return emptyResult;
  }

  let findingsLinked = 0;
  let edgesInserted = 0;

  for (const finding of findings) {
    try {
      const result = linkOneFinding(db, finding, effectiveWindowDays);
      if (result !== null) {
        findingsLinked += 1;
        if (result.edgeInserted) edgesInserted += 1;
      }
    } catch (err) {
      logger.warn(
        `[anytime-memory] linkAddresses: failed to process finding id=${finding.id}: ${String(err)}`
      );
    }
  }

  const skipText =
    skipped === null
      ? 'unavailable'
      : `info=${skipped.severity_info} noPath=${skipped.no_target_path} noRepo=${skipped.unresolved_repo}`;
  // レビュー指摘が「追跡できていない」量を毎回ログへ残す。件数を出さないと、
  // Flight Record 上の「未対処」が対処漏れなのか記録漏れなのか区別できない。
  logger.warn(
    `[anytime-memory] linkAddresses: candidates=${findings.length} linked=${findingsLinked} ` +
      `noMatch=${findings.length - findingsLinked} skipped(${skipText})`,
  );

  return {
    findings_linked: findingsLinked,
    edges_inserted: edgesInserted,
    candidates: findings.length,
    no_matching_commit: findings.length - findingsLinked,
    skipped,
  };
}
