/**
 * 会話取込の対象範囲を決める SQL 条件。取込クエリと「未処理件数」を数えるクエリで
 * 同じ定義を使うためにここへ集約する（片方だけ変わると母数と処理数が食い違う）。
 */

/** trail.messages に付ける別名。SQL へ埋め込むため、呼び出し実態のリテラルだけを許す。 */
export type MessagesAlias = 'm';

const mainThreadOnly = (p: string): string => `${p}is_sidechain = 0`;

const humanInput = (p: string): string => `${p}type = 'user'`;

const hasText = (p: string): string => `TRIM(COALESCE(${p}text_content, ${p}user_content, '')) <> ''`;

/**
 * 会話取込の対象行。メインスレッドの **user 行だけ**（人間の入力だけ）。
 *
 * エージェントの応答を取り込まないのは、その内容が最終的にコード・ドキュメント・
 * コミットログへ落ちるためである（2026-08-06 ユーザー判断）。実測でも裏付けがある。
 *
 * - 保持エピソード 30,234 件のうち 25,163 件（83%）は人間の入力を 1 行も含まず、
 *   私の応答だけで構成されていた。会話由来エッジ 25,659 本のうち 21,311 本（83%）が
 *   そこから出ている。
 * - その 21,311 本はコード・バグ履歴由来のノードと **ほとんど接続していない**。
 *   File の一致は 178/7,802（2.3%）、Commit・Bug・Decision は 0 件。応答の本文が
 *   短縮 SHA や basename を使うため、正規化後の id が権威ソースと一致しない。
 * - Why の主供給源は既にコミットログ側にある（Decision エンティティは commit 由来
 *   3,940 件に対し会話由来 341 件）。
 *
 * サブエージェント（`is_sidechain = 1`）も同じ理由で落とす。子の往復は同じ
 * session_id で入っており is_sidechain でしか区別できない。**ただしレビュー取込
 * (`ingest/review/parseReviewSession.ts`) は sidechain を読む必要があるため、この
 * 条件を適用してはならない。** その不変条件は
 * `__tests__/ingest/review/parseReviewSession.test.ts` の「is_sidechain=1 の
 * code-reviewer メッセージから findings を取り込む」テストが検査している。
 *
 * **この条件は今後の取込にだけ効く。** 既に永続化済みのエージェント応答由来の
 * エピソードとエッジ（上記の 25,163 件 / 21,311 本）は `existingIds` による冪等
 * skip があるため再取込でも上書きされず、そのまま残る。削除は永続データの破棄に
 * あたるため人の判断で別途実施する。
 *
 * assistant / system 行を落とすと splitEpisodes のブロックは user 行 1 件ずつになり、
 * `message_uuid_start === message_uuid_end` になる。episode id は
 * `episodeId(session_id, message_uuid_start)` なので、既存エピソードの id は変わらず、
 * 再取込時は existingIds で冪等に skip される。
 */
export function ingestTargetSql(alias?: MessagesAlias): string {
  const prefix = alias ? `${alias}.` : '';
  return `${humanInput(prefix)} AND ${mainThreadOnly(prefix)}`;
}

/**
 * 「エピソードになり得る」メッセージに絞る条件。取込対象かつ本文が空でない。
 *
 * **件数を数えるクエリ専用**で、取込本体（readMessages）には使わない。
 * splitEpisodes はブロック境界を user 行の出現で決めるため、本文が空の user 行を
 * SQL 段階で落とすとブロックの切れ目がずれ、同じ会話に対して別 id のエピソードが
 * できてしまう。本文ゼロの除外は splitEpisodes 側（ブロック確定後）で行う。
 */
export function ingestableMessageSql(alias?: MessagesAlias): string {
  const prefix = alias ? `${alias}.` : '';
  return `${ingestTargetSql(alias)} AND ${hasText(prefix)}`;
}
