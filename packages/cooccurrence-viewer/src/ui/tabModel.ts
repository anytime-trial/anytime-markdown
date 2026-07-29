/** 右サイドパネルのタブ。表示順に並べる。 */
export const COOC_TAB_IDS = ['filter', 'edit'] as const;

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
 * Why not キー処理を DOM 側へ直接書くか: 折り返しと Home/End の境界は取り違えやすく、
 * DOM の中に埋めると jsdom のキーイベント経由でしか検査できない。境界だけを純関数に
 * 出して固定する。
 */
export function nextTabId(current: CooccurrenceTabId, key: string): CooccurrenceTabId | null {
  const index = COOC_TAB_IDS.indexOf(current);
  const last = COOC_TAB_IDS.length - 1;
  switch (key) {
    case 'ArrowRight':
      return COOC_TAB_IDS[index === last ? 0 : index + 1] ?? null;
    case 'ArrowLeft':
      return COOC_TAB_IDS[index === 0 ? last : index - 1] ?? null;
    case 'Home':
      return COOC_TAB_IDS[0] ?? null;
    case 'End':
      return COOC_TAB_IDS[last] ?? null;
    default:
      return null;
  }
}
