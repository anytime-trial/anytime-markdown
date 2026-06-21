/**
 * 脱React の vanilla DOM ファクトリ — Avatar（MUI Avatar / `trail-viewer/src/ui/Avatar.tsx` 置換）。
 *
 * 画像・イニシャル・アイコンを丸（または角丸・矩形）枠で表示する `<span>`。
 * `src` が指定されれば `<img>` を、指定がなければ `children` をそのまま内包する。
 * `variant` で "circular"（既定）/ "rounded"（border-radius 8px）/ "square" を切り替え、
 * `size` で "small"（24px）/ "medium"（40px、既定）/ "large"（56px）を切り替える。
 * `sx` は受理しない（ui-core 方針）。
 */

import { appendContent, applyStyle, ensureStyle, type VanillaContent } from "./dom";

const AVATAR_STYLE_ID = "am-ui-avatar-styles";

/** Avatar の共有 CSS を 1 度だけ注入する。 */
function ensureAvatarStyles(): void {
  ensureStyle(
    AVATAR_STYLE_ID,
    ".am-avatar{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;" +
      "overflow:hidden;user-select:none;flex-shrink:0;" +
      "width:40px;height:40px;border-radius:50%;" +
      "background-color:var(--am-color-action-selected,#bdbdbd);" +
      "color:var(--am-color-text-primary,currentColor);font-size:1.25rem;font-weight:500;}" +
      ".am-avatar img{width:100%;height:100%;object-fit:cover;}" +
      ".am-avatar--small{width:24px;height:24px;font-size:0.75rem;}" +
      ".am-avatar--large{width:56px;height:56px;font-size:1.5rem;}" +
      ".am-avatar--rounded{border-radius:8px;}" +
      ".am-avatar--square{border-radius:0;}",
  );
}

/** {@link createAvatar} のオプション。`trail-viewer/src/ui/Avatar.tsx` の AvatarProps 対応範囲。 */
export interface CreateAvatarOptions {
  /** 画像 URL。指定するとアバター内に `<img>` を描画する。 */
  src?: string;
  /** 画像の alt テキスト / aria-label。 */
  alt?: string;
  /** src 未指定時に表示するコンテンツ（イニシャル文字列 / アイコン Node）。 */
  children?: VanillaContent;
  /** 形状バリアント（既定 "circular"）。 */
  variant?: "circular" | "rounded" | "square";
  /** サイズ（既定 "medium" = 40px）。 */
  size?: "small" | "medium" | "large";
  /** 追加クラス名。 */
  className?: string;
  /** data-testid 属性。 */
  testId?: string;
  /** 追加スタイル（cssText の後に上書き）。 */
  style?: Partial<CSSStyleDeclaration>;
}

/**
 * MUI Avatar 相当の最小 vanilla 版（`trail-viewer/src/ui/Avatar.tsx` 置換）。
 *
 * static content + イベント登録なしのため update / destroy は提供しない。
 */
export function createAvatar(opts: CreateAvatarOptions = {}): { el: HTMLSpanElement } {
  ensureAvatarStyles();

  const el = document.createElement("span");

  const variant = opts.variant ?? "circular";
  const size = opts.size ?? "medium";
  const classes = [
    "am-avatar",
    size === "small" ? "am-avatar--small" : "",
    size === "large" ? "am-avatar--large" : "",
    variant === "rounded" ? "am-avatar--rounded" : "",
    variant === "square" ? "am-avatar--square" : "",
    opts.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  el.className = classes;

  if (opts.alt) el.setAttribute("aria-label", opts.alt);
  if (opts.testId) el.setAttribute("data-testid", opts.testId);

  applyStyle(el, opts.style);

  if (opts.src) {
    const img = document.createElement("img");
    img.src = opts.src;
    if (opts.alt) img.alt = opts.alt;
    el.appendChild(img);
  } else {
    appendContent(el, opts.children);
  }

  return { el };
}
