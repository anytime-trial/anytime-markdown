/**
 * 脱React の vanilla DOM ToggleButton / ToggleButtonGroup ファクトリ
 * （MUI ToggleButton / ui/ToggleButton.tsx + ui/ToggleButtonGroup.tsx 置換）。
 *
 * 既存 React 実装の見た目・API・a11y を素 DOM で再現する。
 * - ToggleButton: button[aria-pressed]。`standard`（連結ボーダー）/ `pill`（角丸地）の 2 バリアント。
 *   選択中は背景・文字色が選択色へ切り替わる。クリックで onChange(value) を発火。
 * - ToggleButtonGroup: role="group" の横並び flex コンテナ。子へバリアント / サイズ / 選択値 /
 *   onChange を「明示 register/notify API」で注入する（React context が使えないため）。
 *   `group.register(child)` で子を登録すると、子は group の value 一致で selected を決定し、
 *   クリック時に group.onChange を呼ぶ。group.notify() で全子の選択状態を再評価する。
 *
 * テーマ色は React hook（useIsDark）に依存せず `--am-color-*` CSS 変数
 * （applyEditorThemeCssVars 注入）で追従する。`Button.ts` / `Tabs.ts` の cssText +
 * addEventListener パターンに揃え、ToggleButton と Group を同 file に置く。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";

export type ToggleVariant = "standard" | "pill";
export type ToggleSize = "small" | "medium";

// --- ToggleButton ------------------------------------------------------------

/**
 * Group が子へ制御を注入するためのハンドル（React context の代替）。
 * `group.register(child)` の戻り値として子に渡され、子はここから現在の
 * variant / size / value / onChange を読む。
 */
export interface ToggleGroupHandle {
  readonly variant: ToggleVariant;
  readonly size: ToggleSize;
  /** exclusive 選択時の選択値。undefined のとき子は自身の `selected` で決まる。 */
  readonly value: unknown;
  /** 子クリック時に呼ばれる。引数は子の value。 */
  notifyChange(value: unknown): void;
}

/** {@link createToggleButton} のオプション。React `ToggleButtonProps` の vanilla 再現範囲。 */
export interface CreateToggleButtonOptions {
  /** このボタンの識別値。親 Group の value と一致したとき選択状態になる。 */
  value?: unknown;
  /** 親 Group が value を持たない / 未登録の場合に selected を直接制御する。 */
  selected?: boolean;
  /** バリアント（単体生成時の指定。Group 登録時は group 側が優先）。 */
  variant?: ToggleVariant;
  /** サイズ（単体生成時の指定。Group 登録時は group 側が優先）。 */
  size?: ToggleSize;
  /** ボタン内のラベル。children でも可。 */
  label?: VanillaContent;
  /** 任意のコンテンツ（label 未指定時に使う）。 */
  children?: VanillaContent;
  /** 無効化（opacity 0.5 + cursor:default）。 */
  disabled?: boolean;
  /** aria-label（アイコンのみボタン等）。 */
  ariaLabel?: string;
  /** title 属性（ツールチップ）。 */
  title?: string;
  /** 追加クラス名（外部スタイルとの結合用）。 */
  className?: string;
  /** data-testid 属性。 */
  testId?: string;
  /** 追加スタイル（色の上書きは update が優先するため非推奨）。 */
  style?: Partial<CSSStyleDeclaration>;
  /** クリックハンドラ。第 1 引数は value（MUI onChange(event, value) の value 相当）。 */
  onClick?: (value: unknown) => void;
}

// ToggleButton.module.css の .button と一字一句対応させる（色は variant/selected で動的差し込み）。
const BUTTON_BASE_CSS =
  "display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;" +
  "font:inherit;font-weight:500;letter-spacing:0.02857em;text-transform:none;cursor:pointer;" +
  "background:transparent;" +
  "transition:background-color var(--am-duration-fast) var(--am-ease-standard)," +
  "color var(--am-duration-fast) var(--am-ease-standard);";

// size（standard 用の最小高さ）。pill は height:100% を別途持つため min-height は付与しない。
const SIZE_CSS: Record<ToggleSize, string> = {
  small: "min-height:30px;",
  medium: "min-height:36px;",
};

/**
 * standard variant の cssText 断片を選択状態込みで返す。
 * ToggleButton.module.css の .standard / .standard.selected と対応させる。
 * 連結ボーダーの margin-left / 角丸は first/last の DOM 位置に依存するため Group 側で付与する。
 */
function standardCss(selected: boolean): string {
  const base = "border:1px solid var(--am-color-divider);";
  if (selected) {
    return (
      base +
      "background-color:var(--am-color-action-selected);color:var(--am-color-text-primary);"
    );
  }
  return base + "color:var(--am-color-action-active);";
}

