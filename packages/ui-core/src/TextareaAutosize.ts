/**
 * 脱React の vanilla DOM ファクトリ — TextareaAutosize（MUI TextareaAutosize /
 * `trail-viewer/src/ui/TextareaAutosize.tsx` 置換）。
 *
 * 内容に応じて minRows〜maxRows の範囲で高さを自動調整する `<textarea>`。
 * `input` イベントで scrollHeight を再計算し高さを更新する。
 * テーマ色は持たない（純フォーム部品）。
 */

import { applyStyle, type VanillaContent } from "./dom";

/** {@link createTextareaAutosize} のオプション。React 版 TextareaAutosizeProps の vanilla 再現範囲。 */
export interface CreateTextareaAutosizeOptions {
  /** 初期値。 */
  value?: string;
  /** placeholder 属性。 */
  placeholder?: string;
  /** 最小行数（既定 1）。 */
  minRows?: number;
  /** 最大行数（未指定は無制限）。 */
  maxRows?: number;
  /** 値変化コールバック。 */
  onChange?: (value: string) => void;
  /** 無効状態。 */
  disabled?: boolean;
  /** 追加クラス名。 */
  className?: string;
  /** 追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
  /** aria-label。 */
  ariaLabel?: string;
  /** data-testid 属性。 */
  testId?: string;
  // children は textarea には不適用のため省略。
}

/**
 * TextareaAutosize（高さ自動調整 textarea）を生成する。
 *
 * @returns `el`（textarea 要素）と `setValue`（プログラム的な値更新＋高さ再計算）/
 *   `destroy`（listener 削除）。
 */
export function createTextareaAutosize(opts: CreateTextareaAutosizeOptions = {}): {
  el: HTMLTextAreaElement;
  setValue(v: string): void;
  destroy(): void;
} {
  const minRows = opts.minRows ?? 1;
  const maxRows = opts.maxRows;

  const el = document.createElement("textarea");
  el.style.cssText =
    "box-sizing:border-box;width:100%;resize:none;overflow:hidden;" +
    "font-family:inherit;font-size:inherit;line-height:inherit;";
  applyStyle(el, opts.style);

  el.rows = minRows;
  if (opts.value !== undefined) el.value = opts.value;
  if (opts.placeholder) el.placeholder = opts.placeholder;
  if (opts.disabled) el.disabled = true;
  if (opts.className) el.className = opts.className;
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.testId) el.setAttribute("data-testid", opts.testId);

  /** scrollHeight ベースで高さを再計算し el.style.height を更新する。 */
  const resize = (): void => {
    const cs = globalThis.getComputedStyle(el);
    const lineHeight = Number.parseFloat(cs.lineHeight) || 18;
    const paddingY = Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom);
    const borderY =
      Number.parseFloat(cs.borderTopWidth) + Number.parseFloat(cs.borderBottomWidth);
    const extra = paddingY + borderY;

    el.style.height = "auto";
    let next = el.scrollHeight;
    const min = minRows * lineHeight + extra;
    if (next < min) next = min;
    if (maxRows !== undefined) {
      const max = maxRows * lineHeight + extra;
      if (next > max) {
        next = max;
        el.style.overflow = "auto";
      } else {
        el.style.overflow = "hidden";
      }
    }
    el.style.height = `${next}px`;
  };

  let changeHandler = opts.onChange;

  const onInput = (): void => {
    resize();
    changeHandler?.(el.value);
  };
  el.addEventListener("input", onInput);

  // 初期高さ計算（layout が確定していない場合は no-op になるが副作用なし）。
  resize();

  return {
    el,
    setValue(v: string): void {
      el.value = v;
      resize();
    },
    destroy(): void {
      el.removeEventListener("input", onInput);
      changeHandler = undefined;
    },
  };
}
