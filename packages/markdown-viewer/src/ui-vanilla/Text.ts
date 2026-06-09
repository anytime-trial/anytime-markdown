/**
 * 脱React の vanilla DOM ファクトリ（Text）。
 *
 * 既存 React 実装 `ui/Text.tsx`（MUI Typography 置換）の素 DOM 版。React / MUI に依存せず、
 * テーマ色は CSS 変数（`--am-color-*`・applyEditorThemeCssVars 注入）で追従する。Text 自体は
 * MUI Typography 同様に色を指定せず `inherit` のままで、太字や色は `style` / `className` で
 * 呼び出し側が付与する。font scale は `ui/Text.module.css` の値を忠実に再現する。
 *
 * vanillaToolbar.ts のパターン（cssText + addEventListener + attribute API）に整合させる。
 */

/** Text の variant（MUI Typography scale のサブセット）。 */
export type TextVariant =
  | "h6"
  | "subtitle1"
  | "subtitle2"
  | "body1"
  | "body2"
  | "caption";

/** MUI Typography の variantMapping に準拠した既定要素タグ名。 */
const VARIANT_TAG: Record<TextVariant, string> = {
  h6: "h6",
  subtitle1: "h6",
  subtitle2: "h6",
  body1: "p",
  body2: "p",
  caption: "span",
};

/** ui/Text.module.css の各 variant 値を忠実に再現した font scale（color は指定しない）。 */
const VARIANT_FONT: Record<TextVariant, string> = {
  h6: "font-size:1.25rem;font-weight:500;line-height:1.6;letter-spacing:0.0075em;",
  subtitle1:
    "font-size:1rem;font-weight:400;line-height:1.75;letter-spacing:0.00938em;",
  subtitle2:
    "font-size:0.875rem;font-weight:500;line-height:1.57;letter-spacing:0.00714em;",
  body1:
    "font-size:1rem;font-weight:400;line-height:1.5;letter-spacing:0.00938em;",
  body2:
    "font-size:0.875rem;font-weight:400;line-height:1.43;letter-spacing:0.01071em;",
  caption:
    "font-size:0.75rem;font-weight:400;line-height:1.66;letter-spacing:0.03333em;",
};

/** gutterBottom の余白（CSS module .gutterBottom 相当）。 */
const GUTTER_BOTTOM = "margin-bottom:0.35em;";

/** noWrap の省略表示（CSS module .noWrap 相当）。 */
const NO_WRAP = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

/** Text ファクトリの children として渡せる型。 */
export type TextChild = string | Node;

/** createText のオプション。 */
export interface CreateTextOptions {
  /** Typography variant（既定 body1）。 */
  variant?: TextVariant;
  /** 描画要素タグの上書き（MUI Typography の component prop 相当）。 */
  component?: string;
  /** 下マージン（.35em）を付与する。 */
  gutterBottom?: boolean;
  /** 折り返さず省略表示する。 */
  noWrap?: boolean;
  /** テキスト内容（string）。children と排他的に使う想定（children 優先）。 */
  text?: string;
  /** 子要素（string / Node / それらの配列）。 */
  children?: TextChild | readonly TextChild[];
  /** 追加 class 名。 */
  className?: string;
  /** aria-label。 */
  ariaLabel?: string;
  /** クリックハンドラ（listener として登録、destroy で解除）。 */
  onClick?: () => void;
  /** 追加 inline style（cssText に追記する形で末尾結合）。 */
  style?: string;
}

/** createText の戻り値。 */
export interface TextHandle {
  /** root element。 */
  el: HTMLElement;
  /** 可変プロパティ（text / variant / class / aria 等）の更新。 */
  update: (opts: Partial<CreateTextOptions>) => void;
  /** event listener 解除等の cleanup。 */
  destroy: () => void;
}

