import type { CaravanDbConnection } from '../db/connection/types';
import type { CaravanLogger } from '../logger';
import type { DriftType, Severity } from './policy';
import { entityId } from '../canonical/entityId';
import { canonicalize } from '../canonical/canonicalize';

export type DriftEventInput = {
  subject_entity_id: string;
  predicate: string;
  conversation_value: string | null;
  spec_value: string | null;
  code_value: string | null;
  drift_type: DriftType;
  severity: Severity;
  /**
   * 出所ワークスペースの repo_name。'' は未解決（推測で埋めない）。
   *
   * optional にしないのは、渡し忘れが「黙って全ワークスペース横断の行になる」形で
   * 縮退するため。値を持たない検出器も `''` を明示して、未解決であることを宣言する。
   */
  workspace: string;
  detail: Record<string, unknown>;
};

type ReportResult = {
  events_inserted: number;
  events_updated: number;
  events_resolved: number;
  /** 解決済みだった drift が再検出され、未解決へ戻された件数。 */
  events_reopened: number;
};

type KnownEvent = {
  id: string;
  subject_entity_id: string;
  predicate: string;
  drift_type: string;
  /** null なら未解決。解決済み行は再検出で reopen する。 */
  resolved_at: string | null;
  resolution_note: string;
  detected_at: string;
  detail_json: string;
};

/** reopen 時に detail_json へ積む前ライフサイクルの記録。 */
type ReopenRecord = {
  reopened_at: string;
  previous_detected_at: string;
  previous_resolved_at: string;
  previous_resolution_note: string;
};

/**
 * 再発の履歴上限。detail_json は行内 TEXT なので無制限追記は行を肥大させる。
 * 直近 10 サイクルあれば「再発しているか」の判断には足り、それ以前は古い方から落とす。
 */
const REOPEN_HISTORY_LIMIT = 10;

/**
 * reopen 履歴を積んだ detail_json を作る。
 * 既存 detail_json が壊れていても再発の記録自体は落とさない（履歴だけ諦める）。
 */
function buildReopenDetailJson(
  base: Record<string, unknown>,
  existing: KnownEvent,
  recordedAt: string,
  logger: CaravanLogger,
): string {
  let history: ReopenRecord[] = [];
  try {
    const prev = JSON.parse(existing.detail_json) as { reopen_history?: ReopenRecord[] };
    if (Array.isArray(prev.reopen_history)) {
      history = prev.reopen_history;
    }
  } catch (err) {
    logger.error(
      `[reportDriftEvents] reopen history unreadable id=${existing.id}: ${String(err)}`,
    );
  }
  history = [
    ...history,
    {
      reopened_at: recordedAt,
      previous_detected_at: existing.detected_at,
      previous_resolved_at: existing.resolved_at ?? '',
      previous_resolution_note: existing.resolution_note,
    },
  ].slice(-REOPEN_HISTORY_LIMIT);
  return JSON.stringify({ ...base, reopen_history: history });
}

function driftKey(subjectId: string, predicate: string, driftType: string): string {
  return `${subjectId}:${predicate}:${driftType}`;
}

function eventId(subjectId: string, predicate: string, driftType: string): string {
  return `drift:${subjectId}:${predicate}:${driftType}`;
}

