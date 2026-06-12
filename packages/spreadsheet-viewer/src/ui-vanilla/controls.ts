import { injectSpreadsheetUiStyles } from "../ui/injectStyles";

/**
 * spreadsheet-viewer 自前 UI キットの vanilla ファクトリ群（React 版 ui/*.tsx の置換）。
 * クラス名・DOM 構造・role / aria 属性は React 版と同一で、見た目は injectStyles.ts の
 * `.sv-*` ルールをそのまま使う。
 */

export interface SvButtonOptions {
  label?: string;
  /** label の前に置くアイコン等のノード。 */
  startIcon?: Node;
  variant?: "text" | "outlined" | "contained";
  color?: "primary" | "inherit";
  size?: "small" | "medium";
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  onClick?: (e: MouseEvent) => void;
}

/** MUI Button 相当（sv-btn）。 */
export function createSvButton(options: SvButtonOptions): HTMLButtonElement {
  injectSpreadsheetUiStyles();
  const { variant = "text", color = "primary", size = "medium" } = options;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = [
    "sv-btn",
    `sv-btn--${variant}`,
    color === "inherit" ? "sv-btn--inherit" : "",
    size === "small" ? "sv-btn--small" : "",
    options.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  if (options.startIcon) btn.appendChild(options.startIcon);
  if (options.label) btn.appendChild(document.createTextNode(options.label));
  if (options.ariaLabel) btn.setAttribute("aria-label", options.ariaLabel);
  btn.disabled = options.disabled ?? false;
  if (options.onClick) btn.addEventListener("click", options.onClick);
  return btn;
}

export interface SvIconButtonOptions {
  icon: Node;
  size?: "small" | "medium";
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  onClick?: (e: MouseEvent) => void;
}

/** MUI IconButton 相当（sv-icon-btn）。 */
export function createSvIconButton(options: SvIconButtonOptions): HTMLButtonElement {
  injectSpreadsheetUiStyles();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = [
    "sv-icon-btn",
    options.size === "small" ? "sv-icon-btn--small" : "",
    options.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  btn.appendChild(options.icon);
  if (options.ariaLabel) btn.setAttribute("aria-label", options.ariaLabel);
  if (options.title) btn.title = options.title;
  btn.disabled = options.disabled ?? false;
  if (options.onClick) btn.addEventListener("click", options.onClick);
  return btn;
}

/** MUI Divider 相当（sv-divider）。 */
export function createSvDivider(): HTMLHRElement {
  injectSpreadsheetUiStyles();
  const hr = document.createElement("hr");
  hr.className = "sv-divider";
  return hr;
}

/** MUI Typography(caption) 相当（sv-text-caption）。 */
export function createSvCaption(text: string, style?: Partial<CSSStyleDeclaration>): HTMLSpanElement {
  injectSpreadsheetUiStyles();
  const span = document.createElement("span");
  span.className = "sv-text-caption";
  span.textContent = text;
  if (style) Object.assign(span.style, style);
  return span;
}

export interface SvSelectOption {
  value: string | number;
  label: string;
}

export interface SvSelectOptions {
  value: string | number;
  options: ReadonlyArray<SvSelectOption>;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  style?: Partial<CSSStyleDeclaration>;
}

/** MUI Select 相当（native select / sv-select）。 */
export function createSvSelect(options: SvSelectOptions): HTMLSelectElement {
  injectSpreadsheetUiStyles();
  const select = document.createElement("select");
  select.className = "sv-select";
  for (const o of options.options) {
    const opt = document.createElement("option");
    opt.value = String(o.value);
    opt.textContent = o.label;
    select.appendChild(opt);
  }
  select.value = String(options.value);
  select.disabled = options.disabled ?? false;
  if (options.ariaLabel) select.setAttribute("aria-label", options.ariaLabel);
  if (options.style) Object.assign(select.style, options.style);
  select.addEventListener("change", () => options.onChange(select.value));
  return select;
}

export interface SvTextFieldOptions {
  value: string;
  onInput?: (value: string) => void;
  type?: string;
  min?: number;
  max?: number;
  ariaLabel?: string;
  style?: Partial<CSSStyleDeclaration>;
  onKeyDown?: (e: KeyboardEvent) => void;
}

/** MUI TextField 相当（sv-textfield）。 */
export function createSvTextField(options: SvTextFieldOptions): HTMLInputElement {
  injectSpreadsheetUiStyles();
  const input = document.createElement("input");
  input.className = "sv-textfield";
  input.value = options.value;
  if (options.type) input.type = options.type;
  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  if (options.ariaLabel) input.setAttribute("aria-label", options.ariaLabel);
  if (options.style) Object.assign(input.style, options.style);
  if (options.onInput) input.addEventListener("input", () => options.onInput?.(input.value));
  if (options.onKeyDown) input.addEventListener("keydown", options.onKeyDown);
  return input;
}

export interface SvToggleButtonSpec {
  value: string;
  content: Node;
  ariaLabel?: string;
}

export interface SvToggleGroupOptions {
  value: string | null;
  buttons: ReadonlyArray<SvToggleButtonSpec>;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export interface SvToggleGroupHandle {
  el: HTMLDivElement;
  setValue(value: string | null): void;
  setDisabled(disabled: boolean): void;
}

/** MUI ToggleButtonGroup 相当（sv-toggle-group / sv-toggle-btn・aria-pressed で選択表現）。 */
export function createSvToggleGroup(options: SvToggleGroupOptions): SvToggleGroupHandle {
  injectSpreadsheetUiStyles();
  const group = document.createElement("div");
  group.className = "sv-toggle-group";
  group.setAttribute("role", "group");
  const buttons = new Map<string, HTMLButtonElement>();
  let current = options.value;

  const sync = (): void => {
    for (const [value, btn] of buttons) {
      btn.setAttribute("aria-pressed", String(current === value));
    }
  };

  for (const spec of options.buttons) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sv-toggle-btn";
    btn.appendChild(spec.content);
    if (spec.ariaLabel) btn.setAttribute("aria-label", spec.ariaLabel);
    btn.disabled = options.disabled ?? false;
    btn.addEventListener("click", () => options.onChange(spec.value));
    buttons.set(spec.value, btn);
    group.appendChild(btn);
  }
  sync();

  return {
    el: group,
    setValue(value) {
      current = value;
      sync();
    },
    setDisabled(disabled) {
      for (const btn of buttons.values()) btn.disabled = disabled;
    },
  };
}

export interface SvRadioGroupOptions {
  name: string;
  row?: boolean;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  label?: string;
}

export interface SvRadioGroupHandle {
  el: HTMLDivElement;
  setValue(value: string): void;
}

/** MUI FormControl + RadioGroup 相当（sv-form-control / sv-radio）。 */
export function createSvRadioGroup(options: SvRadioGroupOptions): SvRadioGroupHandle {
  injectSpreadsheetUiStyles();
  const control = document.createElement("div");
  control.className = "sv-form-control";
  if (options.label) {
    const label = document.createElement("div");
    label.className = "sv-form-label";
    label.textContent = options.label;
    control.appendChild(label);
  }
  const group = document.createElement("div");
  group.style.display = "flex";
  group.style.flexDirection = options.row ? "row" : "column";
  group.style.gap = options.row ? "12px" : "4px";
  const radios = new Map<string, HTMLInputElement>();
  for (const o of options.options) {
    const label = document.createElement("label");
    label.className = "sv-form-control-label";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.className = "sv-radio";
    radio.name = options.name;
    radio.checked = options.value === o.value;
    radio.addEventListener("change", () => options.onChange(o.value));
    radios.set(o.value, radio);
    label.append(radio, document.createTextNode(o.label));
    group.appendChild(label);
  }
  control.appendChild(group);
  return {
    el: control,
    setValue(value) {
      for (const [v, radio] of radios) radio.checked = v === value;
    },
  };
}

/**
 * MUI Tooltip 相当（sv-tooltip）。対象要素の hover / focus で body 直下にツールチップを出す。
 * 戻り値の dispose で listener と表示中ツールチップを除去する。
 */
export function attachSvTooltip(target: HTMLElement, title: string): () => void {
  injectSpreadsheetUiStyles();
  let tip: HTMLDivElement | null = null;
  const show = (): void => {
    if (!title || tip) return;
    const r = target.getBoundingClientRect();
    tip = document.createElement("div");
    tip.className = "sv-tooltip";
    tip.setAttribute("role", "tooltip");
    tip.textContent = title;
    tip.style.top = `${r.top - 6}px`;
    tip.style.left = `${r.left + r.width / 2}px`;
    tip.style.transform = "translate(-50%, -100%)";
    document.body.appendChild(tip);
  };
  const hide = (): void => {
    tip?.remove();
    tip = null;
  };
  target.addEventListener("mouseenter", show);
  target.addEventListener("mouseleave", hide);
  target.addEventListener("focus", show, true);
  target.addEventListener("blur", hide, true);
  return () => {
    hide();
    target.removeEventListener("mouseenter", show);
    target.removeEventListener("mouseleave", hide);
    target.removeEventListener("focus", show, true);
    target.removeEventListener("blur", hide, true);
  };
}
