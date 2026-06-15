/**
 * 脱React の vanilla DOM TextField ファクトリ（Phase 3 / ホスト隔離）。
 *
 * 既存 React 実装 `ui/TextField.tsx`（+ `TextField.module.css`）の見た目・API・a11y を素 DOM で
 * 再現する。MUI TextField(outlined) 相当で、フローティングラベルは paper 地でボーダーを切り欠く。
 *
 * フォーカス状態（label shrink・border ハイライト）は CSS `:focus-within` で扱うため JS state を
 * 持たない。本ファクトリは `:focus-within` を含むルールを `<style>` で 1 度だけ注入する
 * （cssText では擬似クラスを表現できないため）。input 本体の static スタイルは cssText で適用する。
 *
 * テーマ色は `--am-color-*` / `--am-*` CSS 変数（applyEditorThemeCssVars 注入）で追従し、
 * useIsDark 等の React テーマ API には依存しない。`ui-vanilla/Button.ts` のファクトリ規約
 * （createXxx(opts) => { el, update?, destroy? }）と `ui-vanilla/Alert.ts` の cssText パターンに揃える。
 */

import { appendContent, applyStyle, ensureStyle, type VanillaContent } from "./dom";

export type TextFieldSize = "small" | "medium";

/** vanilla TextField のオプション。React `TextFieldProps` のうち vanilla で再現する範囲。 */
export interface CreateTextFieldOptions {
  /** フローティングラベル本文（string / Node / その配列）。 */
  label?: VanillaContent;
  /** 初期値。 */
  value?: string;
  /** placeholder。指定時はラベルが常に shrink する（React 実装に一致）。 */
  placeholder?: string;
  /** input type（multiline=false 時のみ有効）。既定 "text"。 */
  type?: string;
  /** textarea にする。 */
  multiline?: boolean;
  /** multiline 時の最小行数（textarea rows 属性）。 */
  minRows?: number;
  /** multiline 時の最大行数（max-height を行数換算で制限）。 */
  maxRows?: number;
  /** 必須。ラベル末尾に " *" を表示し required 属性を付与する。 */
  required?: boolean;
  /** エラー状態。枠線・ラベル・helper を error 色にする。 */
  error?: boolean;
  /** 無効状態。 */
  disabled?: boolean;
  /** マウント後にフォーカスする。 */
  autoFocus?: boolean;
  /** maxWidth まで横いっぱいに広げる。 */
  fullWidth?: boolean;
  /** サイズ。padding を変える。既定 "medium"。 */
  size?: TextFieldSize;
  /** helper text 本文（string / Node / その配列）。 */
  helperText?: VanillaContent;
  /** helper text 要素の id（aria-describedby 連携用）。 */
  helperTextId?: string;
  /** input/textarea へ直接渡す属性（aria-label 等）。 */
  inputAttrs?: Record<string, string>;
  /** root への追加クラス。 */
  className?: string;
  /** root への追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
  /** aria-describedby（helper text より優先）。 */
  ariaDescribedBy?: string;
  /** data-testid 属性（root に付与）。 */
  testId?: string;
  /** 入力イベントハンドラ。 */
  onChange?: (event: Event) => void;
  /** blur イベントハンドラ。 */
  onBlur?: (event: FocusEvent) => void;
  /** keydown イベントハンドラ。 */
  onKeyDown?: (event: KeyboardEvent) => void;
  /** click イベントハンドラ。 */
  onClick?: (event: MouseEvent) => void;
}

/** TextField ファクトリの戻り値。 */
export interface TextFieldHandle {
  /** root の `<div>` 要素。 */
  el: HTMLDivElement;
  /** input / textarea 本体（フォーカス取得・値取得用）。 */
  input: HTMLInputElement | HTMLTextAreaElement;
  /** 可変プロパティ（value / error / disabled / helperText 等）の更新。 */
  update: (opts: Partial<CreateTextFieldOptions>) => void;
  /** event listener 削除。 */
  destroy: () => void;
}

// MUI TextField のデフォルト line-height（maxRows の高さ算出に使用。React 実装と同一）。
const LINE_HEIGHT = 1.4375;

