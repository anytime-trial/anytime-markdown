/**
 * 分析画面のメトリクスカードの外殻。
 *
 * 装飾（背景・枠・角丸）と寸法（flex・min-width・min-height）を **同一要素** へ載せる。
 * 過去に両者を別要素へ分散させたことで、二重枠（装飾が 2 要素に付いた）と高さ不揃い
 * （装飾を持つ要素に寸法が無く、中身ぶんの高さしか出ない）の回帰を起こしている。
 *
 * 寸法は行ごとに異なるため呼び出し側が渡す。ラッパー要素へ寸法を書いて内側へ装飾を
 * 付ける形に戻すと同じ不具合が再発するため、寸法は必ずこの関数経由で渡す。
 */

export interface CardShellSx {
  readonly bgcolor: string;
  readonly border: string;
  readonly borderRadius: string;
}

/** オーバービュー行（使用量＋DORA）の寸法。全カードで共通。 */
export const OVERVIEW_CARD_SIZING = [
  'flex:1 1 140px',
  'min-width:140px',
  'min-height:150px',
] as const;

/** セッションメトリクス行（使用量／生産性／品質の 3 枚）の寸法。 */
export const SESSION_METRIC_CARD_SIZING = [
  'flex:1 1 160px',
  'min-width:160px',
] as const;

/**
 * カードの可視要素へ外殻スタイルを適用する。
 *
 * @param el 装飾と寸法の両方を担う要素（行の直接の子）
 * @param cardSx テーマ由来の装飾値
 * @param sizing 行ごとの寸法（`OVERVIEW_CARD_SIZING` 等）
 * @param extra 呼び出し側固有の宣言（`text-align:center` / `cursor:pointer` など）。
 *   共通宣言の後ろに置かれるため、必要なら上書きできる。
 */
export function applyCardShell(
  el: HTMLElement,
  cardSx: CardShellSx,
  sizing: readonly string[],
  extra: readonly string[] = [],
): void {
  el.style.cssText = [
    `background-color:${cardSx.bgcolor}`,
    `border:${cardSx.border}`,
    `border-radius:${cardSx.borderRadius}`,
    'padding:16px',
    'display:flex',
    'flex-direction:column',
    'overflow:hidden',
    ...sizing,
    ...extra,
  ].join(';');
}
