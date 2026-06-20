/**
 * 脱React の vanilla DOM Switch ファクトリ（MUI Switch(size="small") / ui/Switch.tsx 置換）。
 *
 * 既存 React 実装 `ui/Switch.tsx`（+ `Switch.module.css`）の見た目・API・a11y を素 DOM で再現する。
 * 構造は track + switchBase(thumb) + 全面を覆う透明 checkbox（クリックターゲット）の 3 パーツ。
 * 実測幾何（root 40x24 / track 26x10 inset7 radius7 / switchBase 24x24 padding4 / thumb 16x16 /
 * checked translateX16）を再現する。off/on の色は seam トークン
 * （--am-color-switch-* / --am-switch-* / --am-color-primary-main / --am-color-action-hover）。
 * React hook（useIsDark 等）には依存しない。`Button.ts` の cssText + addEventListener パターンに揃える。
 */

import { applyStyle } from "./dom";

/** vanilla Switch のオプション。React `SwitchProps` のうち vanilla で再現する範囲。 */
export interface CreateSwitchOptions {
  /** チェック状態。 */
  checked?: boolean;
  /** 変更ハンドラ（change イベント。新しい checked 値と元イベントを渡す）。 */
  onChange?: (checked: boolean, event: Event) => void;
  /** disabled 状態。 */
  disabled?: boolean;
  /** input の role 属性（MUI slotProps.input 相当。既定では未設定）。 */
  role?: string;
  /** input の aria-label。 */
  ariaLabel?: string;
  /** input の aria-labelledby。 */
  ariaLabelledBy?: string;
  /** root への追加クラス名。 */
  className?: string;
  /** data-testid 属性（root に付与）。 */
  testId?: string;
  /** root への追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
}

// root: inline-flex 40x24 の相対配置コンテナ。
const ROOT_CSS =
  "display:inline-flex;position:relative;width:40px;height:24px;" +
  "flex-shrink:0;box-sizing:border-box;vertical-align:middle;";

// track: 絶対配置 26x10 inset7 radius7。背景・opacity は checked で切替。
const TRACK_BASE_CSS =
  "position:absolute;top:7px;left:7px;width:26px;height:10px;border-radius:7px;" +
  "transition:opacity var(--am-duration-fast) var(--am-ease-standard)," +
  "background-color var(--am-duration-fast) var(--am-ease-standard);";

const TRACK_OFF_CSS =
  "background-color:var(--am-color-switch-track-off);" +
  "opacity:var(--am-switch-track-opacity-off);";

const TRACK_ON_CSS =
  "background-color:var(--am-color-primary-main);opacity:0.5;";

// switchBase: 絶対配置 padding4 z1。checked で translateX16 + 色を primary に。
const SWITCH_BASE_CSS =
  "position:absolute;top:0;left:0;padding:4px;z-index:1;" +
  "transition:transform var(--am-duration-fast) var(--am-ease-standard);";

const SWITCH_BASE_OFF_CSS = "color:var(--am-color-switch-thumb-off);transform:none;";

const SWITCH_BASE_ON_CSS = "color:var(--am-color-primary-main);transform:translateX(16px);";

// thumb: 16x16 円形。currentColor で switchBase の色を継承。MUI elevation 1。
const THUMB_CSS =
  "display:block;width:16px;height:16px;border-radius:50%;background-color:currentColor;" +
  "box-shadow:0 2px 1px -1px rgba(0,0,0,0.2),0 1px 1px 0 rgba(0,0,0,0.14)," +
  "0 1px 3px 0 rgba(0,0,0,0.12);";

// input: root 全体を覆う透明 checkbox（クリックターゲット）。
const INPUT_CSS =
  "position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;" +
  "opacity:0;cursor:pointer;z-index:2;";

/**
 * vanilla Switch を生成する。
 *
 * 構造は `<span root>` 内に switchBase(thumb) → track → input(checkbox) の順。MUI の
 * `.checked ~ .track` セレクタ（switchBase の後続 sibling で on track 色を出す）に対応して、
 * checked 切替時は switchBase / track 双方の cssText を JS で同期する。
 *
 * @returns `el`（root span）と `update`（可変プロパティ反映）/ `destroy`（listener 削除）。
 */
export function createSwitch(opts: CreateSwitchOptions = {}): {
  el: HTMLSpanElement;
  /** 現在の input 要素（フォーカス制御等に使う）。 */
  input: HTMLInputElement;
  update: (next: Partial<CreateSwitchOptions>) => void;
  destroy: () => void;
} {
  let checked = opts.checked ?? false;

  const el = document.createElement("span");
  el.style.cssText = ROOT_CSS;
  if (opts.className) el.className = opts.className;
  if (opts.testId) el.setAttribute("data-testid", opts.testId);
  applyStyle(el, opts.style);

  const switchBase = document.createElement("span");
  const track = document.createElement("span");
  const thumb = document.createElement("span");
  thumb.style.cssText = THUMB_CSS;
  switchBase.appendChild(thumb);

  const input = document.createElement("input");
  input.type = "checkbox";
  input.style.cssText = INPUT_CSS;
  input.checked = checked;
  if (opts.disabled) input.disabled = true;
  if (opts.role) input.setAttribute("role", opts.role);
  if (opts.ariaLabel) input.setAttribute("aria-label", opts.ariaLabel);
  if (opts.ariaLabelledBy) input.setAttribute("aria-labelledby", opts.ariaLabelledBy);

  /** checked に応じて switchBase / track / input の表示を同期する。 */
  const applyChecked = (next: boolean): void => {
    switchBase.style.cssText = SWITCH_BASE_CSS + (next ? SWITCH_BASE_ON_CSS : SWITCH_BASE_OFF_CSS);
    track.style.cssText = TRACK_BASE_CSS + (next ? TRACK_ON_CSS : TRACK_OFF_CSS);
    input.checked = next;
    el.setAttribute("data-checked", next ? "true" : "false");
  };
  applyChecked(checked);

  // React 実装の DOM 順（switchBase → track → input）に一致。
  el.appendChild(switchBase);
  el.appendChild(track);
  el.appendChild(input);

  let changeHandler = opts.onChange;
  const onChange = (event: Event): void => {
    checked = input.checked;
    applyChecked(checked);
    changeHandler?.(checked, event);
  };
  input.addEventListener("change", onChange);

  return {
    el,
    input,
    update(next: Partial<CreateSwitchOptions>) {
      if (next.checked !== undefined) {
        checked = next.checked;
        applyChecked(checked);
      }
      if (next.disabled !== undefined) input.disabled = next.disabled;
      if (next.role !== undefined) {
        if (next.role) input.setAttribute("role", next.role);
        else input.removeAttribute("role");
      }
      if (next.ariaLabel !== undefined) {
        if (next.ariaLabel) input.setAttribute("aria-label", next.ariaLabel);
        else input.removeAttribute("aria-label");
      }
      if (next.ariaLabelledBy !== undefined) {
        if (next.ariaLabelledBy) input.setAttribute("aria-labelledby", next.ariaLabelledBy);
        else input.removeAttribute("aria-labelledby");
      }
      if (next.className !== undefined) el.className = next.className;
      if (next.onChange !== undefined) changeHandler = next.onChange;
    },
    destroy() {
      input.removeEventListener("change", onChange);
      changeHandler = undefined;
    },
  };
}
