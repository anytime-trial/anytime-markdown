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
  /** 自動解決されていた drift が再検出され、未解決へ戻された件数。 */
  events_reopened: number;
  /**
   * 人手で解決された drift が再検出されたが、解決状態を維持した件数。
   *
   * 人の判断を機械が無言で取り消さないための抑止であって「検出されなかった」ではない。
   * 抑止したこと自体を数えないと、再検出が起き続けている事実が消える。
   */
  events_redetect_suppressed: number;
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

/** 人手解決を維持したまま再検出だけを刻む記録。 */
type RedetectionRecord = {
  redetected_at: string;
  /** 抑止の根拠になった解決理由（人手のメモ）。 */
  resolution_note: string;
};

/**
 * 履歴の保持上限。detail_json は行内 TEXT なので無制限追記は行を肥大させる。
 * 直近 10 サイクルあれば「再発しているか」の判断には足り、それ以前は古い方から落とす。
 */
const HISTORY_LIMIT = 10;

/**
 * auto-resolve が付ける resolution_note の接頭辞。これで始まる解決だけを reopen 対象にする。
 *
 * 由来を列で持たず接頭辞で判定するのは、`resolved_by` 列の追加が STRICT テーブルの
 * 再作成 migration を伴い、この修正の範囲を超えるため。
 * SHORTCUT: resolution_note の接頭辞で解決の由来を判定する. ceiling: 人が 'auto:' で始まる
 * メモを書くと reopen 対象に混ざる. upgrade: resolved_by 列を足すときに判定をそちらへ移す.
 */
const AUTO_RESOLVE_NOTE_PREFIX = 'auto:';

function isAutoResolved(resolutionNote: string): boolean {
  return resolutionNote.startsWith(AUTO_RESOLVE_NOTE_PREFIX);
}

function isRecordOf(value: unknown, keys: readonly string[]): boolean {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return keys.every((k) => typeof obj[k] === 'string');
}

/**
 * 既存 detail_json から履歴配列を読む。
 *
 * `detail_json` には CHECK (json_valid) があるので構文エラーは入らないが、`null` や配列など
 * **json_valid だがオブジェクトでない**値は入り得る。要素の形まで検査するのは、壊れた要素を
 * そのまま次世代へ再シリアライズして蓄積させないため。読めない場合は履歴だけ諦め、
 * 再検出の記録自体は落とさない。
 */
