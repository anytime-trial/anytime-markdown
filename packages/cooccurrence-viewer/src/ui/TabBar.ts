import { nextTabId, tabElementId, type CooccurrenceTabId } from './tabModel';
import { ensureButtonBaseStyles } from './buttonBaseStyle';

export interface TabBarItem {
  /** タブの識別子。 */
  readonly id: CooccurrenceTabId;
  /** 表示名（i18n 済み）。 */
  readonly label: string;
  /** 対応する tabpanel の id 属性。aria-controls で結ぶ。 */
  readonly panelId: string;
}

export interface TabBarOptions {
  readonly items: readonly TabBarItem[];
  readonly activeId: CooccurrenceTabId;
  onSelect(id: CooccurrenceTabId): void;
}

export interface TabBarHandle {
  readonly element: HTMLElement;
  /** ラベル（言語切替）と選択状態を反映する。 */
  update(items: readonly TabBarItem[], activeId: CooccurrenceTabId): void;
}

const STYLE_ID = 'cooccurrence-tab-bar-style';

function ensureStyles(): void {
  ensureButtonBaseStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-tabs{position:sticky;top:0;z-index:1;flex:0 0 auto;display:flex;gap:4px;padding:8px 8px 0;background:var(--cooc-bg);border-bottom:1px solid var(--cooc-divider)}
.cooc-tabs__tab{flex:1 1 auto;border:1px solid var(--cooc-divider);border-bottom-width:0;border-radius:6px 6px 0 0;background:var(--cooc-bg);color:var(--cooc-text-secondary);padding:6px 8px;font:12px system-ui,sans-serif}
.cooc-tabs__tab:hover{background:var(--cooc-action-hover)}
.cooc-tabs__tab[data-active="true"]{background:var(--cooc-surface);color:var(--cooc-text);font-weight:600}
`;
  document.head.appendChild(style);
}

/**
 * 右サイドパネルのタブ列を作る。
 *
 * WAI-ARIA の tabs パターンに従い、選択中のタブだけを Tab キーの停止点にする
 * （roving tabindex）。全タブを停止点にすると、パネルへ入るたびにタブ数ぶん停止し、
 * キーボードで語一覧へ到達するまでの手数が増える。
 */
export function createTabBar(options: TabBarOptions): TabBarHandle {
  ensureStyles();

  const element = document.createElement('div');
  element.className = 'cooc-tabs';
  element.setAttribute('role', 'tablist');

  const buttons = new Map<CooccurrenceTabId, HTMLButtonElement>();
  let activeId = options.activeId;

  function select(id: CooccurrenceTabId): void {
    if (id === activeId) return;
    activeId = id;
    options.onSelect(id);
  }

  function build(items: readonly TabBarItem[]): void {
    element.replaceChildren();
    buttons.clear();
    items.forEach((item) => {
      const button = document.createElement('button');
      button.className = 'cooc-btn cooc-tabs__tab';
      button.type = 'button';
      button.id = tabElementId(item.panelId);
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', item.panelId);
      button.textContent = item.label;
      button.addEventListener('click', () => select(item.id));
      button.addEventListener('keydown', (event) => {
        const next = nextTabId(activeId, event.key);
        if (next === null) return;
        // 既定動作（パネル列のスクロール等）が残ると、キーでタブを移すたびに表示位置が飛ぶ。
        event.preventDefault();
        select(next);
        buttons.get(next)?.focus();
      });
      buttons.set(item.id, button);
      element.appendChild(button);
    });
  }

  function syncSelection(): void {
    buttons.forEach((button, id) => {
      const selected = id === activeId;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      // 選択中の見た目は data 属性で切り替える（クラスの付け外しより状態が読み取りやすい）。
      button.dataset.active = String(selected);
    });
  }

  build(options.items);
  syncSelection();

  return {
    element,
    update(items: readonly TabBarItem[], nextActiveId: CooccurrenceTabId): void {
      activeId = nextActiveId;
      // 作り直すとフォーカス中のタブ要素が破棄される。キーボードでタブを移した直後に
      // update が走るため、戻さないとフォーカスが body へ落ちて操作が続かない。
      const focused = document.activeElement;
      const refocusId = [...buttons.entries()].find(([, button]) => button === focused)?.[0] ?? null;
      build(items);
      syncSelection();
      if (refocusId !== null) buttons.get(refocusId)?.focus();
    },
  };
}
