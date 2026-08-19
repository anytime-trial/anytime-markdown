/**
 * 外部キー違反（参照先が実在しない行）を数える／修復する保守処理。
 *
 * FK 強制は**接続単位**の pragma で、通常経路（`db/connection.ts` の `openCaravanBookDb`）は
 * `PRAGMA foreign_keys = ON` を張る。したがって通常の INSERT では違反行は作れない。
 * 混入し得るのは次の 2 経路に限られる（今回の 163 件がどちらから来たかは**未特定**）。
 *
 * - 12-step rebuild マイグレーションの `foreign_keys = OFF` 区間（004 / 006 / 007 / 011 /
 *   012 / 013 / 014 / 021 / 023）。`caravan_entities` を作り直す途中で再投入に失敗すると、
 *   参照元だけが残る
 * - pragma を張らない外部接続（`sqlite3` CLI の既定は OFF。pragma はファイルに永続しない）
 *
 * 実測（2026-08-17）で 163 件あり、内訳は次の 2 種類だった。
 *
 * - `caravan_reviews.review_entity_id` → `caravan_entities` 不在: 162 件
 *   （2026-06-20〜2026-08-05 に記録された行。本文 1.5〜2.6KB を持つ実体のあるレビューで、
 *    グラフ側のノードだけが失われていた。`caravan_entities` を失う障害の巻き添えと見られる）
 * - `caravan_bug_fixes.root_cause_episode_id` → `caravan_episodes` 不在: 1 件
 *
 * 修復方針は種類ごとに違う。
 *
 * - Review エンティティは **決定的に再生成できる**。id は `entityId('Review', source_ref)` で
 *   決まり、実測で 162 件すべてが保存済みの `review_entity_id` と一致した。同じ
 *   `canonical_name` を別 id で占有しているエンティティも 0 件だったので、取込経路
 *   （`upsertReviewSession` / `upsertReviewDoc`）が入れるはずだった行をそのまま復元できる。
 *   情報を捏造しないため、`display_name` は取込経路が同じ値を書いている `caravan_reviews.title`
 *   を使う。
 * - バグ修正の根本原因リンクは **復元できない**（指す先のエピソードが消えている）ので
 *   NULL にする。行そのものは自ワークスペースの記録なので消さない。恒久的な損失にはならず、
 *   対象エピソードが将来取り込まれれば `linkRootCauseEpisode` の `relinkNullRootCauseEpisodes`
 *   が増分取込のたびに NULL 行を拾い直す。
 *
 * 数える関数と直す関数を分けるのは purge 系と同じ理由（書き込み前に人へ件数を出すため）。
 */

import { entityId } from '../canonical/entityId';
import type { CaravanDbConnection } from '../db/connection/types';
import { noopLogger, type CaravanLogger } from '../logger';

export interface DanglingReferenceCounts {
  /** 参照先の `caravan_entities` が無い `caravan_reviews` 行。再生成で直す。 */
  missingReviewEntities: number;
  /**
   * うち `review_entity_id` が `entityId('Review', source_ref)` と一致しない行。
   * 一致しないものは決定的に復元できないため **再生成の対象外**。0 でない間は
   * 再生成だけでは違反が残る。
   */
  unreconstructableReviewEntities: number;
  /** 参照先の `caravan_episodes` が無い `caravan_bug_fixes.root_cause_episode_id`。NULL 化で直す。 */
  danglingBugFixEpisodeLinks: number;
  /**
   * `PRAGMA foreign_key_check` の総件数。
   *
   * 本モジュールが直せるのは上の 2 種類だけで、`ON DELETE` 指定を持たない FK は他にもある
   * （`caravan_bug_fixes.bug_entity_id` / `caravan_spec_doc_entities.entity_id` /
   * `caravan_drift_events.subject_entity_id` / `caravan_review_runs.review_id`）。
   * 総件数を併記しないと、**数えていない種別が「0 件」として表示される**（最も危険な形）。
   */
  totalForeignKeyViolations: number;
}

export interface RepairDanglingReferencesInput {
  db: CaravanDbConnection;
  logger?: CaravanLogger;
}

/**
 * 再生成できる Review エンティティの候補。
 *
 * `entityId('Review', source_ref)` は SHA-1 の先頭 16 桁なので SQL では計算できない。
 * 代わりに「レビュー行が保持している id をそのまま使う」形にし、その id が本当に
 * 導出値と一致するかは呼び出し側（`reconstructableReviewRows`）で検査する。
 */
const MISSING_REVIEW_ENTITY_ROWS_SQL = `
  SELECT rv.id AS review_id, rv.source_ref, rv.review_entity_id, rv.title, rv.recorded_at
    FROM caravan_reviews rv
   WHERE NOT EXISTS (SELECT 1 FROM caravan_entities e WHERE e.id = rv.review_entity_id)`;

const DANGLING_BUGFIX_LINKS_SQL = `
  SELECT COUNT(*) FROM caravan_bug_fixes b
   WHERE b.root_cause_episode_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM caravan_episodes e WHERE e.id = b.root_cause_episode_id)`;

interface MissingReviewEntityRow {
  reviewId: string;
  sourceRef: string;
  entityId: string;
  title: string;
  recordedAt: string;
}

function readMissingReviewEntityRows(db: CaravanDbConnection): MissingReviewEntityRow[] {
  const rows = db.exec(MISSING_REVIEW_ENTITY_ROWS_SQL);
  return (rows[0]?.values ?? []).map((r) => ({
    reviewId: r[0] as string,
    sourceRef: r[1] as string,
    entityId: r[2] as string,
    title: r[3] as string,
    recordedAt: r[4] as string,
  }));
}