function readHistory<T>(
  detailJson: string,
  key: string,
  keys: readonly string[],
  eventId: string,
  logger: CaravanLogger,
): T[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(detailJson);
  } catch (err) {
    logger.error(
      `[reportDriftEvents] detail_json unreadable id=${eventId}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return [];
  }
  if (parsed === null || typeof parsed !== 'object') return [];
  const raw = (parsed as Record<string, unknown>)[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is T => isRecordOf(v, keys));
}

const REOPEN_KEYS = [
  'reopened_at',
  'previous_detected_at',
  'previous_resolved_at',
  'previous_resolution_note',
] as const;
const REDETECTION_KEYS = ['redetected_at', 'resolution_note'] as const;

/** reopen 履歴を 1 件積んだ detail_json を作る。 */
function buildReopenDetailJson(
  base: Record<string, unknown>,
  existing: KnownEvent,
  recordedAt: string,
  logger: CaravanLogger,
): string {
  const history = readHistory<ReopenRecord>(
    existing.detail_json,
    'reopen_history',
    REOPEN_KEYS,
    existing.id,
    logger,
  );
  const next = [
    ...history,
    {
      reopened_at: recordedAt,
      previous_detected_at: existing.detected_at,
      previous_resolved_at: existing.resolved_at ?? '',
      previous_resolution_note: existing.resolution_note,
    },
  ].slice(-HISTORY_LIMIT);
  return JSON.stringify({ ...base, reopen_history: next });
}

/**
 * 人手解決を維持したまま再検出だけを刻んだ detail_json を作る。
 *
 * base（今回の検出内容）で上書きせず既存の detail をそのまま保つのは、行の状態が
 * 「人が解決したと判断した時点」のままであるべきで、中身だけ今日の値に入れ替わると
 * 解決理由と表示内容が食い違うため。既存 detail が読めない場合は再検出の記録だけを持つ。
 */
function buildRedetectionDetailJson(
  existing: KnownEvent,
  recordedAt: string,
  logger: CaravanLogger,
): string {
  let base: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(existing.detail_json);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      base = parsed as Record<string, unknown>;
    }
  } catch (err) {
    logger.error(
      `[reportDriftEvents] detail_json unreadable id=${existing.id}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
  }
  const history = readHistory<RedetectionRecord>(
    existing.detail_json,
    'redetection_history',
    REDETECTION_KEYS,
    existing.id,
    logger,
  );
  const next = [
    ...history,
    { redetected_at: recordedAt, resolution_note: existing.resolution_note },
  ].slice(-HISTORY_LIMIT);
  return JSON.stringify({ ...base, redetection_history: next });
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
    events_redetect_suppressed: 0,
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
          logger.error(
            `[reportDriftEvents] auto-resolve failed id=${ev.id}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
          );
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

    const outcome = applyCandidate(db, existing, candidate, recordedAt, logger);
    if (outcome === null) continue;
    result[outcome]++;

    // 同一実行に同じ key の候補が 2 件現れても二重計上しないよう、スナップショットを進める。
    // 検出器が GROUP BY している限り重複は出ないが、resolveSubjectEntity が別々の生 ID を
    // 同じ正準 id へ畳む経路があるため構造上は起こり得る。
    knownByKey.set(key, {
      id: existing?.id ?? eventId(candidate.subject_entity_id, candidate.predicate, candidate.drift_type),
      subject_entity_id: candidate.subject_entity_id,
      predicate: candidate.predicate,
      drift_type: candidate.drift_type,
      resolved_at: outcome === 'events_redetect_suppressed' ? (existing?.resolved_at ?? null) : null,
      resolution_note: outcome === 'events_redetect_suppressed' ? (existing?.resolution_note ?? '') : '',
      detected_at: outcome === 'events_updated' ? (existing?.detected_at ?? recordedAt) : recordedAt,
      detail_json: '{}',
    });
  }

  return result;
}

/** {@link applyCandidate} が加算する ReportResult のキー。失敗時は null。 */
type ApplyOutcome =
  | 'events_inserted'
  | 'events_updated'
  | 'events_reopened'
  | 'events_redetect_suppressed';

/**
 * 候補 1 件を永続化する。既存行の状態で INSERT / UPDATE / REOPEN / 抑止を振り分ける。
 *
 * 分岐ごとに try/catch を閉じ込めてあるのは、呼び出し側のループを平坦に保つため
 * （3 分岐 × try/catch をインラインに置くと認知的複雑度が規約上限を超える）。
 */
function applyCandidate(
  db: CaravanDbConnection,
  existing: KnownEvent | undefined,
  candidate: DriftEventInput & { subject_entity_id: string },
  recordedAt: string,
  logger: CaravanLogger,
): ApplyOutcome | null {
  const detailBase = { ...candidate.detail, policy_version: 'phase4-v1' };
  const detailJson = JSON.stringify(detailBase);

  if (existing && existing.resolved_at !== null) {
    if (!isAutoResolved(existing.resolution_note)) {
      return suppressRedetection(db, existing, recordedAt, logger);
    }
    return reopenEvent(db, existing, candidate, detailBase, recordedAt, logger);
  }
  if (existing) {
    return updateEvent(db, existing, candidate, detailJson, logger);
  }
  return insertEvent(db, candidate, detailJson, recordedAt, logger);
}

/**
 * 人手で解決された drift の再検出。解決状態は維持し、再検出の事実だけを刻む。
 *
 * 自動で未解決へ戻すと、`resolve_drift` で人が入れた判断とメモがパイプラインの実行ごとに
 * 無言で取り消される。検出器の多くは履歴由来（コードを直しても集計窓が抜けるまで候補を
 * 出し続ける）なので、取り消しは毎回起きて `resolve_drift` が事実上の no-op になる。
 */
function suppressRedetection(
  db: CaravanDbConnection,
  existing: KnownEvent,
  recordedAt: string,
  logger: CaravanLogger,
): ApplyOutcome | null {
  try {
    db.run(`UPDATE caravan_drift_events SET detail_json = ? WHERE id = ?`, [
      buildRedetectionDetailJson(existing, recordedAt, logger),
      existing.id,
    ]);
    return 'events_redetect_suppressed';
  } catch (err) {
    logger.error(
      `[reportDriftEvents] redetection record failed id=${existing.id}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return null;
  }
}