// 一意 id 採番（React useId 相当）。
let textFieldIdSeq = 0;
function nextTextFieldId(): string {
  textFieldIdSeq += 1;
  return `tf-${textFieldIdSeq}`;
}

// :focus-within を含む擬似クラスルールは cssText で表現できないため、1 度だけ <style> 注入する。
const STYLE_ELEMENT_ID = "am-vanilla-textfield-style";

/**
 * `:focus-within` / `:hover` / `::placeholder` を含むルールを `<head>` に 1 度だけ注入する。
 * TextField.module.css の擬似クラスルールに一字一句対応させる。
 */
function ensureStyleInjected(): void {
  ensureStyle(STYLE_ELEMENT_ID, `
[data-am-tf-input]::placeholder { color: var(--am-color-text-secondary); opacity: 1; }
[data-am-tf-input]:hover { border-color: var(--am-color-text-primary); }
[data-am-tf-wrap]:focus-within [data-am-tf-input] {
  border-color: var(--am-color-primary-main);
  box-shadow: inset 0 0 0 1px var(--am-color-primary-main);
}
[data-am-tf-root][data-error="true"] [data-am-tf-input] { border-color: var(--am-color-error-main); }
[data-am-tf-root][data-error="true"] [data-am-tf-wrap]:focus-within [data-am-tf-input] {
  border-color: var(--am-color-error-main);
  box-shadow: inset 0 0 0 1px var(--am-color-error-main);
}
[data-am-tf-root][data-disabled="true"] [data-am-tf-input] { opacity: 0.5; cursor: default; }
[data-am-tf-wrap]:focus-within [data-am-tf-label] {
  top: 0;
  transform: translateY(-50%) scale(0.75);
  padding: 0 4px;
  background-color: var(--am-color-bg-paper);
  max-width: calc((100% - 16px) / 0.75);
  color: var(--am-color-primary-main);
}
[data-am-tf-label][data-shrink="true"] {
  top: 0;
  transform: translateY(-50%) scale(0.75);
  padding: 0 4px;
  background-color: var(--am-color-bg-paper);
  max-width: calc((100% - 16px) / 0.75);
}
[data-am-tf-root][data-error="true"] [data-am-tf-label] { color: var(--am-color-error-main); }
[data-am-tf-root][data-error="true"] [data-am-tf-wrap]:focus-within [data-am-tf-label] {
  color: var(--am-color-error-main);
}
`.trim());
}

// root（.root / .medium）の static スタイル。size は --tf-input-pad-y を切り替える。
function rootCss(size: TextFieldSize, fullWidth: boolean): string {
  // small は 8.5px、medium は 16.5px（TextField.module.css の .root / .medium）。
  const padY = size === "medium" ? "16.5px" : "8.5px";
  const display = fullWidth ? "display:flex;width:100%;" : "display:inline-flex;";
  return (
    display +
    "flex-direction:column;" +
    "--tf-input-font-size:1rem;--tf-input-pad-x:14px;" +
    `--tf-input-pad-y:${padY};`
  );
}

// inputWrap（.inputWrap）の static スタイル。
const WRAP_CSS = "position:relative;display:flex;";

// input / textarea（.input）の static スタイル。:focus-within / :hover は <style> 側。
const INPUT_CSS =
  "box-sizing:border-box;width:100%;margin:0;font:inherit;" +
  "font-size:var(--tf-input-font-size);color:var(--am-color-text-primary);" +
  "background:transparent;border:1px solid var(--am-color-divider);" +
  "border-radius:var(--am-radius-md);" +
  "padding:var(--tf-input-pad-y) var(--tf-input-pad-x);outline:none;" +
  "transition:border-color var(--am-duration-fast) var(--am-ease-standard)," +
  "box-shadow var(--am-duration-fast) var(--am-ease-standard);";

// textarea 専用（resize:vertical）。
const TEXTAREA_EXTRA_CSS = "resize:vertical;";

// label（.label）の static スタイル。shrink / focus-within は <style> 側。
const LABEL_CSS =
  "position:absolute;left:14px;top:50%;transform:translateY(-50%);" +
  "transform-origin:left top;color:var(--am-color-text-secondary);" +
  "font-size:var(--tf-input-font-size);pointer-events:none;" +
  "transition:transform var(--am-duration-fast) var(--am-ease-standard)," +
  "color var(--am-duration-fast) var(--am-ease-standard);" +
  "max-width:calc(100% - 28px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

