import { nextTabId, tabElementId, type CooccurrenceTabId } from './tabModel';
import { createPanelButton, ensureButtonBaseStyles } from './buttonBaseStyle';

export interface SideIconRailItem {
  /** タブの識別子。 */
  readonly id: CooccurrenceTabId;
  /** 操作名（i18n 済み）。図柄だけのボタンの `aria-label` と tooltip に使う。 */
  readonly label: string;
  /** 対応する tabpanel の id 属性。aria-controls で結ぶ。 */
  readonly panelId: string;
  /**
   * 一時的に押せないタブ（例: OZ 3D 中のミニマップ）。
   *
   * Why not 並びから外すか: 消えると「どこへ行ったのか」が読めない。無効の見た目と
   * 理由（tooltip）を残し、条件が戻れば同じ場所で復帰する。
   */
  readonly disabled?: boolean;
  /** 無効の理由（i18n 済み）。tooltip に出す。 */
  readonly disabledReason?: string;
}

export interface SideIconRailState {
  readonly items: readonly SideIconRailItem[];
  /** 編集モードが入っているか。押下状態として見せる。 */
  readonly editMode: boolean;
  /** 編集モードのトグルの名前（i18n 済み）。 */
  readonly editModeLabel: string;
  readonly activeId: CooccurrenceTabId;
  /** パネルが開いているか。畳んでいる間はどのアイコンも選択中にしない。 */
  readonly expanded: boolean;
  /** アイコン列自体の名前（`aria-label`）。 */
  readonly listLabel: string;
}

export interface SideIconRailOptions extends SideIconRailState {
  /** 編集モードのトグルが押された。入／切の判定は状態の持ち主（mount 側）が行う。 */
  onToggleEditMode(): void;
  /**
   * アイコンが選ばれた。押されたアイコンの id だけを渡す。
   *
   * 開くか畳むかの判定はここではなく `panelStateAfterSelect`（純関数）が持つ。列の側で
   * 分岐させると、状態の持ち主（mount 側）と判定が二重になる。
   */
  onSelect(id: CooccurrenceTabId): void;
}

export interface SideIconRailHandle {
  readonly element: HTMLElement;
  /** 名称（言語切替）・選択状態・開閉状態を反映する。 */
  update(state: SideIconRailState): void;
}

const STYLE_ID = 'cooccurrence-side-rail-style';

/**
 * 図柄の実寸（px）。
 *
 * 列の幅 46px とボタン 32px は下の CSS に直接書く。markdown 拡張の EditorSideToolbar
 * （`SIDE_TOOLBAR_WIDTH` / `SIDE_TOOLBAR_ICON_SIZE`）と同じ寸法である。
 *
 * Why not 定数を CSS へ差し込むか: 注入 CSS は実ブラウザの検査（web-app の e2e）が
 * ソースから取り出して再現する。取り出し側は補間を含む CSS を再現できず、例外で落とす。
 */
const ICON_SIZE = 20;

/**
 * Material（Filled）のアイコン path。
 *
 * Why not アイコンフォントや外部パッケージを使うか: このビューアは VS Code の webview と
 * web-app の双方へ素の DOM として埋め込まれる。フォントの読み込みに依存すると、読み込みに
 * 失敗したホストで図柄が消え、操作面が空のボタンだけになる。
 */
