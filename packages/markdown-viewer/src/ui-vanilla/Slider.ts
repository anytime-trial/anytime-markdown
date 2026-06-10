/**
 * 脱React の vanilla DOM Slider ファクトリ（ui/Slider.tsx + Slider.module.css の素 DOM 版）。
 *
 * MUI Slider（単一つまみ）相当。native `input[type=range]` + gradient track で rail / track /
 * thumb を再現する。fill（track の埋まり率）は `--slider-fill` CSS 変数を inline 指定し、
 * `input` イベントで再計算する（WebKit の runnable-track linear-gradient が追従する）。
 * テーマ色は `--am-color-*` CSS 変数（applyEditorThemeCssVars 注入）で追従し、useIsDark 等の
 * React hook には依存しない。React / MUI を import しない。
 *
 * ui/Slider.module.css の `::-webkit-slider-*` / `::-moz-range-*` 等の擬似要素はインライン
 * スタイルでは指定できないため、ProgressBar.ts と同様に同等の CSS を初回生成時に
 * `document.head` へ一度だけ注入する（冪等）。
 */

import { applyStyle, ensureStyle } from "./dom";

/** 注入済みフラグ用の style 要素 id（冪等注入のため）。 */
const STYLE_ID = "am-vanilla-slider-styles";

/** root（input）に付与する素クラス（CSS Modules ではない）。 */
const ROOT_CLASS = "am-vanilla-slider";
const SMALL_CLASS = "am-vanilla-slider-small";
const MEDIUM_CLASS = "am-vanilla-slider-medium";

/**
 * Slider のスタイル（rail / track / thumb / focus）を document.head に一度だけ注入する。
 * ui/Slider.module.css の .slider / 擬似要素を一字一句相当で再現する。
 */
function ensureStyles(): void {
  const FILL = "var(--slider-fill, 0%)";
  const FOCUS_RING =
    "box-shadow:0 0 0 8px color-mix(in srgb, var(--am-color-primary-main) 16%, transparent);";
  const THUMB =
    "width:12px;height:12px;border:none;border-radius:50%;" +
    "background:var(--am-color-primary-main);" +
    "transition:box-shadow var(--am-duration-fast) var(--am-ease-standard);";
  ensureStyle(STYLE_ID, [
    // .slider（root）。つまみが上下にはみ出す分の padding を含む。
    `.${ROOT_CLASS}{-webkit-appearance:none;appearance:none;width:100%;`,
    `background:transparent;cursor:pointer;margin:0;padding:11px 0;}`,
    `.${ROOT_CLASS}:focus{outline:none;}`,
    // track（runnable track）に rail + fill のグラデーション（WebKit）。
    `.${ROOT_CLASS}::-webkit-slider-runnable-track{height:2px;border-radius:1px;`,
    `background:linear-gradient(to right,`,
    `var(--am-color-primary-main) ${FILL},`,
    `var(--am-color-slider-rail) ${FILL});}`,
    // track / progress（Firefox）。
    `.${ROOT_CLASS}::-moz-range-track{height:2px;border-radius:1px;`,
    `background:var(--am-color-slider-rail);}`,
    `.${ROOT_CLASS}::-moz-range-progress{height:2px;border-radius:1px;`,
    `background:var(--am-color-primary-main);}`,
    // thumb（WebKit）。(track 2px - thumb 12px) / 2 = -5px で track 中央に揃える。
    `.${ROOT_CLASS}::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;`,
    `margin-top:-5px;${THUMB}}`,
    // thumb（Firefox）。
    `.${ROOT_CLASS}::-moz-range-thumb{${THUMB}}`,
    // focus-visible リング。
    `.${ROOT_CLASS}:focus-visible::-webkit-slider-thumb{${FOCUS_RING}}`,
    `.${ROOT_CLASS}:focus-visible::-moz-range-thumb{${FOCUS_RING}}`,
  ].join(""));
}

export type SliderSize = "small" | "medium";

