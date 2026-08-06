/**
 * 会話取込の対象範囲を決める SQL 条件。取込クエリと「未処理件数」を数えるクエリで
 * 同じ定義を使うためにここへ集約する（片方だけ変わると母数と処理数が食い違う）。
 */

/** trail.messages に付ける別名。SQL へ埋め込むため、呼び出し実態のリテラルだけを許す。 */
export type MessagesAlias = 'm';

const mainThreadOnly = (p: string): string => `${p}is_sidechain = 0`;

const hasText = (p: string): string => `TRIM(COALESCE(${p}text_content, ${p}user_content, '')) <> ''`;

/**
 * メインスレッドだけに絞る条件。
 *
 * trail.messages にはサブエージェント（Task/Agent ツールで起動した子）の往復も
 * 同じ session_id で入っており、`is_sidechain = 1` でのみ区別できる。2026-08-06
 * 実測で assistant 556,431 件中 155,195 件・user 352,212 件中 107,222 件が
 * sidechain だった。これを知識グラフへ入れると、エピソードの 34.5%・会話由来
 * エッジの 31.4% を占めながら、専有して供給するエンティティ 5,919 件の 77% が
 * File / Commit / Bug / Task の言及ノートで、Decision は 14 件・Rule は 25 件
 * しかなかった。判断はメインスレッドで下るため、調査の中間過程は取り込まない。
 *
 * 除外してよい根拠として、価値が確立している経路は別系統で守られている:
 * code-reviewer subagent の findings は review_session_incremental が
 * `ingest/review/parseReviewSession.ts` 経由で memory_reviews へ入れる。
 * **そちらは sidechain を読む必要があるため、この条件を適用してはならない。**
 * その不変条件は `__tests__/ingest/review/parseReviewSession.test.ts` の
 * 「is_sidechain=1 の code-reviewer メッセージから findings を取り込む」テストが
 * 検査している（コメントだけに頼らない）。
 */
export function mainThreadOnlySql(alias?: MessagesAlias): string {
  return mainThreadOnly(alias ? `${alias}.` : '');
}

/**
 * 「エピソードになり得る」メッセージに絞る条件。メインスレッドかつ本文が空でない。
 *
 * **件数を数えるクエリ専用**で、取込本体（readMessages）には使わない。
 * splitEpisodes はブロック境界を user 行の出現で決めるため、本文が空の user 行を
 * SQL 段階で落とすとブロックの切れ目がずれ、同じ会話に対して別 id のエピソードが
 * できてしまう。本文ゼロの除外は splitEpisodes 側（ブロック確定後）で行う。
 */
export function ingestableMessageSql(alias?: MessagesAlias): string {
  const prefix = alias ? `${alias}.` : '';
  return `${mainThreadOnly(prefix)} AND ${hasText(prefix)}`;
}