const ICON_PATH: Record<CooccurrenceTabId | 'editMode', string> = {
  // 枠の中に鉛筆（編集モード）。語タブの図柄（鉛筆のみ）と小さくても取り違えないよう枠を持たせる。
  editMode:
    'M3 3h11v2H5v14h14v-9h2v11H3zm18.7 1.3-2-2a1 1 0 0 0-1.4 0L17 3.6 20.4 7l1.3-1.3a1 1 0 0 0 0-1.4M8 13.5V17h3.5l8-8L16 5.5z',
  // MapIcon（ミニマップ）
  minimap:
    'M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5M15 19l-6-2.11V5l6 2.11z',
  // FilterAltIcon（絞り込み）
  filter:
    'M4.25 5.61C6.27 8.2 10 13 10 13v6c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-6s3.72-4.8 5.74-7.39c.51-.66.04-1.61-.79-1.61H5.04c-.83 0-1.3.95-.79 1.61',
  // EditIcon（語の編集）
  words:
    'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75z',
  // 3 つの点を束ねた形（クラスタ）。語・共起の図柄と紛れないよう、線を持たせない。
  clusters:
    'M7 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6m10 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6m-5 8a3 3 0 1 1 0 6 3 3 0 0 1 0-6',
  // 2 つの円を矢印付きの線で結んだ形（共起の編集）。語の編集と別の図柄にする。
  links:
    'M5.5 15.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6m13-6a3 3 0 1 1 0 6 3 3 0 0 1 0-6M9.4 11.5h4.05l-1.4-1.4.85-.85 2.85 2.85-2.85 2.85-.85-.85 1.4-1.4H9.4z',
  // 縦線を等間隔に並べた形（時間軸）。レイヤーが並ぶ図そのものを図柄にする。ミニマップの
  // 図柄（折り畳んだ地図）とは面の分割の向きが違うため、小さくても取り違えない。
  timeline:
    'M4 5h3v14H4zm6.5 0h3v14h-3zM17 5h3v14h-3z',
  // SaveIcon（保存）
  export:
    'M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m3-10H5V5h10z',
};

