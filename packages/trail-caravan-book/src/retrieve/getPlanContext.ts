import type { CaravanDbConnection } from '../db/connection/types';

/**
 * 計画コンテキストパック（spec memory-core §7.7・proposal 20260809 U2b）。
 *
 * 設計・実装計画の着手時に「対象ファイル群に関わる過去の文脈」（未対処指摘・
 * 再発バグ・決定・制約・共変更）を 1 呼び出し・トークン予算内で返す。
 * 個別ツールの横断呼び出しと応答の往復を 1 回に束ね、予算超過・取得上限で
 * 落とした件数は `truncated` で必ず報告する（silent cap 禁止）。
 */

export interface GetPlanContextInput {
  target_paths: string[];
  /** 応答全体の概算トークン上限（既定 2000。概算は JSON 文字数 / 3・§7.8 と同一定義） */
  token_budget?: number;
}

export interface PlanFinding {
  id: string;
  severity: string;
  excerpt: string;
  target: string;
}

export interface PlanRecurringBug {
  package: string;
  category: string;
  count: number;
  last_committed_at: string;
  example: string;
}

export interface PlanDecision {
  id: string;
  display_name: string;
  summary: string;
}

export interface PlanConstraint {
  subject: string;
  predicate: 'must';
  object: string;
}

export interface PlanCochangePartner {
  file_path: string;
  count: number;
}

export interface PlanContextSections {
  unaddressed_findings: PlanFinding[];
  recurring_bugs: PlanRecurringBug[];
  decisions: PlanDecision[];
  constraints: PlanConstraint[];
  cochange_partners: PlanCochangePartner[];
}

export interface PlanContextResult extends PlanContextSections {
  truncated: { [section: string]: number };
}

export const DEFAULT_TOKEN_BUDGET = 2000;
const EXCERPT_MAX_CHARS = 200;
const SECTION_CAPS = {
  unaddressed_findings: 20,
  recurring_bugs: 20,
  decisions: 10,
  constraints: 10,
  cochange_partners: 15,
} as const;

/** §7.8 と同一定義のトークン概算（JSON 文字数 / 3） */
export function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 3);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** LIKE パターンへ埋め込むユーザー入力の % / _ / \ を無効化する（ESCAPE '\\' とペアで使う） */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** 取得時の件数上限（SECTION_CAPS）で落とした件数。truncated へ合算する（silent cap 禁止） */
export type SectionCapDrops = Partial<Record<keyof PlanContextSections, number>>;

/**
 * 重要度順（未対処指摘 → 再発バグ → 決定 → 制約 → 共変更）に予算へ詰める。
 * 純粋関数 — 収集結果と予算だけで出力が決まる。
 * `capDrops` は収集段の件数上限で既に落ちた分で、予算超過分と合算して報告する。
 */
export function packPlanContext(
  sections: PlanContextSections,
  tokenBudget: number,
  capDrops: SectionCapDrops = {},
): PlanContextResult {
  const order: Array<keyof PlanContextSections> = [
    'unaddressed_findings',
    'recurring_bugs',
    'decisions',
    'constraints',
    'cochange_partners',
  ];
  const result: PlanContextResult = {
    unaddressed_findings: [],
    recurring_bugs: [],
    decisions: [],
    constraints: [],
    cochange_partners: [],
    truncated: {},
  };
  let spent = 0;
  for (const section of order) {
    const items = sections[section];
    let dropped = capDrops[section] ?? 0;
    for (const item of items) {
      const cost = estimateTokens(item);
      if (spent + cost > tokenBudget) {
        dropped += 1;
        continue;
      }
      spent += cost;
      (result[section] as unknown[]).push(item);
    }
    if (dropped > 0) result.truncated[section] = dropped;
  }
  return result;
}

/** 対象パス（ファイルまたはディレクトリ）と JSON 配列要素の照合条件（完全一致 or ディレクトリ prefix） */
function jsonPathMatch(jsonColumn: string, count: number): string {
  const one = `EXISTS (SELECT 1 FROM json_each(${jsonColumn}) je WHERE je.value = ? OR je.value LIKE ? ESCAPE '\\')`;
  return Array.from({ length: count }, () => one).join(' OR ');
}

function jsonPathParams(targetPaths: string[]): string[] {
  return targetPaths.flatMap((p) => [p, `${escapeLike(p)}/%`]);
}

/** スカラー path 列との照合条件（完全一致 or ディレクトリ prefix） */
function scalarPathMatch(column: string, count: number): string {
  const one = `(${column} = ? OR ${column} LIKE ? ESCAPE '\\')`;
  return Array.from({ length: count }, () => one).join(' OR ');
}

/** 部分一致（エンティティ名・指摘 target のような表記ゆれのある列に使う。エスケープ済み） */
function containsMatch(column: string, count: number): string {
  return Array.from({ length: count }, () => `${column} LIKE ? ESCAPE '\\'`).join(' OR ');
}

