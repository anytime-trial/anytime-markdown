/**
 * プラン指紋（共用 UI 優先 3・FR-11/12）。
 *
 * プランファイルを見出し節に分け、節ごとの本文ハッシュを caravan-book.db に記録する。
 * 着手前に現在のファイルと照合し、人間が書き換えた節（changed / removed / added）を返す。
 * 節の切り方は「見出し行から次の見出し（レベルを問わない）の直前まで」で、下位見出しは
 * 親に含めない（親と子の二重報告を避ける）。ハッシュは sha256（section-lock-core への
 * 依存を足さない。プラン照合はロックの指紋と互換である必要が無い）。
 */
import { createHash } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { CREATE_PLAN_SNAPSHOTS, CREATE_PLAN_SNAPSHOT_INDEXES } from '@anytime-markdown/trail-activity';

export interface PlanSectionFingerprint {
  /** 見出し行（`#` 付き・末尾空白除去） */
  readonly heading: string;
  /** 同一見出し行の出現順（1 始まり） */
  readonly occurrence: number;
  readonly hash: string;
}

export interface PlanSectionRef {
  readonly heading: string;
  readonly occurrence: number;
}

export interface PlanSnapshotRow {
  readonly id: number;
  readonly sessionId: string;
  readonly instructionId: string | null;
  readonly planPath: string;
  readonly sections: readonly PlanSectionFingerprint[];
  readonly recordedAt: string;
}

export interface PlanSectionDiff {
  readonly changed: PlanSectionRef[];
  readonly removed: PlanSectionRef[];
  readonly added: PlanSectionRef[];
  readonly unchanged: number;
}

const HEADING_RE = /^(#{1,6})\s+\S/;

function sha256(text: string): string {
  return 'sha256:' + createHash('sha256').update(text, 'utf8').digest('hex');
}

/** フェンス外の ATX 見出しで分割し、節ごとの指紋を返す。見出し前の前文は対象にしない。 */
/** 末尾の改行だけを落とす（`/\n+$/` は改行が並ぶ入力で二乗時間になるため走査で行う）。 */
function stripTrailingNewlines(text: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === '\n') end--;
  return text.slice(0, end);
}

export function fingerprintPlanSections(markdown: string): PlanSectionFingerprint[] {
  const lines = markdown.split('\n');
  const sections: Array<{ heading: string; body: string[] }> = [];
  let fence: { char: string; length: number } | null = null;
  for (const raw of lines) {
    const trimmed = raw.trim();
    const marker = /^(`{3,}|~{3,})/.exec(trimmed);
    if (fence !== null) {
      if (marker && marker[1].startsWith(fence.char) && marker[1].length >= fence.length) fence = null;
      sections.at(-1)?.body.push(raw);
      continue;
    }
    if (marker) {
      fence = { char: marker[1][0], length: marker[1].length };
      sections.at(-1)?.body.push(raw);
      continue;
    }
    if (HEADING_RE.test(raw)) {
      sections.push({ heading: raw.trimEnd(), body: [] });
      continue;
    }
    sections.at(-1)?.body.push(raw);
  }
  const counts = new Map<string, number>();
  return sections.map((section) => {
    const occurrence = (counts.get(section.heading) ?? 0) + 1;
    counts.set(section.heading, occurrence);
    const joined = section.body.map((line) => line.trimEnd()).join('\n');
    const normalized = stripTrailingNewlines(joined);
    return { heading: section.heading, occurrence, hash: sha256(normalized) };
  });
}

export function diffPlanSections(
  before: readonly PlanSectionFingerprint[],
  after: readonly PlanSectionFingerprint[],
): PlanSectionDiff {
  const key = (s: PlanSectionRef): string => `${s.occurrence}\u0000${s.heading}`;
  const beforeMap = new Map(before.map((s) => [key(s), s]));
  const afterMap = new Map(after.map((s) => [key(s), s]));
  const changed: PlanSectionRef[] = [];
  const removed: PlanSectionRef[] = [];
  const added: PlanSectionRef[] = [];
  let unchanged = 0;
  for (const [k, b] of beforeMap) {
    const a = afterMap.get(k);
    if (a === undefined) removed.push({ heading: b.heading, occurrence: b.occurrence });
    else if (a.hash !== b.hash) changed.push({ heading: b.heading, occurrence: b.occurrence });
    else unchanged += 1;
  }
  for (const [k, a] of afterMap) {
    if (!beforeMap.has(k)) added.push({ heading: a.heading, occurrence: a.occurrence });
  }
  return { changed, removed, added, unchanged };
}

export function ensurePlanSnapshotsTable(db: Database): void {
  db.exec(CREATE_PLAN_SNAPSHOTS);
  for (const idx of CREATE_PLAN_SNAPSHOT_INDEXES) db.exec(idx);
}

export function recordPlanSnapshotDirect(
  db: Database,
  input: {
    readonly sessionId: string;
    readonly instructionId: string | null;
    readonly planPath: string;
    readonly sections: readonly PlanSectionFingerprint[];
    readonly recordedAt?: string;
  },
): { id: number; recordedAt: string } {
  ensurePlanSnapshotsTable(db);
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO caravan_plan_snapshots (session_id, instruction_id, plan_path, sections_json, recorded_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(input.sessionId, input.instructionId, input.planPath, JSON.stringify(input.sections), recordedAt);
  return { id: Number(result.lastInsertRowid), recordedAt };
}

/**
 * 最新の記録。**ensure（CREATE TABLE）を呼ばない**: 照合は読み取り経路で、テーブル不在は
 * 「未記録」として null に縮退する（readonly 接続でも安全）。
 */
export function latestPlanSnapshotDirect(db: Database, planPath: string): PlanSnapshotRow | null {
  const exists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'caravan_plan_snapshots'`)
    .get() as { name: string } | undefined;
  if (exists === undefined) return null;
  const row = db
    .prepare(
      `SELECT id, session_id, instruction_id, plan_path, sections_json, recorded_at
         FROM caravan_plan_snapshots WHERE plan_path = ?
        ORDER BY recorded_at DESC, id DESC LIMIT 1`,
    )
    .get(planPath) as
    | { id: number; session_id: string; instruction_id: string | null; plan_path: string; sections_json: string; recorded_at: string }
    | undefined;
  if (row === undefined) return null;
  let sections: PlanSectionFingerprint[] = [];
  try {
    const parsed: unknown = JSON.parse(row.sections_json);
    if (Array.isArray(parsed)) sections = parsed as PlanSectionFingerprint[];
  } catch {
    // CHECK(json_valid) 済みのため実質到達しない。壊れていれば空（全節 added として現れる）
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    instructionId: row.instruction_id,
    planPath: row.plan_path,
    sections,
    recordedAt: row.recorded_at,
  };
}