function ensureEntity(
  db: CaravanDbConnection,
  id: string,
  type: string,
  canonicalName: string,
  displayName: string,
  recordedAt: string,
): void {
  db.run(
    `INSERT OR IGNORE INTO caravan_entities
       (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
    [id, type, canonicalName, displayName, recordedAt, recordedAt, recordedAt],
  );
}

/**
 * drift candidate の subject_entity_id を **正準 entity id** へ解決し、FK を満たすため
 * 対応する caravan_entities 行を冪等に確保して、解決後の id を返す。
 *
 * 一部の検出器は `file:<path>` / `package:<name>` / `spec_clarification:<key>` 等の合成 ID を
 * subject にする。caravan_drift_events.subject_entity_id は caravan_entities(id) への FK を持つため、
 * これを実 entity に写像しないと FK 違反で INSERT が silent に欠落していた（regression_cluster 等が
 * 常に 0 件だった真因）。さらに caravan_entities は UNIQUE(type, canonical_name) を持つので、合成 ID を
 * 生パスのまま canonical_name にすると既存の実 File entity（canonical_name=canonicalize(path)）と衝突し、
 * INSERT OR IGNORE が黙ってスキップして FK 違反が再発する。
 *
 * 対策:
 * - `file:`/`package:` は ingest 側と同じ `entityId(type, canonicalize(name))` で正準 id を算出し、
 *   既存の実 File/Package entity に**連結**する（無ければ正準スキームで作成）。
 * - `spec_clarification:` は対応する実 entity が無いので、接頭辞付き id をそのまま Question entity として
 *   確保する（canonical_name も接頭辞付きで実 Question と衝突しない）。
 * - 接頭辞無し（review_unfixed 等の実 entity id）はそのまま返す（既存なら no-op）。
 */
function resolveSubjectEntity(db: CaravanDbConnection, subjectId: string, recordedAt: string): string {
  if (subjectId.startsWith('file:')) {
    const path = subjectId.slice('file:'.length);
    const canon = canonicalize(path);
    const id = entityId('File', canon);
    ensureEntity(db, id, 'File', canon, path, recordedAt);
    return id;
  }
  if (subjectId.startsWith('package:')) {
    const pkg = subjectId.slice('package:'.length);
    const canon = canonicalize(pkg);
    const id = entityId('Package', canon);
    ensureEntity(db, id, 'Package', canon, pkg, recordedAt);
    return id;
  }
  if (subjectId.startsWith('spec_clarification:')) {
    ensureEntity(db, subjectId, 'Question', subjectId, subjectId.slice('spec_clarification:'.length), recordedAt);
    return subjectId;
  }
  // 接頭辞無し = 実 entity id（既存なら no-op。念のため不在時は Concept stub で FK を満たす）。
  ensureEntity(db, subjectId, 'Concept', subjectId, subjectId, recordedAt);
  return subjectId;
}

export function reportDriftEvents(input: {
  db: CaravanDbConnection;
  candidates: DriftEventInput[];
  recordedAt: string;
  autoResolveStale?: boolean;
  logger: CaravanLogger;
}): ReportResult {
  const { db, candidates, recordedAt, autoResolveStale = true, logger } = input;

  const result: ReportResult = {
    events_inserted: 0,
    events_updated: 0,
    events_resolved: 0,
    events_reopened: 0,
  };

  // 0. subject_entity_id を正準 entity id へ正規化し、FK 用に entity を確保する。
  //    以降の key 計算・突合・INSERT はすべて正規化後の id で行う。
  const normalizedCandidates = candidates.map((c) => ({
    ...c,
    subject_entity_id: resolveSubjectEntity(db, c.subject_entity_id, recordedAt),
  }));

  // 1. 既存の drift events を取得（解決済みも含む）
  //
  // 解決済みを除くと、一度 resolve した key は「既存なし」と判定されて INSERT へ回り、
  // UNIQUE (subject_entity_id, predicate, drift_type) に阻まれて例外になる。例外は
  // catch されてログに落ちるだけなので、**再発した drift が恒久的に記録されなくなる**。
  // auto-resolve が対象にするのは未解決行だけなので、そちらは下で絞り直す。
  const rows = db.exec(
    `SELECT id, subject_entity_id, predicate, drift_type, resolved_at, resolution_note,
            detected_at, detail_json
       FROM caravan_drift_events`,
  );
  const knownEvents: KnownEvent[] = (rows[0]?.values ?? []).map((r) => ({
    id: r[0] as string,
    subject_entity_id: r[1] as string,
    predicate: r[2] as string,
    drift_type: r[3] as string,
    resolved_at: r[4] == null ? null : String(r[4]),
    resolution_note: r[5] == null ? '' : String(r[5]),
    detected_at: r[6] == null ? '' : String(r[6]),
    detail_json: r[7] == null ? '{}' : String(r[7]),
  }));
  const activeEvents: KnownEvent[] = knownEvents.filter((ev) => ev.resolved_at === null);

  // 2. 候補を Set 化
  const candidateKeys = new Set(
    normalizedCandidates.map((c) => driftKey(c.subject_entity_id, c.predicate, c.drift_type)),
  );

  // 3. auto-resolve: 候補に含まれなくなった既存 event
  if (autoResolveStale) {
    for (const ev of activeEvents) {
      const key = driftKey(ev.subject_entity_id, ev.predicate, ev.drift_type);
      if (!candidateKeys.has(key)) {
        try {
          db.run(
            `UPDATE caravan_drift_events
             SET resolved_at = ?, resolution_note = 'auto: drift no longer present'
             WHERE id = ?`,
            [recordedAt, ev.id],
          );
          result.events_resolved++;
        } catch (err) {
          logger.error(`[reportDriftEvents] auto-resolve failed id=${ev.id}: ${String(err)}`);
        }
      }
    }
  }

  // 4. 候補を upsert（SELECT → UPDATE / REOPEN / INSERT）
  const knownByKey = new Map<string, KnownEvent>();
  for (const ev of knownEvents) {
    knownByKey.set(driftKey(ev.subject_entity_id, ev.predicate, ev.drift_type), ev);
  }

  for (const candidate of normalizedCandidates) {
    const key = driftKey(candidate.subject_entity_id, candidate.predicate, candidate.drift_type);
    const existing = knownByKey.get(key);
    const detailBase = { ...candidate.detail, policy_version: 'phase4-v1' };
    const detailJson = JSON.stringify(detailBase);

    if (existing && existing.resolved_at !== null) {
      // 解決済みの drift が再発した。UNIQUE (subject, predicate, drift_type) があるため
      // 新規行は作れない。同じ行を未解決へ戻し、前ライフサイクルは detail_json の
      // reopen_history に残す（初回検出時刻を失わないため）。
      // detected_at を今回の検出時刻へ進めるのは、未解決期間の起点が「いま出ている drift が
      // いつから出ているか」だからで、解決済み期間を跨いだ日数を滞留として数えないため。
      try {
        db.run(
          `UPDATE caravan_drift_events
              SET resolved_at = NULL, resolution_note = '', detected_at = ?,
                  severity = ?, detail_json = ?, workspace = COALESCE(NULLIF(?, ''), workspace)
            WHERE id = ?`,
          [
            recordedAt,
            candidate.severity,
            buildReopenDetailJson(detailBase, existing, recordedAt, logger),
            candidate.workspace,
            existing.id,
          ],
        );
        result.events_reopened++;
      } catch (err) {
        logger.error(
          `[reportDriftEvents] reopen failed id=${existing.id}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
        );
      }
    } else if (existing) {
      // severity・detail_json・workspace のみ更新（detected_at は変えない）。
      // workspace を更新対象に含めるのは、列追加前に作られた既存行（'' のまま）が
      // 再検出で埋まるようにするため。ただし埋める方向にだけ効かせる:
      // 候補側の '' は「今回は解決できなかった」であって「未所属になった」ではない。
      // 無条件に書くと、activity.db が ATTACH されていない 1 回の実行で解決済みの行が
      // 一斉に '' へ落ち、どのワークスペースで絞っても画面から消える。
      try {
        db.run(
          `UPDATE caravan_drift_events
              SET severity = ?, detail_json = ?, workspace = COALESCE(NULLIF(?, ''), workspace)
            WHERE id = ?`,
          [candidate.severity, detailJson, candidate.workspace, existing.id],
        );
        result.events_updated++;
      } catch (err) {
        logger.error(`[reportDriftEvents] update failed id=${existing.id}: ${String(err)}`);
      }
    } else {
      // 未知の key のみ新規 INSERT。既知の key は解決済みでも上の reopen 分岐が拾うため、
      // ここへは来ない（来ると UNIQUE 制約で必ず落ちる）。
      // subject entity は step 0 で正規化・確保済みなので FK は満たされる。
      try {
        db.run(
          `INSERT INTO caravan_drift_events
             (id, subject_entity_id, predicate, conversation_value, spec_value, code_value,
              drift_type, severity, detected_at, detail_json, workspace)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            eventId(candidate.subject_entity_id, candidate.predicate, candidate.drift_type),
            candidate.subject_entity_id,
            candidate.predicate,
            candidate.conversation_value ?? null,
            candidate.spec_value ?? null,
            candidate.code_value ?? null,
            candidate.drift_type,
            candidate.severity,
            recordedAt,
            detailJson,
            candidate.workspace,
          ],
        );
        result.events_inserted++;
      } catch (err) {
        logger.error(
          `[reportDriftEvents] insert failed ${key}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
        );
      }
    }
  }

  return result;
}
