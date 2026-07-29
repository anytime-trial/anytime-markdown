/** 右サイドパネルのタブ。表示順に並べる。 */
export const COOC_TAB_IDS = ['filter', 'edit', 'minimap', 'export'] as const;

export type CooccurrenceTabId = (typeof COOC_TAB_IDS)[number];

/**
 * tabpanel の DOM id。
 *
 * tab ボタン側の id（{@link tabElementId}）と対で使う。両者を別々の場所で組み立てると、
 * 片方の規約を変えたときに aria-controls / aria-labelledby の参照だけが無言で切れる。
 */
export function tabPanelElementId(id: CooccurrenceTabId): string {
  return `cooc-panel-${id}`;
}

/** tab ボタンの DOM id。tabpanel の `aria-labelledby` が指す先。 */
export function tabElementId(panelId: string): string {
  return `${panelId}-tab`;
}

/**
 * キー入力に対する次のタブを返す。選択を動かさないキーは null を返す。
 *
 * `displayedIds` は今そこにあるタブだけを表示順に並べたもの。ホストが保存も PNG も
 * 提供しない場合は保存タブを出さないため（仕様 §3.5・§6.3）、巡回対象は
 * {@link COOC_TAB_IDS} と一致しない。
 *
 * Why not `displayedIds` を省略可能にして既定を全タブにするか: 呼び出し側が渡し忘れても
 * 動いてしまい、存在しないタブを選ぶ状態が無言で戻る。省略できない引数にして、
 * 表示集合を変えた箇所が必ず型で止まるようにする。
 *
 * Why not キー処理を DOM 側へ直接書くか: 折り返しと Home/End の境界は取り違えやすく、
 * DOM の中に埋めると jsdom のキーイベント経由でしか検査できない。境界だけを純関数に
 * 出して固定する。
 */
export function nextTabId(
  current: CooccurrenceTabId,
  key: string,
  displayedIds: readonly CooccurrenceTabId[],
): CooccurrenceTabId | null {
  const last = displayedIds.length - 1;
  if (last < 0) return null;
  const index = displayedIds.indexOf(current);
  // 選択中のタブが消えた直後。動かさないと、どのキーを押しても反応しない状態が残る。
  if (index < 0) return displayedIds[0] ?? null;
  switch (key) {
    case 'ArrowRight':
      return displayedIds[index === last ? 0 : index + 1] ?? null;
    case 'ArrowLeft':
      return displayedIds[index === 0 ? last : index - 1] ?? null;
    case 'Home':
      return displayedIds[0] ?? null;
    case 'End':
      return displayedIds[last] ?? null;
    default:
      return null;
  }
}
