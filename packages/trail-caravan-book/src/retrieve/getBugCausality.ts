import type { CaravanDbConnection } from '../db/connection/types';

/**
 * 因果カード取得（spec memory-core §7.6・proposal 20260809 U1b）。
 *
 * ふりかえり時に「不具合がどういう原因で発生したか」を、汎用検索の点結果では
 * なく `caravan_bug_fixes` + 型付きエッジの連鎖として 1 カードで返す。
 * カード 1 件は 500 トークン以下を目標に、自由文フィールドを切り詰める。
 */

export interface GetBugCausalityInput {
  query?: string;
  commit_sha?: string;
  file_path?: string;
  limit?: number;
}

export interface BugCausalityCard {
  bug: { id: string; display_name: string; package: string; category: string; committed_at: string };
  /** 修正が触ったファイル（先頭 3 件。file_path 起点の照合と再発調査の足がかり） */
  affected_files: string[];
  fix_commit: { sha: string; subject: string; why: string | null };
  introduced_commit: { sha: string; inferred: true } | null;
  root_cause_episode: { id: string; excerpt: string } | null;
  precursor_findings: Array<{ id: string; excerpt: string }>;
  recurrence: { same_file_bug_count: number; same_category_count: number };
  related_decisions: Array<{ id: string; display_name: string }>;
}

export interface GetBugCausalityResult {
  cards: BugCausalityCard[];
  matched: boolean;
}

const WHY_MAX_CHARS = 500;
const EXCERPT_MAX_CHARS = 200;
const DEFAULT_LIMIT = 3;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function getBugCausality(db: CaravanDbConnection, input: GetBugCausalityInput): GetBugCausalityResult {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (input.commit_sha) {
    conditions.push(`bf.commit_sha LIKE ?`);
    params.push(`${input.commit_sha}%`);
  }
  if (input.file_path) {
    conditions.push(`bf.affected_file_paths_json LIKE ?`);
    params.push(`%${input.file_path}%`);
  }
  if (input.query) {
    // 空白区切りトークンの AND（subject_summary か Bug 表示名のどちらかに現れること）
    for (const token of input.query.split(/\s+/).filter((t) => t.length > 0)) {
      conditions.push(`(bf.subject_summary LIKE ? OR bug.display_name LIKE ?)`);
      params.push(`%${token}%`, `%${token}%`);
    }
  }
  if (conditions.length === 0) {
    return { cards: [], matched: false };
  }

  const limit = input.limit ?? DEFAULT_LIMIT;
  const rows = db.exec(
    `SELECT bf.id, bf.commit_sha, bf.bug_entity_id, bug.display_name, bf.package, bf.category,
            bf.subject_summary, bf.body_excerpt, bf.introduced_commit_sha,
            bf.root_cause_episode_id, ep.raw_excerpt, bf.committed_at,
            bf.affected_file_paths_json
       FROM caravan_bug_fixes bf
       JOIN caravan_entities bug ON bug.id = bf.bug_entity_id
       LEFT JOIN caravan_episodes ep ON ep.id = bf.root_cause_episode_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY bf.committed_at DESC
      LIMIT ${Number(limit)}`,
    params,
  );

  const cards: BugCausalityCard[] = [];
  for (const row of rows[0]?.values ?? []) {
    const bugFixId = row[0] as string;
    const commitSha = row[1] as string;
    const bugEntityId = row[2] as string;
    const bugDisplayName = row[3] as string;
    const pkg = row[4] as string;
    const category = row[5] as string;
    const subject = row[6] as string;
    const bodyExcerpt = (row[7] as string | null) ?? '';
    const introducedSha = row[8] as string | null;
    const episodeId = row[9] as string | null;
    const episodeExcerpt = (row[10] as string | null) ?? '';
    const committedAt = row[11] as string;
    const affectedJson = (row[12] as string | null) ?? '[]';

    // 予兆: ReviewFinding --precedes--> Bug
    const findingRows = db.exec(
      `SELECT f.id, f.display_name
         FROM caravan_edges e
         JOIN caravan_entities f ON f.id = e.subject_entity_id
        WHERE e.predicate = 'precedes' AND e.object_entity_id = ? AND e.valid_to IS NULL
        ORDER BY e.valid_from DESC LIMIT 3`,
      [bugEntityId],
    );
    const precursorFindings = (findingRows[0]?.values ?? []).map((f) => ({
      id: f[0] as string,
      excerpt: truncate((f[1] as string) ?? '', EXCERPT_MAX_CHARS),
    }));

    // 再発性: 同カテゴリ（package × category）と同一ファイルを触った他のバグ修正
    const catRows = db.exec(
      `SELECT COUNT(*) FROM caravan_bug_fixes WHERE package = ? AND category = ? AND id != ?`,
      [pkg, category, bugFixId],
    );
    const sameCategoryCount = Number(catRows[0]?.values?.[0]?.[0] ?? 0);

    let sameFileBugCount = 0;
    let affectedFiles: string[] = [];
    try {
      const parsed: unknown = JSON.parse(affectedJson);
      const files = Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
      affectedFiles = files.slice(0, 3);
      if (files.length > 0) {
        const likeConds = files.map(() => `affected_file_paths_json LIKE ?`).join(' OR ');
        const fileRows = db.exec(
          `SELECT COUNT(*) FROM caravan_bug_fixes WHERE id != ? AND (${likeConds})`,
          [bugFixId, ...files.map((f) => `%${JSON.stringify(f).slice(1, -1)}%`)],
        );
        sameFileBugCount = Number(fileRows[0]?.values?.[0]?.[0] ?? 0);
      }
    } catch (err) {
      // affected_file_paths_json は CHECK (json_valid) 済みだが、防御的に 0 のまま進める
      void err;
    }

    // 関連する決定: Bug と任意の述語で結ばれた Decision（向き不問）
    const decisionRows = db.exec(
      `SELECT d.id, d.display_name
         FROM caravan_edges e
         JOIN caravan_entities d
           ON d.id = CASE WHEN e.subject_entity_id = ? THEN e.object_entity_id ELSE e.subject_entity_id END
        WHERE (e.subject_entity_id = ? OR e.object_entity_id = ?)
          AND e.valid_to IS NULL AND d.type = 'Decision'
        ORDER BY e.valid_from DESC LIMIT 3`,
      [bugEntityId, bugEntityId, bugEntityId],
    );
    const relatedDecisions = (decisionRows[0]?.values ?? []).map((d) => ({
      id: d[0] as string,
      display_name: truncate((d[1] as string) ?? '', EXCERPT_MAX_CHARS),
    }));

    cards.push({
      bug: { id: bugEntityId, display_name: bugDisplayName, package: pkg, category, committed_at: committedAt },
      affected_files: affectedFiles,
      fix_commit: {
        sha: commitSha,
        subject,
        why: bodyExcerpt === '' ? null : truncate(bodyExcerpt, WHY_MAX_CHARS),
      },
      introduced_commit: introducedSha === null || introducedSha === '' ? null : { sha: introducedSha, inferred: true },
      root_cause_episode:
        episodeId === null ? null : { id: episodeId, excerpt: truncate(episodeExcerpt, EXCERPT_MAX_CHARS) },
      precursor_findings: precursorFindings,
      recurrence: { same_file_bug_count: sameFileBugCount, same_category_count: sameCategoryCount },
      related_decisions: relatedDecisions,
    });
  }

  return { cards, matched: cards.length > 0 };
}
