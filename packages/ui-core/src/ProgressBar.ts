/**
 * 脱React の vanilla DOM ProgressBar ファクトリ（ui/ProgressBar.tsx の素 DOM 版）。
 *
 * MUI LinearProgress 相当。`determinate`（value%）と `indeterminate` に対応する。
 * - determinate: bar を translateX(value-100%) でずらして進捗を表現し、
 *   role=progressbar に aria-valuenow/min/max を付与する。
 * - indeterminate: CSS keyframes（progress-indeterminate）で bar を往復させる。
 *
 * テーマ色は `--am-color-*` CSS 変数（applyEditorThemeCssVars 注入）で追従し、
 * useIsDark 等の React hook には依存しない。React / MUI を import しない。
 *
 * ui/ProgressBar.module.css の keyframes（progress-indeterminate）はモジュール CSS のため
 * vanilla 環境では利用できない。本モジュールは同等の keyframes・基本スタイルを初回生成時に
 * `document.head` へ一度だけ注入する（冪等）。
 */

import { applyStyle, ensureStyle } from "./dom";

/** 注入済みフラグ用の style 要素 id（冪等注入のため）。 */
const STYLE_ID = "am-vanilla-progressbar-keyframes";

/** root（トラック）と bar に付与するクラス名。CSS Modules ではなく素クラス。 */
const ROOT_CLASS = "am-vanilla-progressbar";
const BAR_CLASS = "am-vanilla-progressbar-bar";
const DETERMINATE_CLASS = "am-vanilla-progressbar-determinate";
const INDETERMINATE_CLASS = "am-vanilla-progressbar-indeterminate";

/**
 * keyframes / 基本スタイルを document.head に一度だけ注入する。
 * ui/ProgressBar.module.css と同一の .root / .bar / keyframes を再現する。
 */
function ensureKeyframes(): void {
  ensureStyle(STYLE_ID, [
    // .root（MUI LinearProgress 相当。height 4px・トラック地に bar を重ねる）。
    `.${ROOT_CLASS}{position:relative;overflow:hidden;display:block;height:4px;`,
    `background-color:var(--am-color-divider);}`,
    // .bar。
    `.${BAR_CLASS}{position:absolute;inset:0;width:100%;transform-origin:left;`,
    `background-color:var(--am-color-primary-main);}`,
    // .determinate。
    `.${DETERMINATE_CLASS}{transition:transform 0.4s linear;}`,
    // .indeterminate。
    `.${INDETERMINATE_CLASS}{`,
    `animation:am-progress-indeterminate 2.1s cubic-bezier(0.65,0.815,0.735,0.395) infinite;}`,
    `@keyframes am-progress-indeterminate{`,
    `0%{transform:translateX(-100%);}`,
    `60%{transform:translateX(100%);}`,
    `100%{transform:translateX(100%);}}`,
    `@media (prefers-reduced-motion:reduce){`,
    `.${INDETERMINATE_CLASS}{animation-duration:6s;}}`,
  ].join(""));
}

export type ProgressBarVariant = "determinate" | "indeterminate";

/** vanilla ProgressBar の生成オプション（ui/ProgressBar.tsx の ProgressBarProps 相当）。 */
export interface CreateProgressBarOptions {
  /** determinate=value% / indeterminate=往復アニメ。既定 indeterminate。 */
  variant?: ProgressBarVariant;
  /** determinate 時の進捗（0–100）。既定 0。 */
  value?: number;
  /** root span に追加付与するクラス名。 */
  className?: string;
  /** root へ適用する追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
  /** a11y ラベル（aria-label）。 */
  ariaLabel?: string;
}

/** {@link createProgressBar} の戻り値。 */
export interface ProgressBarHandle {
  el: HTMLSpanElement;
  update: (next: Partial<CreateProgressBarOptions>) => void;
}

/** value を 0–100 にクランプして四捨五入する。 */
function clampValue(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)));
}

/**
 * MUI LinearProgress 相当の vanilla ProgressBar を生成する。
 * 戻り値の `update` で variant / value / className / style / ariaLabel を変更できる。
 * keyframes 注入は冪等なため `destroy` は不要（DOM 要素の除去は呼び元が実施）。
 */
export function createProgressBar(opts: CreateProgressBarOptions = {}): ProgressBarHandle {
  ensureKeyframes();

  let variant: ProgressBarVariant = opts.variant ?? "indeterminate";
  let value = opts.value ?? 0;

  const el = document.createElement("span");
  el.setAttribute("role", "progressbar");
  if (opts.ariaLabel !== undefined) el.setAttribute("aria-label", opts.ariaLabel);

  const bar = document.createElement("span");

  const applyClass = (extra: string | undefined): void => {
    el.className = [ROOT_CLASS, extra].filter(Boolean).join(" ");
  };

  /** variant / value から bar クラス・transform・root の aria 属性を反映する。 */
  const applyVariant = (v: ProgressBarVariant, val: number): void => {
    const determinate = v === "determinate";
    bar.className = [BAR_CLASS, determinate ? DETERMINATE_CLASS : INDETERMINATE_CLASS].join(" ");
    if (determinate) {
      const clamped = clampValue(val);
      bar.style.transform = `translateX(${clamped - 100}%)`;
      el.setAttribute("aria-valuenow", String(clamped));
      el.setAttribute("aria-valuemin", "0");
      el.setAttribute("aria-valuemax", "100");
    } else {
      bar.style.transform = "";
      el.removeAttribute("aria-valuenow");
      el.removeAttribute("aria-valuemin");
      el.removeAttribute("aria-valuemax");
    }
  };

  applyClass(opts.className);
  applyStyle(el, opts.style);
  applyVariant(variant, value);

  el.appendChild(bar);

  return {
    el,
    update(next: Partial<CreateProgressBarOptions>) {
      const variantChanged = next.variant !== undefined && next.variant !== variant;
      const valueChanged = next.value !== undefined && next.value !== value;
      if (next.variant !== undefined) variant = next.variant;
      if (next.value !== undefined) value = next.value;
      if (variantChanged || valueChanged) applyVariant(variant, value);
      if (next.className !== undefined) applyClass(next.className);
      applyStyle(el, next.style);
      if (next.ariaLabel !== undefined) el.setAttribute("aria-label", next.ariaLabel);
    },
  };
}