/** children を root へ展開して追加する。string は textNode、Node はそのまま append。 */
function appendChildren(
  el: HTMLElement,
  children: TextChild | readonly TextChild[],
): void {
  const list: readonly TextChild[] = Array.isArray(children)
    ? children
    : [children];
  for (const child of list) {
    if (typeof child === "string") {
      el.appendChild(document.createTextNode(child));
    } else {
      el.appendChild(child);
    }
  }
}

/** variant / gutterBottom / noWrap / 追加 style から cssText を組み立てる。 */
function buildCssText(opts: {
  variant: TextVariant;
  gutterBottom?: boolean;
  noWrap?: boolean;
  style?: string;
}): string {
  let css = "margin:0;" + VARIANT_FONT[opts.variant];
  if (opts.gutterBottom) css += GUTTER_BOTTOM;
  if (opts.noWrap) css += NO_WRAP;
  if (opts.style) css += opts.style;
  return css;
}

/**
 * MUI Typography 相当の vanilla Text を生成する。
 *
 * - 色は指定しない（inherit）。太字・色は呼び出し側が `style` / `className` で付与する。
 * - variant に応じた既定タグ（h6 / p / span）で要素を作る。`component` で上書き可能。
 * - text / children のどちらでも内容を渡せる（両方指定時は children を優先）。
 * - onClick を渡した場合のみ listener を登録し、destroy で解除する。
 */
export function createText(opts: CreateTextOptions = {}): TextHandle {
  const variant = opts.variant ?? "body1";
  const tag = opts.component ?? VARIANT_TAG[variant];
  const el = document.createElement(tag);

  // 現在の variant を update 用に保持（タグは作り直さないため変更不可）。
  let currentVariant = variant;

  el.style.cssText = buildCssText({
    variant: currentVariant,
    gutterBottom: opts.gutterBottom,
    noWrap: opts.noWrap,
    style: opts.style,
  });

  if (opts.className) el.className = opts.className;
  if (opts.ariaLabel !== undefined) el.setAttribute("aria-label", opts.ariaLabel);

  if (opts.children !== undefined) {
    appendChildren(el, opts.children);
  } else if (opts.text !== undefined) {
    el.textContent = opts.text;
  }

  // onClick は addEventListener で登録し destroy で解除する（on* 属性は使わない）。
  let clickHandler: (() => void) | undefined;
  if (opts.onClick) {
    clickHandler = opts.onClick;
    el.addEventListener("click", clickHandler);
  }

  // 直近に適用した gutterBottom / noWrap / style を保持（update で部分更新を再構築するため）。
  let curGutter = opts.gutterBottom;
  let curNoWrap = opts.noWrap;
  let curStyle = opts.style;

  return {
    el,
    update(next: Partial<CreateTextOptions>) {
      if (next.variant !== undefined) currentVariant = next.variant;
      if (next.gutterBottom !== undefined) curGutter = next.gutterBottom;
      if (next.noWrap !== undefined) curNoWrap = next.noWrap;
      if (next.style !== undefined) curStyle = next.style;

      if (
        next.variant !== undefined ||
        next.gutterBottom !== undefined ||
        next.noWrap !== undefined ||
        next.style !== undefined
      ) {
        el.style.cssText = buildCssText({
          variant: currentVariant,
          gutterBottom: curGutter,
          noWrap: curNoWrap,
          style: curStyle,
        });
      }

      if (next.className !== undefined) el.className = next.className;
      if (next.ariaLabel !== undefined) {
        if (next.ariaLabel === "") el.removeAttribute("aria-label");
        else el.setAttribute("aria-label", next.ariaLabel);
      }

      if (next.children !== undefined) {
        el.textContent = "";
        appendChildren(el, next.children);
      } else if (next.text !== undefined) {
        el.textContent = next.text;
      }

      if (next.onClick !== undefined) {
        if (clickHandler) el.removeEventListener("click", clickHandler);
        clickHandler = next.onClick;
        el.addEventListener("click", clickHandler);
      }
    },
    destroy() {
      if (clickHandler) {
        el.removeEventListener("click", clickHandler);
        clickHandler = undefined;
      }
    },
  };
}
