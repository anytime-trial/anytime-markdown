/**
 * 脱React の vanilla DOM Checkbox ファクトリ（MUI Checkbox / `trail-viewer/src/ui/Checkbox.tsx` 置換）。
 *
 * 構造は `<span root>` 内に hidden checkbox input + SVG アイコン（unchecked / checked / indeterminate
 * の 3 状態）。checked / indeterminate / disabled で SVG path と input.checked を同期する。
 * テーマ色は `--am-color-primary-main`（on 状態）・`--am-color-text-secondary`（off 状態）で追従し、
 * React hook（useIsDark 等）には依存しない。
 */

import { applyStyle, svgIcon } from "./dom";

// SVG パス定数（MUI Material Icons に一致する d 属性）。
const PATH_UNCHECKED =
  "M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z";
const PATH_CHECKED =
  "M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z";
const PATH_INDETERMINATE =
  "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z";

/** createCheckbox のオプション。`ui/Checkbox.tsx` の CheckboxProps に対応する範囲。 */
export interface CreateCheckboxOptions {
  /** チェック状態。 */
  checked?: boolean;
  /** 不確定状態（checked より優先して indeterminate アイコンを表示）。 */
  indeterminate?: boolean;
  /** disabled 状態。 */
  disabled?: boolean;
  /** 変更ハンドラ（change イベント。新しい checked 値を渡す）。 */
  onChange?: (checked: boolean) => void;
  /** input の name 属性。 */
  name?: string;
  /** input の value 属性。 */
  value?: string;
  /** root への追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
}

// root: inline-flex の相対配置コンテナ。
const ROOT_BASE_CSS =
  "display:inline-flex;position:relative;align-items:center;justify-content:center;" +
  "box-sizing:border-box;padding:9px;flex-shrink:0;vertical-align:middle;cursor:pointer;" +
  "border-radius:50%;";

const ROOT_COLOR_ON_CSS = "color:var(--am-color-primary-main,#1976d2);";
const ROOT_COLOR_OFF_CSS =
  "color:var(--am-color-text-secondary,rgba(0,0,0,0.54));";
const ROOT_DISABLED_CSS = "opacity:0.38;cursor:default;";

// input: 全面を覆う透明 checkbox（クリックターゲット）。
const INPUT_CSS =
  "position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;" +
  "opacity:0;cursor:inherit;z-index:1;";

/**
 * vanilla Checkbox を生成する。
 *
 * 構造は `<span root>` 内に input(checkbox) → SVG アイコンの順。checked / indeterminate で
 * SVG path と input.checked を同期する。
 *
 * @returns `el`（root span）と `setChecked`（外部から状態を更新する）。
 */
export function createCheckbox(opts: CreateCheckboxOptions = {}): {
  el: HTMLSpanElement;
  /** 外部から checked 状態を更新する。indeterminate は opts 初期値を引き継ぐ。 */
  setChecked: (checked: boolean) => void;
  /** change リスナーを除去してリソースを解放する。 */
  destroy: () => void;
} {
  let checked = opts.checked ?? false;
  let indeterminate = opts.indeterminate ?? false;
  let changeHandler = opts.onChange;

  const el = document.createElement("span");

  // SVG アイコン（path を差し替えて状態を反映する）。
  const icon = svgIcon(PATH_UNCHECKED, 20);
  const iconPath = icon.querySelector("path")!;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.style.cssText = INPUT_CSS;
  if (opts.disabled) input.disabled = true;
  if (opts.name !== undefined) input.name = opts.name;
  if (opts.value !== undefined) input.value = opts.value;

  /** checked / indeterminate に応じて root 色・SVG path・input.checked を同期する。 */
  const applyState = (nextChecked: boolean, nextIndeterminate: boolean): void => {
    const isOn = nextChecked || nextIndeterminate;
    const disabledCss = opts.disabled ? ROOT_DISABLED_CSS : "";
    el.style.cssText = ROOT_BASE_CSS + (isOn ? ROOT_COLOR_ON_CSS : ROOT_COLOR_OFF_CSS) + disabledCss;
    // opts.style は cssText 上書き後に再適用する（Switch / Radio と同じパターン）。
    applyStyle(el, opts.style);
    if (nextIndeterminate) {
      iconPath.setAttribute("d", PATH_INDETERMINATE);
    } else if (nextChecked) {
      iconPath.setAttribute("d", PATH_CHECKED);
    } else {
      iconPath.setAttribute("d", PATH_UNCHECKED);
    }
    input.checked = nextIndeterminate ? false : nextChecked;
    el.setAttribute("data-checked", nextChecked ? "true" : "false");
    el.setAttribute("data-indeterminate", nextIndeterminate ? "true" : "false");
  };
  applyState(checked, indeterminate);

  el.appendChild(input);
  el.appendChild(icon);

  const onInputChange = (event: Event): void => {
    const target = event.target as HTMLInputElement;
    checked = target.checked;
    indeterminate = false;
    applyState(checked, indeterminate);
    changeHandler?.(checked);
  };
  input.addEventListener("change", onInputChange);

  return {
    el,
    setChecked(nextChecked: boolean): void {
      checked = nextChecked;
      applyState(checked, indeterminate);
    },
    destroy(): void {
      input.removeEventListener("change", onInputChange);
      changeHandler = undefined;
    },
  };
}