/**
 * pill variant の cssText 断片を選択状態込みで返す。
 * ToggleButton.module.css の .pill / .pill.selected と対応させる。
 */
function pillCss(selected: boolean): string {
  const base =
    "border:none;border-radius:20px;padding:0 16px;gap:4px;height:100%;line-height:1;" +
    "font-size:0.8125rem;";
  if (selected) {
    return (
      base +
      "background-color:var(--am-color-bg-paper);color:var(--am-color-text-primary);" +
      "box-shadow:0 1px 2px rgba(0,0,0,0.15);"
    );
  }
  return base + "color:var(--am-color-text-secondary);";
}

/**
 * vanilla ToggleButton を生成する。
 *
 * 単体利用時は `selected` prop で選択状態を制御する。Group へ {@link createToggleButtonGroup}
 * の `register()` で登録すると、group の value 一致で selected が決まり、クリックで
 * group.onChange が発火する（明示 register/notify API＝React context の代替）。
 *
 * @returns `el`（button[aria-pressed]）/ `value` / `update` / `destroy`、および Group 専用の
 *   `attachGroup`（内部 register が呼ぶ）/ `syncFromGroup`（group.notify が呼ぶ）。
 */
export function createToggleButton(opts: CreateToggleButtonOptions = {}): {
  el: HTMLButtonElement;
  value: unknown;
  update: (next: Partial<CreateToggleButtonOptions>) => void;
  destroy: () => void;
  /** Group 登録時に呼ばれ、group ハンドルを束ねて選択状態を再評価する。 */
  attachGroup: (group: ToggleGroupHandle | null) => void;
  /** group.notify() からの再評価要求（選択状態のみ反映）。 */
  syncFromGroup: () => void;
} {
  const value = opts.value;
  let variant: ToggleVariant = opts.variant ?? "standard";
  let size: ToggleSize = opts.size ?? "small";
  let selected = opts.selected ?? false;
  let disabled = opts.disabled ?? false;
  let group: ToggleGroupHandle | null = null;

  const el = document.createElement("button");
  el.type = "button";

  // group が value を持つ場合は value 一致、無ければ単体 selected で決定（React 実装と同条件）。
  const computeSelected = (): boolean => {
    if (group && group.value !== undefined) return group.value === value;
    return selected;
  };

  const applyState = (): void => {
    const v = group?.variant ?? variant;
    const s = group?.size ?? size;
    const isSelected = computeSelected();
    const disabledCss = disabled ? "opacity:0.5;cursor:default;" : "";
    const variantCss = v === "pill" ? pillCss(isSelected) : standardCss(isSelected);
    el.style.cssText = BUTTON_BASE_CSS + SIZE_CSS[s] + variantCss + disabledCss;
    el.setAttribute("data-variant", v);
    el.setAttribute("data-size", s);
    el.setAttribute("aria-pressed", isSelected ? "true" : "false");
    el.disabled = disabled;
    applyStyle(el, opts.style);
  };

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
    group?.notifyChange(value);
  };
  el.addEventListener("click", onClick);

  return {
    el,
    value,
    update(next: Partial<CreateToggleButtonOptions>) {
      let stateChanged = false;
      if (next.selected !== undefined) {
        selected = next.selected;
        stateChanged = true;
      }
      if (next.disabled !== undefined) {
        disabled = next.disabled;
        stateChanged = true;
      }
      if (next.variant !== undefined) {
        variant = next.variant;
        stateChanged = true;
      }
      if (next.size !== undefined) {
        size = next.size;
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
      group = null;
    },
    attachGroup(g: ToggleGroupHandle | null) {
      group = g;
      applyState();
    },
    syncFromGroup() {
      applyState();
    },
  };
}

// --- ToggleButtonGroup -------------------------------------------------------

/** {@link createToggleButtonGroup} のオプション。React `ToggleButtonGroupProps` の vanilla 再現範囲。 */
export interface CreateToggleButtonGroupOptions {
  variant?: ToggleVariant;
  size?: ToggleSize;
  /** exclusive 選択時の選択値。指定すると子 ToggleButton の selected を value 一致で決定する。 */
  value?: unknown;
  /** タブ切替時に発火。引数は選択された子の value（MUI onChange の value 相当）。 */
  onChange?: (value: unknown) => void;
  /** 追加クラス名。 */
  className?: string;
  /** data-testid 属性。 */
  testId?: string;
  /** aria-label（group のラベル）。 */
  ariaLabel?: string;
}