/** vanilla Slider の生成オプション（ui/Slider.tsx の SliderProps 相当）。 */
export interface CreateSliderOptions {
  /** 現在値。 */
  value: number;
  /** 値変更時のコールバック（input イベント発火ごと）。 */
  onChange?: (value: number, event: Event) => void;
  /** 下限（既定 0）。 */
  min?: number;
  /** 上限（既定 100）。 */
  max?: number;
  /** ステップ（既定 1）。 */
  step?: number;
  /** サイズ（small / medium。既定 medium）。 */
  size?: SliderSize;
  /** root input に追加付与するクラス名。 */
  className?: string;
  /** root へ適用する追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
  /** a11y ラベル（aria-label）。 */
  ariaLabel?: string;
  /** a11y 値テキスト（aria-valuetext）。 */
  ariaValueText?: string;
}

/** {@link createSlider} の戻り値。 */
export interface SliderHandle {
  el: HTMLInputElement;
  update: (next: Partial<CreateSliderOptions>) => void;
  destroy: () => void;
}

/** value / min / max から fill 率（0–100%）を算出する。 */
function computeFill(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  const ratio = ((value - min) / (max - min)) * 100;
  return Math.min(100, Math.max(0, ratio));
}

/**
 * MUI Slider（単一つまみ）相当の vanilla Slider を生成する。
 * 戻り値の `update` で value / min / max / step / size / className / style / aria 属性 /
 * onChange を変更できる。`destroy` で input listener を解除する。
 */
export function createSlider(opts: CreateSliderOptions): SliderHandle {
  ensureStyles();

  let min = opts.min ?? 0;
  let max = opts.max ?? 100;
  let value = opts.value;
  let size: SliderSize = opts.size ?? "medium";
  let className = opts.className;
  let changeHandler = opts.onChange;

  const el = document.createElement("input");
  el.type = "range";

  const applyClass = (): void => {
    const sizeClass = size === "small" ? SMALL_CLASS : MEDIUM_CLASS;
    el.className = [ROOT_CLASS, sizeClass, className].filter(Boolean).join(" ");
  };

  /** value / min / max から fill を再計算して --slider-fill に反映する。 */
  const applyFill = (): void => {
    const fill = computeFill(value, min, max);
    el.style.setProperty("--slider-fill", `${fill}%`);
  };

  el.min = String(min);
  el.max = String(max);
  el.step = String(opts.step ?? 1);
  el.value = String(value);
  applyClass();
  if (opts.style) applyStyle(el, opts.style);
  if (opts.ariaLabel !== undefined) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.ariaValueText !== undefined) el.setAttribute("aria-valuetext", opts.ariaValueText);
  applyFill();

  // input イベントで内部 value を更新し fill を追従、onChange を発火する。
  const onInput = (event: Event): void => {
    value = Number(el.value);
    applyFill();
    changeHandler?.(value, event);
  };
  el.addEventListener("input", onInput);

  return {
    el,
    update(next: Partial<CreateSliderOptions>) {
      let needsFill = false;
      if (next.min !== undefined) {
        min = next.min;
        el.min = String(min);
        needsFill = true;
      }
      if (next.max !== undefined) {
        max = next.max;
        el.max = String(max);
        needsFill = true;
      }
      if (next.step !== undefined) el.step = String(next.step);
      if (next.value !== undefined) {
        value = next.value;
        el.value = String(value);
        needsFill = true;
      }
      if (next.className !== undefined) className = next.className;
      if (next.size !== undefined) size = next.size;
      if (next.size !== undefined || next.className !== undefined) applyClass();
      if (next.style !== undefined) applyStyle(el, next.style);
      if (next.ariaLabel !== undefined) el.setAttribute("aria-label", next.ariaLabel);
      if (next.ariaValueText !== undefined) {
        el.setAttribute("aria-valuetext", next.ariaValueText);
      }
      if (next.onChange !== undefined) changeHandler = next.onChange;
      if (needsFill) applyFill();
    },
    destroy() {
      el.removeEventListener("input", onInput);
      changeHandler = undefined;
    },
  };
}
