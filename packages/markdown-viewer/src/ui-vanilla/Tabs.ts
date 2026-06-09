/**
 * 脱React の vanilla DOM Tabs / Tab ファクトリ（MUI Tabs / ui/Tabs.tsx + ui/Tab.tsx 置換）。
 *
 * 既存 React 実装の見た目・API・a11y を素 DOM で再現する。
 * - Tabs: role="tablist" の横並び flex コンテナ（Tabs.module.css と同値）。
 * - Tab : role="tab" + aria-selected。選択中はテキスト色 primary + 下線インジケータ点灯、
 *   非選択は textSecondary。クリックで onChange(value) を発火（MUI Tab の onChange 互換）。
 *
 * テーマ色は React hook（useIsDark）に依存せず `--am-color-primary-main` /
 * `--am-color-text-secondary` CSS 変数（applyEditorThemeCssVars 注入）で追従する。
 * 選択状態は `update()` での再描画で切り替える（React の再レンダー相当）。Tab と Tabs を同 file に置く。
 * `vanillaToolbar.ts` / `Button.ts` の cssText + addEventListener パターンに揃える。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";

// --- Tab ---------------------------------------------------------------------

/** {@link createTab} のオプション。React `TabProps` のうち vanilla で再現する範囲。 */
export interface CreateTabOptions {
  /** このタブの識別値。親 Tabs の value と一致したとき選択状態になる。 */
  value: string;
  /** タブのラベル。children でも可（MUI Tab の label prop 互換）。 */
  label?: VanillaContent;
  /** 任意のコンテンツ（label の代替。label 未指定時に使う）。 */
  children?: VanillaContent;
  /** 初期選択状態（親 Tabs から配られる。単体生成時の指定も可）。 */
  selected?: boolean;
  /** 無効化（cursor:default + opacity 0.38）。 */
  disabled?: boolean;
  /** aria-label。 */
  ariaLabel?: string;
  /** title 属性（ツールチップ）。 */
  title?: string;
  /** 追加クラス名（外部スタイルとの結合用）。 */
  className?: string;
  /** data-testid 属性。 */
  testId?: string;
  /** 追加スタイル（色・下線色の上書きは update が優先するため非推奨）。 */
  style?: Partial<CSSStyleDeclaration>;
  /** クリックハンドラ。第 1 引数は value（MUI onChange(event, value) の value 相当）。 */
  onClick?: (value: string) => void;
}

// Tab.module.css の .tab と一字一句対応させる（色・下線色のみ動的に差し込む）。
const TAB_BASE_CSS =
  "appearance:none;background:none;border:none;border-bottom:2px solid transparent;" +
  "box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;" +
  "min-height:32px;min-width:90px;padding:4px 16px;font-family:inherit;font-size:0.75rem;" +
  "font-weight:500;line-height:1.25;letter-spacing:0.02857em;text-transform:none;" +
  "white-space:nowrap;cursor:pointer;transition:color 150ms ease;";

// 選択中の文字色 + 下線色（React Tab の inline style 相当）。
const TAB_SELECTED_CSS =
  "color:var(--am-color-primary-main);border-bottom-color:var(--am-color-primary-main);";
// 非選択の文字色（下線は透明のまま）。
const TAB_UNSELECTED_CSS = "color:var(--am-color-text-secondary);";

/**
 * vanilla Tab を生成する。
 *
 * @returns `el`（button[role=tab]）と `update`（selected / disabled 等の反映）/ `destroy`（listener 削除）。
 */
export function createTab(opts: CreateTabOptions): {
  el: HTMLButtonElement;
  value: string;
  update: (next: Partial<CreateTabOptions>) => void;
  destroy: () => void;
} {
  const { value } = opts;
  let selected = opts.selected ?? false;
  let disabled = opts.disabled ?? false;

  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("role", "tab");
  el.setAttribute("data-value", value);

  const applyState = (): void => {
    el.style.cssText = TAB_BASE_CSS + (selected ? TAB_SELECTED_CSS : TAB_UNSELECTED_CSS);
    el.setAttribute("aria-selected", selected ? "true" : "false");
    // 選択中のみ Tab 順に乗る（MUI ロービングタブインデックス相当）。
    el.tabIndex = selected ? 0 : -1;
    el.disabled = disabled;
    applyStyle(el, opts.style);
  };

  // ラベル / children を描画（label 優先、無ければ children）。
  const renderContent = (content: VanillaContent | undefined): void => {
    for (const node of [...el.childNodes]) el.removeChild(node);
    appendContent(el, content ?? opts.children);
  };

  applyState();
  renderContent(opts.label);
  if (opts.className) el.className = opts.className;
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.title) el.title = opts.title;
  if (opts.testId) el.setAttribute("data-testid", opts.testId);

  let clickHandler = opts.onClick;
  const onClick = (): void => {
    clickHandler?.(value);
  };
  el.addEventListener("click", onClick);

  return {
    el,
    value,
    update(next: Partial<CreateTabOptions>) {
      let stateChanged = false;
      if (next.selected !== undefined) {
        selected = next.selected;
        stateChanged = true;
      }
      if (next.disabled !== undefined) {
        disabled = next.disabled;
        stateChanged = true;
      }
      if (stateChanged) applyState();
      if (next.ariaLabel !== undefined) el.setAttribute("aria-label", next.ariaLabel);
      if (next.title !== undefined) el.title = next.title;
      if (next.className !== undefined) el.className = next.className;
      if (next.label !== undefined || next.children !== undefined) {
        renderContent(next.label ?? next.children);
      }
      if (next.onClick !== undefined) clickHandler = next.onClick;
    },
    destroy() {
      el.removeEventListener("click", onClick);
      clickHandler = undefined;
    },
  };
}