// ToggleButtonGroup.module.css の .group と同値（横並び inline-flex）。
const GROUP_STANDARD_CSS = "display:inline-flex;";
// .group.pill（角丸コンテナ・action-hover 地）。
const GROUP_PILL_CSS =
  "display:inline-flex;box-sizing:border-box;align-items:center;height:34px;" +
  "border-radius:20px;background-color:var(--am-color-action-hover);padding:2px;";

type ToggleChild = ReturnType<typeof createToggleButton>;

/**
 * vanilla ToggleButtonGroup を生成する。role="group" の横並びコンテナ。
 *
 * 子の制御は React context ではなく明示 register/notify API で行う:
 * - `register(child)` で子を登録すると、子へ group ハンドルを注入し DOM へ append する。
 *   連結ボーダーの margin / 角丸（standard）を DOM 位置から再付与する。
 * - 子クリック → group.notifyChange(value) → onChange(value) を発火し、全子を再評価。
 * - `setValue(value)` / `update({ value })` で選択値を変えると全子の selected が更新される。
 *
 * @returns `el`（div[role=group]）/ `register` / `setValue` / `update` / `destroy`。
 */
export function createToggleButtonGroup(opts: CreateToggleButtonGroupOptions = {}): {
  el: HTMLDivElement;
  /** 子 ToggleButton を登録し DOM へ append する。 */
  register: (child: ToggleChild) => void;
  /** 選択値を変更し全子を再評価する。 */
  setValue: (value: unknown) => void;
  update: (next: Partial<CreateToggleButtonGroupOptions>) => void;
  destroy: () => void;
} {
  let variant: ToggleVariant = opts.variant ?? "standard";
  let size: ToggleSize = opts.size ?? "small";
  let value = opts.value;
  let onChange = opts.onChange;
  const children: ToggleChild[] = [];

  const el = document.createElement("div");
  el.setAttribute("role", "group");

  const applyGroupCss = (): void => {
    el.style.cssText = variant === "pill" ? GROUP_PILL_CSS : GROUP_STANDARD_CSS;
    el.setAttribute("data-variant", variant);
  };
  applyGroupCss();
  if (opts.className) el.className = opts.className;
  if (opts.testId) el.setAttribute("data-testid", opts.testId);
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);

  // 子へ渡す group ハンドル（変更後も同一参照を保てるよう getter で最新値を返す）。
  const handle: ToggleGroupHandle = {
    get variant() {
      return variant;
    },
    get size() {
      return size;
    },
    get value() {
      return value;
    },
    notifyChange(v: unknown) {
      onChange?.(v);
    },
  };

  // standard の連結ボーダー（margin-left:-1px、first/last の角丸）を DOM 位置から付与する。
  // CSS Modules の :first-of-type / :last-of-type を素 DOM で再現する。
  const applyAdjacency = (): void => {
    children.forEach((child, i) => {
      const { el: cEl } = child;
      if (variant === "pill") {
        cEl.style.marginLeft = i === 0 ? "0" : "-1px";
        cEl.style.borderTopLeftRadius = "";
        cEl.style.borderBottomLeftRadius = "";
        cEl.style.borderTopRightRadius = "";
        cEl.style.borderBottomRightRadius = "";
        return;
      }
      cEl.style.marginLeft = i === 0 ? "0" : "-1px";
      cEl.style.borderTopLeftRadius = i === 0 ? "4px" : "";
      cEl.style.borderBottomLeftRadius = i === 0 ? "4px" : "";
      const isLast = i === children.length - 1;
      cEl.style.borderTopRightRadius = isLast ? "4px" : "";
      cEl.style.borderBottomRightRadius = isLast ? "4px" : "";
    });
  };

  const syncChildren = (): void => {
    for (const child of children) child.syncFromGroup();
    applyAdjacency();
  };

  return {
    el,
    register(child: ToggleChild) {
      children.push(child);
      child.attachGroup(handle);
      el.appendChild(child.el);
      syncChildren();
    },
    setValue(v: unknown) {
      value = v;
      syncChildren();
    },
    update(next: Partial<CreateToggleButtonGroupOptions>) {
      let groupChanged = false;
      if (next.variant !== undefined) {
        variant = next.variant;
        groupChanged = true;
      }
      if (next.size !== undefined) {
        size = next.size;
        groupChanged = true;
      }
      if (next.value !== undefined) {
        value = next.value;
        groupChanged = true;
      }
      if (next.onChange !== undefined) onChange = next.onChange;
      if (next.className !== undefined) el.className = next.className;
      if (next.ariaLabel !== undefined) el.setAttribute("aria-label", next.ariaLabel);
      if (next.variant !== undefined) applyGroupCss();
      if (groupChanged) syncChildren();
    },
    destroy() {
      for (const child of children) child.destroy();
      children.length = 0;
      onChange = undefined;
    },
  };
}
