/**
 * 脱React の vanilla DOM Radio / RadioGroup / FormControlLabel ファクトリ
 * （MUI Radio・RadioGroup・FormControlLabel / ui/Radio.tsx・RadioGroup.tsx・FormControlLabel.tsx 置換）。
 *
 * 既存 React 実装（+ `*.module.css`）の見た目・API・a11y を素 DOM で再現する。
 *
 * - Radio: outer ring（RadioButtonUnchecked 相当）+ inner dot（scale 0→1）+ root 全面を覆う透明
 *   radio input の 3 パーツ。off=text-secondary / on=primary-main。幾何は MUI 既定
 *   （アイコン medium 24px / small 20px、root padding 9px / small 8px、dot medium 12px / small 10px）。
 * - RadioGroup: React は context で value / name / onChange を子へ配るが、vanilla では context が
 *   使えないため **register パターン** で明示注入する。FormControlLabel の register() を子から呼ぶ。
 * - FormControlLabel: label + control の薄いラッパー。RadioGroup 配下では register 経由で
 *   checked / onChange / value / name を control に注入する。
 *
 * テーマ色は `--am-color-*` CSS 変数（applyEditorThemeCssVars 注入）で追従し、React hook
 * （useIsDark 等）には依存しない。`Button.ts` / `Switch.ts` の cssText + addEventListener パターンに揃える。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";

export type RadioSize = "small" | "medium";

// --- Radio -------------------------------------------------------------------

/** vanilla Radio のオプション。React `RadioProps` のうち vanilla で再現する範囲。 */
export interface CreateRadioOptions {
  /** チェック状態。 */
  checked?: boolean;
  /** 変更ハンドラ（change イベント。元イベントを渡す）。 */
  onChange?: (event: Event) => void;
  /** input の value。 */
  value?: string;
  /** input の name（同 name の radio で排他選択になる）。 */
  name?: string;
  /** disabled 状態。 */
  disabled?: boolean;
  /** MUI size。small=20px アイコン / medium=24px（既定）。 */
  size?: RadioSize;
  /** input の aria-label（MUI slotProps.input 相当）。 */
  ariaLabel?: string;
  /** root への追加クラス名。 */
  className?: string;
  /** data-testid 属性（root に付与）。 */
  testId?: string;
  /** root への追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
}

// root: padding 9px の相対配置コンテナ。off=text-secondary。
const RADIO_ROOT_BASE_CSS =
  "position:relative;display:inline-flex;align-items:center;justify-content:center;" +
  "box-sizing:border-box;flex-shrink:0;border-radius:50%;cursor:pointer;vertical-align:middle;";

const RADIO_ROOT_MEDIUM_CSS = "padding:9px;";
const RADIO_ROOT_SMALL_CSS = "padding:8px;";

const RADIO_ROOT_OFF_CSS = "color:var(--am-color-text-secondary);";
const RADIO_ROOT_ON_CSS = "color:var(--am-color-primary-main);";

// ring: 外周リング 24x24（small 20x20）、border 2px currentColor。
const RADIO_RING_BASE_CSS = "box-sizing:border-box;border:2px solid currentColor;border-radius:50%;";
const RADIO_RING_MEDIUM_CSS = "width:24px;height:24px;";
const RADIO_RING_SMALL_CSS = "width:20px;height:20px;";

// dot: 中心ドット 12x12（small 10x10）。off=scale(0) / on=scale(1)。
const RADIO_DOT_BASE_CSS =
  "position:absolute;top:50%;left:50%;border-radius:50%;background-color:currentColor;" +
  "transition:transform var(--am-duration-fast) var(--am-ease-standard);";
const RADIO_DOT_MEDIUM_CSS = "width:12px;height:12px;";
const RADIO_DOT_SMALL_CSS = "width:10px;height:10px;";
const RADIO_DOT_OFF_CSS = "transform:translate(-50%, -50%) scale(0);";
const RADIO_DOT_ON_CSS = "transform:translate(-50%, -50%) scale(1);";

// input: root 全体を覆う透明 radio（クリックターゲット）。
const RADIO_INPUT_CSS =
  "position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;" +
  "opacity:0;cursor:inherit;z-index:1;";

/**
 * vanilla Radio を生成する。
 *
 * 構造は `<span root>` 内に ring → dot → input(radio) の順。checked / disabled で root（色）と
 * dot（scale）の cssText を JS で同期する。
 *
 * @returns `el`（root span）と現在の `input` / `update`（可変プロパティ反映）/ `destroy`（listener 削除）。
 */
export function createRadio(opts: CreateRadioOptions = {}): {
  el: HTMLSpanElement;
  /** 現在の input 要素（フォーカス制御等に使う）。 */
  input: HTMLInputElement;
  update: (next: Partial<CreateRadioOptions>) => void;
  destroy: () => void;
} {
  const size: RadioSize = opts.size ?? "medium";
  let checked = opts.checked ?? false;

  const el = document.createElement("span");
  if (opts.className) el.className = opts.className;
  if (opts.testId) el.setAttribute("data-testid", opts.testId);

  const ring = document.createElement("span");
  ring.style.cssText =
    RADIO_RING_BASE_CSS + (size === "small" ? RADIO_RING_SMALL_CSS : RADIO_RING_MEDIUM_CSS);

  const dot = document.createElement("span");
  const dotSizeCss = size === "small" ? RADIO_DOT_SMALL_CSS : RADIO_DOT_MEDIUM_CSS;

  const input = document.createElement("input");
  input.type = "radio";
  input.style.cssText = RADIO_INPUT_CSS;
  input.checked = checked;
  if (opts.value !== undefined) input.value = opts.value;
  if (opts.name !== undefined) input.name = opts.name;
  if (opts.disabled) input.disabled = true;
  if (opts.ariaLabel) input.setAttribute("aria-label", opts.ariaLabel);

  /** checked / disabled に応じて root（色）・dot（scale）・input を同期する。 */
  const applyState = (nextChecked: boolean, disabled: boolean): void => {
    const rootSizeCss = size === "small" ? RADIO_ROOT_SMALL_CSS : RADIO_ROOT_MEDIUM_CSS;
    const colorCss = nextChecked ? RADIO_ROOT_ON_CSS : RADIO_ROOT_OFF_CSS;
    const disabledCss = disabled ? "opacity:0.38;cursor:default;" : "";
    el.style.cssText = RADIO_ROOT_BASE_CSS + rootSizeCss + colorCss + disabledCss;
    dot.style.cssText = RADIO_DOT_BASE_CSS + dotSizeCss + (nextChecked ? RADIO_DOT_ON_CSS : RADIO_DOT_OFF_CSS);
    input.checked = nextChecked;
    el.setAttribute("data-checked", nextChecked ? "true" : "false");
  };
  applyState(checked, !!opts.disabled);
  applyStyle(el, opts.style);

  // React 実装の DOM 順（ring → dot → input）に一致。
  el.appendChild(ring);
  el.appendChild(dot);
  el.appendChild(input);

  let changeHandler = opts.onChange;
  const onChange = (event: Event): void => {
    checked = input.checked;
    applyState(checked, input.disabled);
    changeHandler?.(event);
  };
  input.addEventListener("change", onChange);

  return {
    el,
    input,
    update(next: Partial<CreateRadioOptions>) {
      const nextChecked = next.checked !== undefined ? next.checked : input.checked;
      if (next.disabled !== undefined) input.disabled = next.disabled;
      if (next.checked !== undefined) checked = next.checked;
      if (next.checked !== undefined || next.disabled !== undefined) {
        applyState(nextChecked, input.disabled);
      }
      // checked / disabled 以外の変更でも applyStyle が上書きしないよう、後段で再適用する。
      if (next.value !== undefined) input.value = next.value;
      if (next.name !== undefined) input.name = next.name;
      if (next.ariaLabel !== undefined) {
        if (next.ariaLabel) input.setAttribute("aria-label", next.ariaLabel);
        else input.removeAttribute("aria-label");
      }
      if (next.className !== undefined) el.className = next.className;
      if (next.style !== undefined) applyStyle(el, next.style);
      if (next.onChange !== undefined) changeHandler = next.onChange;
    },
    destroy() {
      input.removeEventListener("change", onChange);
      changeHandler = undefined;
    },
  };
}

// --- FormControlLabel --------------------------------------------------------

/**
 * RadioGroup が FormControlLabel に注入する選択状態。register パターンで子へ明示注入する
 * （React context の置換）。
 */
export interface RadioGroupRegistration {
  /** 現在の選択値。 */
  value?: string;
  /** 共有 name。 */
  name?: string;
  /** 子の選択時に親へ通知（新しい value と元イベントを渡す）。 */
  onSelect?: (value: string, event: Event) => void;
}

/** vanilla FormControlLabel のオプション。React `FormControlLabelProps` のうち vanilla で再現する範囲。 */
export interface CreateFormControlLabelOptions {
  /** Radio などの制御要素ファクトリの返り値（el / input / update を持つ）。 */
  control: {
    el: HTMLElement;
    input: HTMLInputElement;
    update: (next: Partial<CreateRadioOptions>) => void;
    destroy: () => void;
  };
  /** ラベル（string / Node / その配列）。 */
  label: VanillaContent;
  /** この項目の value（RadioGroup 配下で選択判定に使う）。 */
  value?: string;
  /** disabled 状態。 */
  disabled?: boolean;
  /** root（label）への追加クラス名。 */
  className?: string;
  /** data-testid 属性（root に付与）。 */
  testId?: string;
}

const FCL_ROOT_BASE_CSS =
  "display:inline-flex;align-items:center;cursor:pointer;vertical-align:middle;" +
  "margin-left:-11px;margin-right:16px;-webkit-tap-highlight-color:transparent;";
const FCL_ROOT_DISABLED_CSS = "cursor:default;";

const FCL_LABEL_BASE_CSS =
  "font-size:1rem;line-height:1.5;color:var(--am-color-text-primary);";
const FCL_LABEL_DISABLED_CSS = "opacity:0.38;";

/**
 * vanilla FormControlLabel を生成する。
 *
 * `<label>` 内に control.el → label span を並べる。RadioGroup 配下では `register()` を親が呼び、
 * value / name / onSelect を受け取って control に checked / onChange / value / name を注入する。
 *
 * @returns `el`（label）と `register`（RadioGroup から注入）/ `update` / `destroy`。
 */
export function createFormControlLabel(opts: CreateFormControlLabelOptions): {
  el: HTMLLabelElement;
  /** RadioGroup から呼ばれ、選択状態を control へ注入する。 */
  register: (reg: RadioGroupRegistration) => void;
  /** 親 RadioGroup の選択値変更を反映する。 */
  setGroupValue: (groupValue: string | undefined) => void;
  update: (next: Partial<CreateFormControlLabelOptions>) => void;
  destroy: () => void;
} {
  const el = document.createElement("label");
  if (opts.className) el.className = opts.className;
  if (opts.testId) el.setAttribute("data-testid", opts.testId);

  let disabled = !!opts.disabled;
  const applyRootStyle = (): void => {
    el.style.cssText = FCL_ROOT_BASE_CSS + (disabled ? FCL_ROOT_DISABLED_CSS : "");
  };
  applyRootStyle();

  const labelSpan = document.createElement("span");
  const applyLabelStyle = (): void => {
    labelSpan.style.cssText = FCL_LABEL_BASE_CSS + (disabled ? FCL_LABEL_DISABLED_CSS : "");
  };
  applyLabelStyle();
  appendContent(labelSpan, opts.label);

  // DOM 順は control → label（React 実装に一致）。
  el.appendChild(opts.control.el);
  el.appendChild(labelSpan);

  if (disabled) opts.control.update({ disabled: true });

  let registration: RadioGroupRegistration | null = null;

  // control の change を親 RadioGroup へ転送する。
  const onControlChange = (): void => {
    if (registration?.onSelect && opts.value !== undefined) {
      registration.onSelect(opts.value, lastChangeEvent ?? new Event("change"));
    }
  };
  let lastChangeEvent: Event | null = null;
  const onInputChange = (event: Event): void => {
    lastChangeEvent = event;
    onControlChange();
  };
  opts.control.input.addEventListener("change", onInputChange);

  /** registration の value と自身の value から checked を判定して control に注入する。 */
  const syncFromRegistration = (): void => {
    if (!registration || opts.value === undefined) return;
    const next: Partial<CreateRadioOptions> = {
      checked: registration.value === opts.value,
      value: opts.value,
    };
    if (registration.name !== undefined) next.name = registration.name;
    opts.control.update(next);
  };

  return {
    el,
    register(reg: RadioGroupRegistration) {
      registration = reg;
      syncFromRegistration();
    },
    setGroupValue(groupValue: string | undefined) {
      if (!registration) return;
      registration = { ...registration, value: groupValue };
      syncFromRegistration();
    },
    update(next: Partial<CreateFormControlLabelOptions>) {
      if (next.disabled !== undefined) {
        disabled = next.disabled;
        applyRootStyle();
        applyLabelStyle();
        opts.control.update({ disabled });
      }
      if (next.label !== undefined) {
        for (const node of [...labelSpan.childNodes]) labelSpan.removeChild(node);
        appendContent(labelSpan, next.label);
      }
      if (next.value !== undefined) {
        opts.value = next.value;
        syncFromRegistration();
      }
      if (next.className !== undefined) el.className = next.className;
    },
    destroy() {
      opts.control.input.removeEventListener("change", onInputChange);
      opts.control.destroy();
      registration = null;
    },
  };
}

// --- RadioGroup --------------------------------------------------------------

/** RadioGroup の子（FormControlLabel ファクトリの返り値）。register / setGroupValue を持つ。 */
export interface RadioGroupChild {
  el: HTMLElement;
  register: (reg: RadioGroupRegistration) => void;
  setGroupValue: (groupValue: string | undefined) => void;
}

/** vanilla RadioGroup のオプション。React `RadioGroupProps` のうち vanilla で再現する範囲。 */
export interface CreateRadioGroupOptions {
  /** 現在の選択値。 */
  value?: string;
  /** 共有 name（子 radio の排他選択に使う）。 */
  name?: string;
  /** 横並びにする（MUI の row）。 */
  row?: boolean;
  /** 変更ハンドラ（新しい value と元イベントを渡す）。 */
  onChange?: (value: string, event: Event) => void;
  /** 子（createFormControlLabel の返り値）の配列。register で選択状態を注入する。 */
  children?: readonly RadioGroupChild[];
  /** root への追加クラス名。 */
  className?: string;
  /** data-testid 属性（root に付与）。 */
  testId?: string;
}

const RADIO_GROUP_BASE_CSS = "display:flex;";
const RADIO_GROUP_COLUMN_CSS = "flex-direction:column;";
const RADIO_GROUP_ROW_CSS = "flex-direction:row;flex-wrap:wrap;";

/**
 * vanilla RadioGroup を生成する。
 *
 * `role="radiogroup"` の `<div>` 内に子（FormControlLabel）の el を並べ、各子に `register()` で
 * value / name / onSelect を注入する（React context の置換）。子の選択時は onSelect → 親 onChange
 * を呼び、全子の `setGroupValue` で checked を再同期する。
 *
 * @returns `el`（radiogroup div）と `update`（value / onChange 等の反映）/ `destroy`。
 */
export function createRadioGroup(opts: CreateRadioGroupOptions = {}): {
  el: HTMLDivElement;
  update: (next: Partial<CreateRadioGroupOptions>) => void;
  destroy: () => void;
} {
  let value = opts.value;
  let changeHandler = opts.onChange;
  const name = opts.name;
  const children = opts.children ?? [];

  const el = document.createElement("div");
  el.setAttribute("role", "radiogroup");
  if (opts.className) el.className = opts.className;
  if (opts.testId) el.setAttribute("data-testid", opts.testId);

  const applyLayout = (row: boolean): void => {
    el.style.cssText = RADIO_GROUP_BASE_CSS + (row ? RADIO_GROUP_ROW_CSS : RADIO_GROUP_COLUMN_CSS);
  };
  applyLayout(!!opts.row);

  /** 子が選択されたとき: 内部 value を更新 → 全子に再同期 → 親 onChange を通知。 */
  const handleSelect = (selectedValue: string, event: Event): void => {
    value = selectedValue;
    for (const child of children) child.setGroupValue(value);
    changeHandler?.(selectedValue, event);
  };

  for (const child of children) {
    child.register({ value, name, onSelect: handleSelect });
    el.appendChild(child.el);
  }

  return {
    el,
    update(next: Partial<CreateRadioGroupOptions>) {
      if (next.row !== undefined) applyLayout(next.row);
      if (next.value !== undefined) {
        value = next.value;
        for (const child of children) child.setGroupValue(value);
      }
      if (next.onChange !== undefined) changeHandler = next.onChange;
      if (next.className !== undefined) el.className = next.className;
    },
    destroy() {
      changeHandler = undefined;
    },
  };
}
