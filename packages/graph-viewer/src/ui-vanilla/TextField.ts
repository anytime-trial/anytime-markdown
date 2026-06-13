/**
 * MUI TextField / ui/TextField.tsx の vanilla DOM 置換（graph-viewer 専用）。
 *
 * 単一行 input（select モードを含む）のファクトリ。
 * gv-textfield / gv-select クラスは injectStyles.ts で定義済みを流用する。
 */

import { injectGraphUiStyles } from '../ui/injectStyles';
import { appendContent, applyStyle, type VanillaContent } from './dom';

/** {@link createTextField} のオプション。ui/TextField.tsx の TextFieldProps 相当。 */
export interface CreateTextFieldOptions {
  /** 初期値。 */
  readonly value?: string | number;
  /** 変更コールバック（input / change イベント）。 */
  readonly onChange?: (event: Event) => void;
  /** MUI 互換サイズ（現実装ではスタイル差異なし、将来拡張用）。 */
  readonly size?: 'small' | 'medium';
  /** 幅 100%。 */
  readonly fullWidth?: boolean;
  /** native `<select>` として描画する。 */
  readonly select?: boolean;
  /** select モードの `<option>` 子要素。 */
  readonly children?: VanillaContent;
  /**
   * input の追加属性（min / max / step 等）。
   * ui/TextField.tsx の slotProps.htmlInput 相当。
   */
  readonly inputAttrs?: Readonly<Record<string, string>>;
  /** 無効状態。 */
  readonly disabled?: boolean;
  /** root への追加スタイル。 */
  readonly style?: Partial<CSSStyleDeclaration>;
  /** root への追加クラス。 */
  readonly className?: string;
  /** input の type（select=false 時のみ有効）。既定 "text"。 */
  readonly type?: string;
  /** placeholder。 */
  readonly placeholder?: string;
}

/** {@link createTextField} の戻り値。 */
export interface TextFieldHandle {
  /** root 要素（input または select）。 */
  readonly el: HTMLInputElement | HTMLSelectElement;
  /**
   * 現在の value を返す。
   * input は string、select も string（selectedOptions[0].value 相当）。
   */
  getValue(): string;
  /** value を外部からセットする。 */
  setValue(v: string | number): void;
  /** event listener を解除する。 */
  destroy(): void;
}

/**
 * MUI TextField の vanilla 置換（graph-viewer 専用）。
 *
 * select=true のとき `<select>` 要素、そうでなければ `<input>` 要素を生成する。
 * children（`<option>` 群）は select モードのみ有効。
 */
export function createTextField(opts: CreateTextFieldOptions = {}): TextFieldHandle {
  injectGraphUiStyles();

  const composed: Partial<CSSStyleDeclaration> = {};
  if (opts.fullWidth) composed.width = '100%';
  if (opts.style) {
    for (const [k, v] of Object.entries(opts.style)) {
      if (v != null) (composed as Record<string, string>)[k] = String(v);
    }
  }

  if (opts.select) {
    // --- <select> モード ---
    const classes = ['gv-textfield', 'gv-select', opts.className].filter(Boolean).join(' ');
    const el = document.createElement('select');
    el.className = classes;
    if (opts.value != null) el.value = String(opts.value);
    if (opts.disabled) el.disabled = true;
    applyStyle(el, composed);
    appendContent(el, opts.children);

    let changeHandler = opts.onChange;
    if (changeHandler) el.addEventListener('change', changeHandler);

    return {
      el,
      getValue(): string {
        return el.value;
      },
      setValue(v: string | number): void {
        el.value = String(v);
      },
      destroy(): void {
        if (changeHandler) el.removeEventListener('change', changeHandler);
        changeHandler = undefined;
      },
    };
  }

  // --- <input> モード ---
  const classes = ['gv-textfield', opts.className].filter(Boolean).join(' ');
  const el = document.createElement('input');
  el.className = classes;
  el.type = opts.type ?? 'text';
  if (opts.value != null) el.value = String(opts.value);
  if (opts.disabled) el.disabled = true;
  if (opts.placeholder != null) el.placeholder = opts.placeholder;
  applyStyle(el, composed);

  if (opts.inputAttrs) {
    for (const [k, v] of Object.entries(opts.inputAttrs)) {
      el.setAttribute(k, v);
    }
  }

  let changeHandler = opts.onChange;
  if (changeHandler) el.addEventListener('input', changeHandler);

  return {
    el,
    getValue(): string {
      return el.value;
    },
    setValue(v: string | number): void {
      el.value = String(v);
    },
    destroy(): void {
      if (changeHandler) el.removeEventListener('input', changeHandler);
      changeHandler = undefined;
    },
  };
}