// helper text（.helper）の static スタイル。error は <style> 側。
const HELPER_CSS =
  "margin:3px 14px 0;font-size:0.75rem;line-height:1.66;color:var(--am-color-text-secondary);";

/**
 * 値・placeholder があるときは常に shrink（React 実装 `shrink` と同一ロジック）。
 * フォーカス時の shrink は CSS `:focus-within` が担うため、ここでは扱わない。
 */
function computeShrink(value: string | undefined, placeholder: string | undefined): boolean {
  return !!placeholder || (value !== undefined && value.length > 0);
}

/**
 * vanilla TextField を生成する。MUI TextField(outlined) の置換。
 *
 * @returns `el`（root div）/ `input`（input or textarea 本体）/ `update`（可変プロパティ反映）/
 *   `destroy`（listener 削除）。
 */
export function createTextField(opts: CreateTextFieldOptions = {}): TextFieldHandle {
  ensureStyleInjected();

  const size: TextFieldSize = opts.size ?? "medium";
  const fullWidth = opts.fullWidth ?? false;
  const multiline = opts.multiline ?? false;
  const inputId = nextTextFieldId();

  // ---- root ----
  const el = document.createElement("div");
  el.setAttribute("data-am-tf-root", "");
  el.style.cssText = rootCss(size, fullWidth);
  el.setAttribute("data-error", String(!!opts.error));
  el.setAttribute("data-disabled", String(!!opts.disabled));
  if (opts.className) el.className = opts.className;
  if (opts.testId !== undefined) el.setAttribute("data-testid", opts.testId);
  applyStyle(el, opts.style);

  // ---- inputWrap ----
  const wrap = document.createElement("div");
  wrap.setAttribute("data-am-tf-wrap", "");
  wrap.style.cssText = WRAP_CSS;

  // ---- label（任意） ----
  let labelEl: HTMLLabelElement | undefined;
  let requiredStar: HTMLSpanElement | undefined;
  if (opts.label !== undefined) {
    labelEl = document.createElement("label");
    labelEl.setAttribute("data-am-tf-label", "");
    labelEl.htmlFor = inputId;
    labelEl.style.cssText = LABEL_CSS;
    labelEl.setAttribute("data-shrink", String(computeShrink(opts.value, opts.placeholder)));
    appendContent(labelEl, opts.label);
    if (opts.required) {
      requiredStar = document.createElement("span");
      requiredStar.setAttribute("aria-hidden", "true");
      requiredStar.textContent = " *";
      labelEl.appendChild(requiredStar);
    }
    wrap.appendChild(labelEl);
  }

  // ---- input / textarea ----
  const input = multiline
    ? document.createElement("textarea")
    : document.createElement("input");
  input.setAttribute("data-am-tf-input", "");
  input.id = inputId;
  input.style.cssText = INPUT_CSS + (multiline ? TEXTAREA_EXTRA_CSS : "");

  if (!multiline) {
    (input as HTMLInputElement).type = opts.type ?? "text";
  } else {
    if (opts.minRows !== undefined) (input as HTMLTextAreaElement).rows = opts.minRows;
    if (opts.maxRows !== undefined) {
      input.style.maxHeight = `${opts.maxRows * LINE_HEIGHT}em`;
    }
  }

  if (opts.value !== undefined) input.value = opts.value;
  if (opts.placeholder !== undefined) input.placeholder = opts.placeholder;
  if (opts.required) input.required = true;
  if (opts.disabled) input.disabled = true;
  if (opts.error) input.setAttribute("aria-invalid", "true");

  // aria-describedby は明示指定 > helper text id（React 実装の優先順位に一致）。
  const describedBy = opts.ariaDescribedBy ?? (opts.helperText !== undefined ? opts.helperTextId : undefined);
  if (describedBy) input.setAttribute("aria-describedby", describedBy);

  // 任意の追加属性（aria-label 等）。
  if (opts.inputAttrs) {
    for (const [k, v] of Object.entries(opts.inputAttrs)) input.setAttribute(k, v);
  }

  wrap.appendChild(input);
  el.appendChild(wrap);

  // ---- helper text（任意） ----
  let helperEl: HTMLParagraphElement | undefined;
  if (opts.helperText !== undefined) {
    helperEl = document.createElement("p");
    helperEl.setAttribute("data-am-tf-helper", "");
    if (opts.helperTextId) helperEl.id = opts.helperTextId;
    helperEl.style.cssText = HELPER_CSS;
    appendContent(helperEl, opts.helperText);
    el.appendChild(helperEl);
  }

  function syncLabelShrink(): void {
    if (labelEl) {
      labelEl.setAttribute(
        "data-shrink",
        String(computeShrink(input.value || undefined, input.placeholder || undefined)),
      );
    }
  }

  // ---- イベント listener ----
  // ユーザー onChange とは独立に、キー入力ごとにラベルの shrink を value へ追従させる。
  // これが無いと、入力後 blur で `:focus-within` が外れた際にラベルが入力欄中央へ戻り、
  // 入力済みテキストに重なる（フローティングラベルが「残る」ように見える）。
  const onInputSyncShrink = (): void => syncLabelShrink();
  input.addEventListener("input", onInputSyncShrink);

  let onChange = opts.onChange;
  let onBlur = opts.onBlur;
  let onKeyDown = opts.onKeyDown;
  let onClick = opts.onClick;
  if (onChange) input.addEventListener("input", onChange);
  if (onBlur) input.addEventListener("blur", onBlur as EventListener);
  if (onKeyDown) input.addEventListener("keydown", onKeyDown as EventListener);
  if (onClick) input.addEventListener("click", onClick as EventListener);

  if (opts.autoFocus) {
    // マウント前に focus しても効かないため microtask 後に試みる。
    queueMicrotask(() => {
      if (input.isConnected) input.focus();
    });
  }

  function update(next: Partial<CreateTextFieldOptions>): void {
    if (next.value !== undefined) {
      input.value = next.value;
    }
    if (next.placeholder !== undefined) {
      input.placeholder = next.placeholder;
    }
    if (next.value !== undefined || next.placeholder !== undefined) {
      syncLabelShrink();
    }
    if (next.error !== undefined) {
      el.setAttribute("data-error", String(next.error));
      if (next.error) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
    if (next.disabled !== undefined) {
      el.setAttribute("data-disabled", String(next.disabled));
      input.disabled = next.disabled;
    }
    if (next.className !== undefined) el.className = next.className;
    if (next.helperText !== undefined && helperEl) {
      for (const node of [...helperEl.childNodes]) helperEl.removeChild(node);
      appendContent(helperEl, next.helperText);
    }
    if (next.onChange !== undefined) {
      if (onChange) input.removeEventListener("input", onChange);
      onChange = next.onChange;
      if (onChange) input.addEventListener("input", onChange);
    }
    if (next.onBlur !== undefined) {
      if (onBlur) input.removeEventListener("blur", onBlur as EventListener);
      onBlur = next.onBlur;
      if (onBlur) input.addEventListener("blur", onBlur as EventListener);
    }
    if (next.onKeyDown !== undefined) {
      if (onKeyDown) input.removeEventListener("keydown", onKeyDown as EventListener);
      onKeyDown = next.onKeyDown;
      if (onKeyDown) input.addEventListener("keydown", onKeyDown as EventListener);
    }
    if (next.onClick !== undefined) {
      if (onClick) input.removeEventListener("click", onClick as EventListener);
      onClick = next.onClick;
      if (onClick) input.addEventListener("click", onClick as EventListener);
    }
  }

  function destroy(): void {
    input.removeEventListener("input", onInputSyncShrink);
    if (onChange) input.removeEventListener("input", onChange);
    if (onBlur) input.removeEventListener("blur", onBlur as EventListener);
    if (onKeyDown) input.removeEventListener("keydown", onKeyDown as EventListener);
    if (onClick) input.removeEventListener("click", onClick as EventListener);
    onChange = undefined;
    onBlur = undefined;
    onKeyDown = undefined;
    onClick = undefined;
  }

  return { el, input, update, destroy };
}