// --- Tabs --------------------------------------------------------------------

/** {@link createTabs} に渡す 1 タブの定義。 */
export interface TabsItemOptions extends Omit<CreateTabOptions, "selected" | "onClick"> {
  value: string;
}

/** {@link createTabs} のオプション。React `TabsProps` のうち vanilla で再現する範囲。 */
export interface CreateTabsOptions {
  /** 現在選択中のタブ value。一致する Tab を選択状態にする。 */
  value: string;
  /** タブ定義の配列（描画順）。 */
  tabs: readonly TabsItemOptions[];
  /** タブ切替時に発火。引数は選択された Tab の value（MUI Tabs onChange の value 相当）。 */
  onChange?: (value: string) => void;
  /** 追加クラス名。 */
  className?: string;
  /** data-testid 属性。 */
  testId?: string;
  /** aria-label（tablist のラベル）。 */
  ariaLabel?: string;
}

// Tabs.module.css の .tabs と同値（横並び flex + 中央寄せ + min-height）。
const TABS_CSS =
  "display:flex;align-items:center;min-height:var(--am-tabs-min-height, 32px);";

/**
 * vanilla Tabs を生成する。role="tablist" の横並びコンテナ。各 Tab の選択状態は
 * value 一致で決定し、クリック時に onChange(value) を発火する。
 *
 * @returns `el`（div[role=tablist]）と `update`（value / tabs / onChange 反映）/ `destroy`
 *   （全 Tab の listener 解除）。
 */
export function createTabs(opts: CreateTabsOptions): {
  el: HTMLDivElement;
  update: (next: Partial<CreateTabsOptions>) => void;
  destroy: () => void;
} {
  let value = opts.value;
  let onChange = opts.onChange;

  const el = document.createElement("div");
  el.setAttribute("role", "tablist");
  el.style.cssText = TABS_CSS;
  if (opts.className) el.className = opts.className;
  if (opts.testId) el.setAttribute("data-testid", opts.testId);
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);

  let tabs: ReturnType<typeof createTab>[] = [];

  const buildTabs = (items: readonly TabsItemOptions[]): void => {
    for (const t of tabs) t.destroy();
    for (const node of [...el.childNodes]) el.removeChild(node);
    tabs = items.map((item) => {
      const tab = createTab({
        ...item,
        selected: item.value === value,
        onClick: (v) => onChange?.(v),
      });
      el.appendChild(tab.el);
      return tab;
    });
  };

  buildTabs(opts.tabs);

  // 選択状態だけを全 Tab に反映する（value 変更時の差分更新。再構築しない）。
  const applySelection = (): void => {
    for (const tab of tabs) tab.update({ selected: tab.value === value });
  };

  return {
    el,
    update(next: Partial<CreateTabsOptions>) {
      if (next.onChange !== undefined) {
        onChange = next.onChange;
        // 既存 Tab の onClick が参照する onChange を差し替える。
        for (const tab of tabs) tab.update({ onClick: (v) => onChange?.(v) });
      }
      if (next.className !== undefined) el.className = next.className;
      if (next.ariaLabel !== undefined) el.setAttribute("aria-label", next.ariaLabel);
      if (next.tabs !== undefined) {
        if (next.value !== undefined) value = next.value;
        buildTabs(next.tabs);
      } else if (next.value !== undefined && next.value !== value) {
        value = next.value;
        applySelection();
      }
    },
    destroy() {
      for (const tab of tabs) tab.destroy();
      tabs = [];
    },
  };
}
