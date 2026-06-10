/**
 * 脱React の vanilla DOM Spinner ファクトリ（ui/Spinner.tsx の素 DOM 版）。
 *
 * MUI CircularProgress（indeterminate）相当の見た目を SVG 円弧 + CSS keyframes で再現する。
 * テーマ色は `--am-color-*` CSS 変数（applyEditorThemeCssVars 注入）で追従し、
 * useIsDark 等の React hook には依存しない。React / MUI を import しない。
 *
 * ui/Spinner.module.css の keyframes（spinner-rotate / spinner-dash）はモジュール CSS のため
 * vanilla 環境では利用できない。本モジュールは同等の keyframes を初回生成時に
 * `document.head` へ一度だけ注入する（冪等）。
 */

// ui/Spinner.tsx と同一の幾何（MUI CircularProgress 既定）。
const SIZE = 44;
const VIEWBOX = `${SIZE / 2} ${SIZE / 2} ${SIZE} ${SIZE}`;
const CENTER = SIZE / 2 + SIZE / 2; // 44
const THICKNESS = 3.6;
const RADIUS = (SIZE - THICKNESS) / 2; // 20.2

/** 注入済みフラグ用の style 要素 id（冪等注入のため）。 */
const STYLE_ID = "am-vanilla-spinner-keyframes";

/** root（回転）と circle（dash）に付与するクラス名。CSS Modules ではなく素クラス。 */
const ROOT_CLASS = "am-vanilla-spinner";
const SVG_CLASS = "am-vanilla-spinner-svg";
const CIRCLE_CLASS = "am-vanilla-spinner-circle";

/**
 * keyframes / 基本スタイルを document.head に一度だけ注入する。
 * ui/Spinner.module.css と同一の spinner-rotate / spinner-dash を再現する。
 */
function ensureKeyframes(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [
    `.${ROOT_CLASS}{display:inline-block;line-height:1;`,
    `animation:am-spinner-rotate 1.4s linear infinite;}`,
    `.${SVG_CLASS}{display:block;}`,
    `.${CIRCLE_CLASS}{stroke:currentColor;stroke-dasharray:80px,200px;`,
    `stroke-dashoffset:0;animation:am-spinner-dash 1.4s ease-in-out infinite;}`,
    `@keyframes am-spinner-rotate{`,
    `0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}`,
    `@keyframes am-spinner-dash{`,
    `0%{stroke-dasharray:1px,200px;stroke-dashoffset:0;}`,
    `50%{stroke-dasharray:100px,200px;stroke-dashoffset:-15px;}`,
    `100%{stroke-dasharray:1px,200px;stroke-dashoffset:-126px;}}`,
    `@media (prefers-reduced-motion:reduce){`,
    `.${ROOT_CLASS},.${CIRCLE_CLASS}{animation-duration:3s;}}`,
  ].join("");
  document.head.appendChild(style);
}

/** vanilla Spinner の生成オプション（ui/Spinner.tsx の SpinnerProps 相当）。 */
export interface CreateSpinnerOptions {
  /** 直径(px)。既定 40（MUI CircularProgress 既定と同じ）。 */
  size?: number;
  /** primary=テーマ主色（--am-color-primary-main） / inherit=親の color を継承。既定 primary。 */
  color?: "primary" | "inherit";
  /** root span に追加付与するクラス名。 */
  className?: string;
  /** a11y ラベル（aria-label）。 */
  ariaLabel?: string;
}

/**
 * MUI CircularProgress（indeterminate）相当の vanilla Spinner を生成する。
 * 戻り値の `update` で size / color / ariaLabel を変更できる。
 * keyframes 注入は冪等なため `destroy` は不要（DOM 要素の除去は呼び元が実施）。
 */
export function createSpinner(opts: CreateSpinnerOptions = {}): {
  el: HTMLSpanElement;
  update: (next: Partial<CreateSpinnerOptions>) => void;
} {
  ensureKeyframes();

  const { size = 40, color = "primary", className, ariaLabel } = opts;

  const el = document.createElement("span");
  el.setAttribute("role", "progressbar");
  if (ariaLabel !== undefined) el.setAttribute("aria-label", ariaLabel);

  const applyColor = (c: "primary" | "inherit"): void => {
    // primary はテーマ主色、inherit は親 color を継承。currentColor で circle に伝播。
    el.style.color = c === "inherit" ? "inherit" : "var(--am-color-primary-main)";
  };
  const applySize = (s: number): void => {
    el.style.width = `${s}px`;
    el.style.height = `${s}px`;
  };
  const applyClass = (extra: string | undefined): void => {
    el.className = [ROOT_CLASS, extra].filter(Boolean).join(" ");
  };

  applyClass(className);
  applySize(size);
  applyColor(color);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", SVG_CLASS);
  svg.setAttribute("viewBox", VIEWBOX);

  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("class", CIRCLE_CLASS);
  circle.setAttribute("cx", String(CENTER));
  circle.setAttribute("cy", String(CENTER));
  circle.setAttribute("r", String(RADIUS));
  circle.setAttribute("fill", "none");
  circle.setAttribute("stroke-width", String(THICKNESS));

  svg.appendChild(circle);
  el.appendChild(svg);

  return {
    el,
    update(next: Partial<CreateSpinnerOptions>) {
      if (next.size !== undefined) applySize(next.size);
      if (next.color !== undefined) applyColor(next.color);
      if (next.className !== undefined) applyClass(next.className);
      if (next.ariaLabel !== undefined) el.setAttribute("aria-label", next.ariaLabel);
    },
  };
}