/**
 * 保存済み id が導出値と一致する行だけを返す。
 *
 * 一致しない行を復元すると、取込経路が次に作る id と食い違う二重ノードになる
 * （`caravan_entities` の UNIQUE(type, canonical_name) にも触れる）。復元できないものは
 * 数えるだけにして人の判断へ回す。
 */
export function splitReconstructableReviewRows(
  rows: readonly MissingReviewEntityRow[],
): { reconstructable: MissingReviewEntityRow[]; unreconstructable: MissingReviewEntityRow[] } {
  const reconstructable: MissingReviewEntityRow[] = [];
  const unreconstructable: MissingReviewEntityRow[] = [];
  for (const row of rows) {
    if (entityId('Review', row.sourceRef) === row.entityId) reconstructable.push(row);
    else unreconstructable.push(row);
  }
  return { reconstructable, unreconstructable };
}

function scalar(db: CaravanDbConnection, sql: string): number {
  const rows = db.exec(sql);
  return (rows[0]?.values?.[0]?.[0] as number | undefined) ?? 0;
}

/**
 * 本モジュールが**修復できる**種別を数え、併せて `foreign_key_check` の総件数を返す。
 * 書き込みはしない。
 */
export function countRepairableDanglingReferences(
  db: CaravanDbConnection,
): DanglingReferenceCounts {
  const missing = readMissingReviewEntityRows(db);
  const { unreconstructable } = splitReconstructableReviewRows(missing);
  return {
    missingReviewEntities: missing.length,
    unreconstructableReviewEntities: unreconstructable.length,
    danglingBugFixEpisodeLinks: scalar(db, DANGLING_BUGFIX_LINKS_SQL),
    totalForeignKeyViolations: countForeignKeyViolations(db),
  };
}

/**
 * `PRAGMA foreign_key_check` の違反件数。
 *
 * 本番規模（380MB / 45k エンティティ）で実測 55ms なので、パイプライン実行のたびに
 * 呼んでも支障がない。
 */
export function countForeignKeyViolations(db: CaravanDbConnection): number {
  return db.exec('PRAGMA foreign_key_check')[0]?.values?.length ?? 0;
}

/**
 * 外部キー違反を修復する。
 *
 * - 失われた Review エンティティを、レビュー行が持つ id・`source_ref`・`title` から再生成する
 *   （導出 id と一致する行のみ）
 * - 復元不能なバグ修正の根本原因リンクを NULL にする
 *
 * 全体を 1 トランザクションで囲む。途中で落ちると「一部だけ直った」状態が残り、
 * 次回の件数提示が実態とずれるため。
 *
 * `caravan_entities` を増やすので、呼び出し側は contentless FTS5 索引の作り直しが必要
 * （`rebuildContentlessFtsIndexes`）。
 */
export function unsafeRepairDanglingReferences(
  input: RepairDanglingReferencesInput,
): DanglingReferenceCounts & { repairedReviewEntities: number; nulledBugFixLinks: number } {
  const { db } = input;
  const logger = input.logger ?? noopLogger;

  const missing = readMissingReviewEntityRows(db);
  const { reconstructable, unreconstructable } = splitReconstructableReviewRows(missing);

  let repairedReviewEntities = 0;
  let nulledBugFixLinks = 0;

  db.run('BEGIN IMMEDIATE');
  try {
    for (const row of reconstructable) {
      // INSERT OR IGNORE は取込経路 (upsertReviewSession / upsertReviewDoc) と同じ。
      // 握り潰しは直後の assert で検知するので、ここでは無視で先へ進む。
      db.run(
        `INSERT OR IGNORE INTO caravan_entities
           (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
            first_seen_at, last_updated_at, recorded_at)
         VALUES (?, 'Review', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
        [row.entityId, row.sourceRef, row.title, row.recordedAt, row.recordedAt, row.recordedAt],
      );
      repairedReviewEntities += db.getRowsModified();
    }

    // INSERT OR IGNORE は UNIQUE だけでなく CHECK 違反・STRICT 型違反も**行ごと黙って捨てる**。
    // 捨てられると getRowsModified() が 0 を返し、違反が残ったまま「成功」に見える。
    // 投入件数を assert してから結果を語る（横断制約: INSERT OR IGNORE は黙って捨てる）。
    if (repairedReviewEntities !== reconstructable.length) {
      throw new Error(
        `[anytime-memory] repairDanglingReferences: INSERT OR IGNORE が ` +
          `${reconstructable.length - repairedReviewEntities} 件を握り潰した ` +
          `(reconstructable=${reconstructable.length} inserted=${repairedReviewEntities})`,
      );
    }

    db.run(
      `UPDATE caravan_bug_fixes SET root_cause_episode_id = NULL
        WHERE root_cause_episode_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM caravan_episodes e WHERE e.id = root_cause_episode_id)`,
    );
    nulledBugFixLinks = db.getRowsModified();
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }

  logger.info(
    `[anytime-memory] repairDanglingReferences: review_entities=${repairedReviewEntities} ` +
      `bug_fix_links_nulled=${nulledBugFixLinks} ` +
      `(復元できず残した Review エンティティ=${unreconstructable.length}。` +
      `caravan_entities を増やしたので FTS 索引の作り直しが必要)`,
  );

  return {
    missingReviewEntities: missing.length,
    unreconstructableReviewEntities: unreconstructable.length,
    danglingBugFixEpisodeLinks: nulledBugFixLinks,
    totalForeignKeyViolations: countForeignKeyViolations(db),
    repairedReviewEntities,
    nulledBugFixLinks,
  };
}