/**
 * 自動解決されていた drift の再発。UNIQUE (subject, predicate, drift_type) があるため
 * 新規行は作れないので、同じ行を未解決へ戻す。前ライフサイクルは detail_json の
 * reopen_history に残すので初回検出時刻は失われない。
 *
 * detected_at を今回の検出時刻へ進めるのは、未解決期間の起点が「いま出ている drift が
 * いつから出ているか」だからで、解決済み期間を跨いだ日数を滞留として数えないため。
 * 値 3 列も更新するのは、進めた detected_at と前ライフサイクルの値が同じ行に同居すると
 * 「今日検出された行に数か月前の値が入っている」内部矛盾になるため。
 */
function reopenEvent(
  db: CaravanDbConnection,
  existing: KnownEvent,
  candidate: DriftEventInput,
  detailBase: Record<string, unknown>,
  recordedAt: string,
  logger: CaravanLogger,
): ApplyOutcome | null {
  try {
    db.run(
      `UPDATE caravan_drift_events
          SET resolved_at = NULL, resolution_note = '', detected_at = ?,
              conversation_value = ?, spec_value = ?, code_value = ?,
              severity = ?, detail_json = ?, workspace = COALESCE(NULLIF(?, ''), workspace)
        WHERE id = ?`,
      [
        recordedAt,
        candidate.conversation_value ?? null,
        candidate.spec_value ?? null,
        candidate.code_value ?? null,
        candidate.severity,
        buildReopenDetailJson(detailBase, existing, recordedAt, logger),
        candidate.workspace,
        existing.id,
      ],
    );
    return 'events_reopened';
  } catch (err) {
    logger.error(
      `[reportDriftEvents] reopen failed id=${existing.id}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return null;
  }
}

/**
 * 未解決のまま再検出された drift。severity・detail_json・workspace のみ更新し
 * detected_at は変えない（滞留期間の起点を保つ）。
 *
 * workspace を更新対象に含めるのは、列追加前に作られた既存行（'' のまま）が再検出で
 * 埋まるようにするため。ただし埋める方向にだけ効かせる: 候補側の '' は「今回は解決できなかった」
 * であって「未所属になった」ではない。無条件に書くと、activity.db が ATTACH されていない
 * 1 回の実行で解決済みの行が一斉に '' へ落ち、どのワークスペースで絞っても画面から消える。
 */
function updateEvent(
  db: CaravanDbConnection,
  existing: KnownEvent,
  candidate: DriftEventInput,
  detailJson: string,
  logger: CaravanLogger,
): ApplyOutcome | null {
  try {
    db.run(
      `UPDATE caravan_drift_events
          SET severity = ?, detail_json = ?, workspace = COALESCE(NULLIF(?, ''), workspace)
        WHERE id = ?`,
      [candidate.severity, detailJson, candidate.workspace, existing.id],
    );
    return 'events_updated';
  } catch (err) {
    logger.error(
      `[reportDriftEvents] update failed id=${existing.id}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return null;
  }
}

/**
 * 未知の key の新規 INSERT。既知の key は解決済みでも上の分岐が拾うためここへは来ない
 * （来ると UNIQUE 制約で必ず落ちる）。
 * subject entity は step 0 で正規化・確保済みなので FK は満たされる。
 */
function insertEvent(
  db: CaravanDbConnection,
  candidate: DriftEventInput & { subject_entity_id: string },
  detailJson: string,
  recordedAt: string,
  logger: CaravanLogger,
): ApplyOutcome | null {
  const key = driftKey(candidate.subject_entity_id, candidate.predicate, candidate.drift_type);
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
    return 'events_inserted';
  } catch (err) {
    logger.error(
      `[reportDriftEvents] insert failed ${key}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return null;
  }
}
