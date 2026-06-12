/**
 * 脱React の vanilla DOM ファクトリ — Divider。
 *
 * `ui/Divider.tsx`（MUI Divider 置換）の素 DOM 版。1px のラインを `--am-color-divider`
 * で描画し、React / MUI に依存しない。テーマ色は CSS 変数（applyEditorThemeCssVars
 * 注入）で追従する。`chrome/vanillaToolbar.ts` の cssText + CSS 変数パターンに従う。
 */

/** createDivider のオプション。`ui/Divider.tsx` の DividerProps に対応。 */
export interface CreateDividerOptions {
  /** 区切り線の向き。既定は horizontal。 */
  orientation?: "horizontal" | "vertical";
  /** flex コンテナ内で align-self: stretch させる。 */
  flexItem?: boolean;
  /** 追加クラス名。 */
  className?: string;
  /** aria-label（区切りの意味を補足する場合）。 */
  ariaLabel?: string;
}

/** orientation / flexItem から cssText を組み立てる。 */
function buildCssText(orientation: "horizontal" | "vertical", flexItem: boolean): string {
  // .root 相当（Divider.module.css）
  let css = "border:0;margin:0;flex-shrink:0;background-color:var(--am-color-divider);";
  if (orientation === "vertical") {
    // .vertical 相当
    css += "width:1px;align-self:stretch;height:auto;";
  } else {
    // .horizontal 相当
    css += "height:1px;width:100%;";
  }
  // .flexItem 相当（horizontal でも明示 stretch を上書き）
  if (flexItem) {
    css += "align-self:stretch;";
  }
  return css;
}

/**
 * 区切り線（`<hr>`）を生成する。
 *
 * static content かつイベント登録なしのため update / destroy は提供しない
 * （規約 5: static content / no event → 不要）。className を変えたい等の動的要件が
 * 出た場合は呼び元で `el.className` を直接操作する。
 */
export function createDivider(opts: CreateDividerOptions = {}): { el: HTMLHRElement } {
  const orientation = opts.orientation ?? "horizontal";
  const flexItem = opts.flexItem ?? false;

  const el = document.createElement("hr");
  el.style.cssText = buildCssText(orientation, flexItem);

  // role=separator + aria-orientation で a11y を明示（hr の暗黙 role を補強）。
  el.setAttribute("role", "separator");
  el.setAttribute("aria-orientation", orientation);
  el.setAttribute("data-orientation", orientation);
  if (flexItem) {
    el.setAttribute("data-flex-item", "");
  }
  if (opts.ariaLabel) {
    el.setAttribute("aria-label", opts.ariaLabel);
  }
  if (opts.className) {
    el.className = opts.className;
  }

  return { el };
}