function containsParams(targetPaths: string[]): string[] {
  return targetPaths.map((p) => `%${escapeLike(p)}%`);
}

function countScalar(db: CaravanDbConnection, sql: string, params: string[]): number {
  const rows = db.exec(sql, params);
  return Number(rows[0]?.values?.[0]?.[0] ?? 0);
}

/** 対象パスに一致する File エンティティ id を集める（決定・制約の起点） */
function collectFileEntityIds(db: CaravanDbConnection, targetPaths: string[]): string[] {
  const rows = db.exec(
    `SELECT id FROM caravan_entities
      WHERE type = 'File' AND valid_until IS NULL
        AND (${containsMatch('display_name', targetPaths.length)} OR ${containsMatch('canonical_name', targetPaths.length)})
      LIMIT 50`,
    [...containsParams(targetPaths), ...containsParams(targetPaths)],
  );
  return (rows[0]?.values ?? []).map((r) => r[0] as string);
}

export function collectPlanContext(
  db: CaravanDbConnection,
  targetPaths: string[],
): { sections: PlanContextSections; capDrops: SectionCapDrops } {
  const capDrops: SectionCapDrops = {};
  const noteCapDrop = (section: keyof PlanContextSections, total: number, kept: number) => {
    if (total > kept) capDrops[section] = total - kept;
  };

  // 1. 未対処レビュー指摘（target_file_path は表記ゆれがあるため部分一致・エスケープ済み）
  const findingWhere = `addressed_at IS NULL AND target_file_path IS NOT NULL
        AND (${containsMatch('target_file_path', targetPaths.length)})`;
  const findingRows = db.exec(
    `SELECT id, severity, finding_text, target_file_path
       FROM caravan_review_findings
      WHERE ${findingWhere}
      ORDER BY CASE severity WHEN 'error' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END, recorded_at DESC
      LIMIT ${SECTION_CAPS.unaddressed_findings}`,
    containsParams(targetPaths),
  );
  const unaddressedFindings: PlanFinding[] = (findingRows[0]?.values ?? []).map((r) => ({
    id: r[0] as string,
    severity: r[1] as string,
    excerpt: truncate(r[2] as string, EXCERPT_MAX_CHARS),
    target: (r[3] as string | null) ?? '',
  }));
  noteCapDrop(
    'unaddressed_findings',
    countScalar(db, `SELECT COUNT(*) FROM caravan_review_findings WHERE ${findingWhere}`, containsParams(targetPaths)),
    unaddressedFindings.length,
  );

  // 2. 再発バグ（package × category で集計。ファイル照合は json_each の完全一致 or dir prefix）
  const bugWhere = `(${jsonPathMatch('caravan_bug_fixes.affected_file_paths_json', targetPaths.length)})`;
  const bugRows = db.exec(
    `SELECT package, category, subject_summary, committed_at
       FROM caravan_bug_fixes
      WHERE ${bugWhere}
      ORDER BY committed_at DESC
      LIMIT 200`,
    jsonPathParams(targetPaths),
  );
  const bugGroups = new Map<string, PlanRecurringBug>();
  for (const r of bugRows[0]?.values ?? []) {
    const pkg = r[0] as string;
    const category = r[1] as string;
    const key = `${pkg}|${category}`;
    const existing = bugGroups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      bugGroups.set(key, {
        package: pkg,
        category,
        count: 1,
        last_committed_at: r[3] as string,
        example: truncate(r[2] as string, EXCERPT_MAX_CHARS),
      });
    }
  }
  const recurringBugs = [...bugGroups.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, SECTION_CAPS.recurring_bugs);
  noteCapDrop(
    'recurring_bugs',
    countScalar(
      db,
      `SELECT COUNT(*) FROM (SELECT 1 FROM caravan_bug_fixes WHERE ${bugWhere} GROUP BY package, category)`,
      jsonPathParams(targetPaths),
    ),
    recurringBugs.length,
  );

  // 3-4. 決定・制約（対象 File エンティティに接続されたもの）
  const fileIds = collectFileEntityIds(db, targetPaths);
  let decisions: PlanDecision[] = [];
  let constraints: PlanConstraint[] = [];
  if (fileIds.length > 0) {
    const ph = fileIds.map(() => '?').join(', ');
    const decisionRows = db.exec(
      `SELECT DISTINCT d.id, d.display_name, d.summary, MAX(e.valid_from) AS latest
         FROM caravan_edges e
         JOIN caravan_entities d
           ON d.id = CASE WHEN e.subject_entity_id IN (${ph}) THEN e.object_entity_id ELSE e.subject_entity_id END
        WHERE (e.subject_entity_id IN (${ph}) OR e.object_entity_id IN (${ph}))
          AND e.valid_to IS NULL AND d.type = 'Decision'
        GROUP BY d.id
        ORDER BY latest DESC
        LIMIT ${SECTION_CAPS.decisions}`,
      [...fileIds, ...fileIds, ...fileIds],
    );
    decisions = (decisionRows[0]?.values ?? []).map((r) => ({
      id: r[0] as string,
      display_name: r[1] as string,
      summary: truncate((r[2] as string | null) ?? '', EXCERPT_MAX_CHARS),
    }));
    noteCapDrop(
      'decisions',
      countScalar(
        db,
        `SELECT COUNT(DISTINCT d.id)
           FROM caravan_edges e
           JOIN caravan_entities d
             ON d.id = CASE WHEN e.subject_entity_id IN (${ph}) THEN e.object_entity_id ELSE e.subject_entity_id END
          WHERE (e.subject_entity_id IN (${ph}) OR e.object_entity_id IN (${ph}))
            AND e.valid_to IS NULL AND d.type = 'Decision'`,
        [...fileIds, ...fileIds, ...fileIds],
      ),
      decisions.length,
    );

    const constraintWhere = `e.predicate = 'must' AND e.valid_to IS NULL
          AND (e.subject_entity_id IN (${ph}) OR e.object_entity_id IN (${ph}))`;
    const constraintRows = db.exec(
      `SELECT sub.display_name, COALESCE(obj.display_name, e.object_literal, '') AS object_name
         FROM caravan_edges e
         LEFT JOIN caravan_entities sub ON sub.id = e.subject_entity_id
         LEFT JOIN caravan_entities obj ON obj.id = e.object_entity_id
        WHERE ${constraintWhere}
        ORDER BY e.valid_from DESC
        LIMIT ${SECTION_CAPS.constraints}`,
      [...fileIds, ...fileIds],
    );
    constraints = (constraintRows[0]?.values ?? []).map((r) => ({
      subject: (r[0] as string | null) ?? '',
      predicate: 'must' as const,
      object: (r[1] as string | null) ?? '',
    }));
    noteCapDrop(
      'constraints',
      countScalar(db, `SELECT COUNT(*) FROM caravan_edges e WHERE ${constraintWhere}`, [...fileIds, ...fileIds]),
      constraints.length,
    );
  }

  // 5. 共変更（attach 済み trail スキーマ。無い環境では空で縮退）
  let cochangePartners: PlanCochangePartner[] = [];
  try {
    const coWhere = `(${scalarPathMatch('f1.file_path', targetPaths.length)})`;
    const coRows = db.exec(
      `SELECT f2.file_path, COUNT(DISTINCT f2.commit_hash) AS c
         FROM trail.activity_commit_files f1
         JOIN trail.activity_commit_files f2
           ON f2.commit_hash = f1.commit_hash AND f2.repo_id = f1.repo_id AND f2.file_path != f1.file_path
        WHERE ${coWhere}
        GROUP BY f2.file_path
        ORDER BY c DESC
        LIMIT ${SECTION_CAPS.cochange_partners}`,
      jsonPathParams(targetPaths),
    );
    cochangePartners = (coRows[0]?.values ?? []).map((r) => ({
      file_path: r[0] as string,
      count: Number(r[1]),
    }));
    noteCapDrop(
      'cochange_partners',
      countScalar(
        db,
        `SELECT COUNT(DISTINCT f2.file_path)
           FROM trail.activity_commit_files f1
           JOIN trail.activity_commit_files f2
             ON f2.commit_hash = f1.commit_hash AND f2.repo_id = f1.repo_id AND f2.file_path != f1.file_path
          WHERE ${coWhere}`,
        jsonPathParams(targetPaths),
      ),
      cochangePartners.length,
    );
  } catch (err) {
    // trail 未 attach（単体 open の環境）。共変更は空で縮退し、他セクションは返す
    // eslint-disable-next-line no-console
    console.warn(
      `[${new Date().toISOString()}] [WARN] getPlanContext: cochange degraded (trail not attached): ${String(err)}`,
    );
  }

  return {
    sections: {
      unaddressed_findings: unaddressedFindings,
      recurring_bugs: recurringBugs,
      decisions,
      constraints,
      cochange_partners: cochangePartners,
    },
    capDrops,
  };
}

export function getPlanContext(db: CaravanDbConnection, input: GetPlanContextInput): PlanContextResult {
  if (input.target_paths.length === 0) {
    return {
      unaddressed_findings: [],
      recurring_bugs: [],
      decisions: [],
      constraints: [],
      cochange_partners: [],
      truncated: {},
    };
  }
  const { sections, capDrops } = collectPlanContext(db, input.target_paths);
  return packPlanContext(sections, input.token_budget ?? DEFAULT_TOKEN_BUDGET, capDrops);
}