function ensureStyles(): void {
  ensureButtonBaseStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-rail{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:4px;width:46px;height:100%;padding:8px 0;border-left:1px solid var(--cooc-divider);background:var(--cooc-bg);color:var(--cooc-text-secondary)}
.cooc-rail__tabs{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:4px;width:100%}
.cooc-rail__divider{flex:0 0 auto;width:24px;height:1px;margin:4px 0;background:var(--cooc-divider)}
.cooc-rail__toggle[aria-pressed="true"]{background:var(--cooc-action-selected);color:var(--cooc-text)}
.cooc-rail__item{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:6px;color:inherit}
.cooc-rail__item:hover{background:var(--cooc-action-hover);color:var(--cooc-text)}
.cooc-rail__item[data-active="true"]{background:var(--cooc-action-selected);color:var(--cooc-text)}
.cooc-rail__item:focus-visible{outline:2px solid var(--cooc-primary);outline-offset:-2px}
`;
  document.head.appendChild(style);
}

function iconElement(id: CooccurrenceTabId | 'editMode'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(ICON_SIZE));
  svg.setAttribute('height', String(ICON_SIZE));
  // 図柄はボタンの色に従う。ここを固定色にすると、ダーク／ライトのどちらかで背景に埋もれる。
  svg.setAttribute('fill', 'currentColor');
  // 図柄そのものは支援技術に読ませない。名前はボタンの aria-label が持つ。
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICON_PATH[id]);
  svg.appendChild(path);
  return svg;
}

/**
 * 図の右端に立てる縦アイコン列を作る。
 *
 * markdown 拡張のサイドツールバー（`EditorSideToolbar`）と同じ操作感にする。アイコン 1 つが
 * 右パネルのタブ 1 枚に対応し、選択中のアイコンをもう一度押すとパネルを畳む（仕様 §3.5）。
 *
 * WAI-ARIA の tabs パターンに従い、選択中のアイコンだけを Tab キーの停止点にする
 * （roving tabindex）。パネルを畳んでいる間はどのアイコンも `aria-selected` にしない。
 * 畳んだ状態でも列は残るため、最後に選んでいたアイコンが停止点を持ち続ける
 * （停止点が無くなるとキーボードからパネルへ戻れない）。
 *
 * Why not `tab` に `aria-expanded` を付けて開閉を表すか: `aria-expanded` は `tab` ではなく
 * 制御される `tabpanel` 側に置くのが現行の指針である（MDN / ARIA の tablist 記述）。開閉は
 * mount 側が tabpanel へ流し込み、ここは選択状態だけを持つ。
 */
export function createSideIconRail(options: SideIconRailOptions): SideIconRailHandle {
  ensureStyles();

  const element = document.createElement('div');
  element.className = 'cooc-rail';

  /*
   * 編集モードのトグルはタブの一覧の外へ置く。
   *
   * Why not tablist の一員にするか: tablist の子は tab であることが前提で、押すと開く／畳む
   * タブと、状態を切り替えるトグルが同じ役割で読まれる。支援技術には「タブが 1 枚増えた」と
   * 伝わり、選ぶと何が起きるかが読み取れない。
   */
  const editModeToggle = createPanelButton('cooc-rail__item cooc-rail__toggle');
  editModeToggle.dataset.editModeToggle = 'true';
  editModeToggle.appendChild(iconElement('editMode'));
  editModeToggle.addEventListener('click', () => options.onToggleEditMode());

  const divider = document.createElement('div');
  divider.className = 'cooc-rail__divider';

  const tabs = document.createElement('div');
  tabs.className = 'cooc-rail__tabs';
  tabs.setAttribute('role', 'tablist');
  // 縦に並ぶ列であることを宣言する。既定は horizontal で、読み上げ上の並びが見た目とずれる。
  tabs.setAttribute('aria-orientation', 'vertical');

  element.append(editModeToggle, divider, tabs);

  const buttons = new Map<CooccurrenceTabId, HTMLButtonElement>();
  let state: SideIconRailState = {
    items: options.items,
    activeId: options.activeId,
    expanded: options.expanded,
    listLabel: options.listLabel,
    editMode: options.editMode,
    editModeLabel: options.editModeLabel,
  };

  function build(): void {
    tabs.replaceChildren();
    buttons.clear();
    state.items.forEach((item) => {
      const button = createPanelButton('cooc-rail__item');
      button.id = tabElementId(item.panelId);
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', item.panelId);
      button.setAttribute('aria-label', item.label);
      // ポインタ利用者には図柄だけでは伝わらない。ネイティブの tooltip で名前を出す。
      // 無効時は理由に差し替える（無言で押せないボタンにしない）。
      button.title = item.disabled ? item.disabledReason ?? item.label : item.label;
      button.disabled = item.disabled === true;
      button.appendChild(iconElement(item.id));
      button.addEventListener('click', () => options.onSelect(item.id));
      button.addEventListener('keydown', (event) => {
        // 巡回対象は「今そこにある押せるアイコン」。保存に対応しないホストでは保存アイコンが
        // 並びから外れ、無効中のタブ（OZ 3D のミニマップ）は飛ばす。
        const enabledIds = state.items.filter((candidate) => candidate.disabled !== true).map((candidate) => candidate.id);
        const next = nextTabId(state.activeId, event.key, enabledIds);
        if (next === null) return;
        // 既定動作（列のスクロール等）が残ると、キーで移すたびに表示位置が飛ぶ。
        event.preventDefault();
        options.onSelect(next);
        buttons.get(next)?.focus();
      });
      buttons.set(item.id, button);
      tabs.appendChild(button);
    });
  }

  function syncSelection(): void {
    tabs.setAttribute('aria-label', state.listLabel);
    editModeToggle.setAttribute('aria-pressed', String(state.editMode));
    editModeToggle.setAttribute('aria-label', state.editModeLabel);
    editModeToggle.title = state.editModeLabel;
    buttons.forEach((button, id) => {
      const active = id === state.activeId;
      const selected = active && state.expanded;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = active ? 0 : -1;
      // 選択中の見た目は data 属性で切り替える（クラスの付け外しより状態が読み取りやすい）。
      button.dataset.active = String(selected);
    });
  }

  build();
  syncSelection();

  return {
    element,
    update(next: SideIconRailState): void {
      state = next;
      // 作り直すとフォーカス中のボタンが破棄される。キーボードで移した直後に update が走る
      // ため、戻さないとフォーカスが body へ落ちて操作が続かない。
      const focused = document.activeElement;
      const refocusId = [...buttons.entries()].find(([, button]) => button === focused)?.[0] ?? null;
      build();
      syncSelection();
      if (refocusId !== null) buttons.get(refocusId)?.focus();
    },
  };
}
