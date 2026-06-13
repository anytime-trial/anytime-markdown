/**
 * MUI Slider / ui/Slider.tsx の vanilla DOM 置換（graph-viewer 専用）。
 *
 * 単一値（number）と範囲（number[]、dual-thumb）の両対応。
 * gv-slider / gv-slider-range クラスは injectStyles.ts で定義済みを流用する。
 */

import { injectGraphUiStyles } from '../ui/injectStyles';
import { applyStyle } from './dom';

// --- 単一 Slider -------------------------------------------------------------

/** {@link createSlider} のオプション。ui/Slider.tsx の SliderProps 相当（単一値モード）。 */
export interface CreateSliderOptions {
  /** 現在値。 */
  readonly value: number;
  /** 値変更コールバック。引数は新しい値と元の input イベント。 */
  readonly onChange?: (value: number, event: Event) => void;
  /** 下限（既定 0）。 */
  readonly min?: number;
  /** 上限（既定 100）。 */
  readonly max?: number;
  /** ステップ（既定 1）。 */
  readonly step?: number;
  /** サイズ（small で gv-slider--small を付与）。既定 "medium"。 */
  readonly size?: 'small' | 'medium';
  /** 無効状態。 */
  readonly disabled?: boolean;
  /** root への追加スタイル。 */
  readonly style?: Partial<CSSStyleDeclaration>;
  /** root への追加クラス。 */
  readonly className?: string;
  /** aria-label。 */
  readonly ariaLabel?: string;
}

/** {@link createSlider} の戻り値。 */
export interface SliderHandle {
  /** input[type=range] 要素。 */
  readonly el: HTMLInputElement;
  /** value を外部からセットする（onChange は発火しない）。 */
  setValue(v: number): void;
  /** event listener を解除する。 */
  destroy(): void;
}

/**
 * 単一値の MUI Slider vanilla 置換。
 * gv-slider クラスを使用する。
 */
export function createSlider(opts: CreateSliderOptions): SliderHandle {
  injectGraphUiStyles();

  const min = opts.min ?? 0;
  const max = opts.max ?? 100;
  const step = opts.step ?? 1;

  const classes = [
    'gv-slider',
    opts.size === 'small' ? 'gv-slider--small' : '',
    opts.className,
  ]
    .filter(Boolean)
    .join(' ');

  const el = document.createElement('input');
  el.type = 'range';
  el.className = classes;
  el.min = String(min);
  el.max = String(max);
  el.step = String(step);
  el.value = String(opts.value);
  if (opts.disabled) el.disabled = true;
  if (opts.ariaLabel != null) el.setAttribute('aria-label', opts.ariaLabel);
  applyStyle(el, opts.style);

  let changeHandler = opts.onChange;
  const onInput = (e: Event): void => {
    changeHandler?.(Number(el.value), e);
  };
  el.addEventListener('input', onInput);

  return {
    el,
    setValue(v: number): void {
      el.value = String(v);
    },
    destroy(): void {
      el.removeEventListener('input', onInput);
      changeHandler = undefined;
    },
  };
}

// --- 範囲 Slider（dual-thumb）------------------------------------------------

/** {@link createRangeSlider} のオプション。ui/Slider.tsx の SliderProps 相当（範囲モード）。 */
export interface CreateRangeSliderOptions {
  /** 現在値 [lo, hi]。 */
  readonly value: readonly [number, number];
  /** 値変更コールバック。引数は新しい [lo, hi] と元の input イベント。 */
  readonly onChange?: (value: readonly [number, number], event: Event) => void;
  /** 下限（既定 0）。 */
  readonly min?: number;
  /** 上限（既定 100）。 */
  readonly max?: number;
  /** ステップ（既定 1）。 */
  readonly step?: number;
  /** 無効状態。 */
  readonly disabled?: boolean;
  /** root（.gv-slider-range div）への追加スタイル。 */
  readonly style?: Partial<CSSStyleDeclaration>;
  /** root への追加クラス。 */
  readonly className?: string;
  /** aria-label の基底文字列（min/max サフィックスを付与）。 */
  readonly ariaLabel?: string;
}

/** {@link createRangeSlider} の戻り値。 */
export interface RangeSliderHandle {
  /** gv-slider-range コンテナ要素。 */
  readonly el: HTMLDivElement;
  /** value を外部からセットする（onChange は発火しない）。 */
  setValue(value: readonly [number, number]): void;
  /** event listener を解除する。 */
  destroy(): void;
}

/**
 * 範囲選択（dual-thumb）の MUI Slider vanilla 置換。
 * gv-slider-range クラスを使用する。
 */
export function createRangeSlider(opts: CreateRangeSliderOptions): RangeSliderHandle {
  injectGraphUiStyles();

  const min = opts.min ?? 0;
  const max = opts.max ?? 100;
  const step = opts.step ?? 1;
  const span = max - min || 1;

  let [lo, hi] = opts.value;

  const rootClasses = ['gv-slider-range', opts.className].filter(Boolean).join(' ');

  const el = document.createElement('div');
  el.className = rootClasses;
  applyStyle(el, opts.style);

  const track = document.createElement('div');
  track.className = 'gv-slider-range__track';
  el.appendChild(track);

  const fill = document.createElement('div');
  fill.className = 'gv-slider-range__fill';
  el.appendChild(fill);

  const inputLo = document.createElement('input');
  inputLo.type = 'range';
  inputLo.min = String(min);
  inputLo.max = String(max);
  inputLo.step = String(step);
  inputLo.value = String(lo);
  if (opts.disabled) inputLo.disabled = true;
  inputLo.setAttribute(
    'aria-label',
    opts.ariaLabel != null ? `${opts.ariaLabel} min` : 'minimum',
  );
  el.appendChild(inputLo);

  const inputHi = document.createElement('input');
  inputHi.type = 'range';
  inputHi.min = String(min);
  inputHi.max = String(max);
  inputHi.step = String(step);
  inputHi.value = String(hi);
  if (opts.disabled) inputHi.disabled = true;
  inputHi.setAttribute(
    'aria-label',
    opts.ariaLabel != null ? `${opts.ariaLabel} max` : 'maximum',
  );
  el.appendChild(inputHi);

  const applyFill = (): void => {
    const fillLeft = ((lo - min) / span) * 100;
    const fillRight = ((hi - min) / span) * 100;
    fill.style.left = `${fillLeft}%`;
    fill.style.width = `${fillRight - fillLeft}%`;
  };
  applyFill();

  let changeHandler = opts.onChange;

  const onLoInput = (e: Event): void => {
    lo = Math.min(Number(inputLo.value), hi);
    inputLo.value = String(lo);
    applyFill();
    changeHandler?.([lo, hi], e);
  };
  const onHiInput = (e: Event): void => {
    hi = Math.max(Number(inputHi.value), lo);
    inputHi.value = String(hi);
    applyFill();
    changeHandler?.([lo, hi], e);
  };

  inputLo.addEventListener('input', onLoInput);
  inputHi.addEventListener('input', onHiInput);

  return {
    el,
    setValue(value: readonly [number, number]): void {
      [lo, hi] = value;
      inputLo.value = String(lo);
      inputHi.value = String(hi);
      applyFill();
    },
    destroy(): void {
      inputLo.removeEventListener('input', onLoInput);
      inputHi.removeEventListener('input', onHiInput);
      changeHandler = undefined;
    },
  };
}
