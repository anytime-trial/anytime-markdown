/**
 * 脱React の vanilla DOM Skeleton ファクトリ（ui/Skeleton.tsx + Skeleton.module.css の素 DOM 版）。
 *
 * MUI Skeleton 相当の placeholder（pulse アニメーション）を素 DOM で再現する。
 * variant（text / rectangular / circular）× width / height をサポートし、
 * 背景色は `--am-color-skeleton-bg` CSS 変数（seam 注入）で追従する。useIsDark 等の
 * React hook には依存しない。React / MUI を import しない。
 *
 * ui/Skeleton.module.css の keyframes（skeleton-pulse）はモジュール CSS のため vanilla 環境
 * では利用できない。本モジュールは同等の keyframes + variant スタイルを初回生成時に
 * `document.head` へ一度だけ注入する（冪等。Spinner.ts と同パターン）。
 */

/** 注入済みフラグ用の style 要素 id（冪等注入のため）。 */
const STYLE_ID = "am-vanilla-skeleton-keyframes";

/** root に常時付与するクラス名。CSS Modules ではなく素クラス。 */
const ROOT_CLASS = "am-vanilla-skeleton";

/** variant ごとのクラス名（ui/Skeleton.module.css の .text/.rectangular/.circular 相当）。 */
const VARIANT_CLASS: Record<SkeletonVariant, string> = {
  text: "am-vanilla-skeleton-text",
  rectangular: "am-vanilla-skeleton-rectangular",
  circular: "am-vanilla-skeleton-circular",
};

/** Skeleton の形状バリアント（ui/Skeleton.tsx の SkeletonProps.variant 相当）。 */
export type SkeletonVariant = "text" | "rectangular" | "circular";

/**
 * keyframes / variant スタイルを document.head に一度だけ注入する。
 * ui/Skeleton.module.css と同一の skeleton-pulse / variant スタイルを再現する。
 */
function ensureKeyframes(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [
    // .root（pulse 2s ease-in-out 0.5s infinite）。
    `.${ROOT_CLASS}{display:block;`,
    `background-color:var(--am-color-skeleton-bg);`,
    `animation:am-skeleton-pulse 2s ease-in-out 0.5s infinite;}`,
    // text variant（行高に合わせた角丸 + 縦圧縮）。
    `.${VARIANT_CLASS.text}{height:auto;border-radius:4px / 6.7px;`,
    `transform:scale(1, 0.6);}`,
    `.${VARIANT_CLASS.rectangular}{border-radius:0;}`,
    `.${VARIANT_CLASS.circular}{border-radius:50%;}`,
    `@keyframes am-skeleton-pulse{`,
    `0%{opacity:1;}50%{opacity:0.4;}100%{opacity:1;}}`,
    `@media (prefers-reduced-motion:reduce){`,
    `.${ROOT_CLASS}{animation:none;}}`,
  ].join("");
  document.head.appendChild(style);
}

/** length 値（number は px 化、string はそのまま）を CSS 長さ文字列に正規化する。 */
function toLength(value: number | string | undefined): string {
  if (value === undefined) return "";
  return typeof value === "number" ? `${value}px` : value;
}

/** vanilla Skeleton の生成オプション（ui/Skeleton.tsx の SkeletonProps 相当）。 */
export interface CreateSkeletonOptions {
  /** 形状。既定 rectangular（ui/Skeleton.tsx の既定と同じ）。 */
  variant?: SkeletonVariant;
  /** 幅。number は px、string はそのまま。 */
  width?: number | string;
  /** 高さ。number は px、string はそのまま。 */
  height?: number | string;
  /** root span に追加付与するクラス名。 */
  className?: string;
  /** 追加スタイル（width/height の上書き等）。 */
  style?: Partial<CSSStyleDeclaration>;
}

/**
 * MUI Skeleton 相当の vanilla Skeleton を生成する。
 * 戻り値の `update` で variant / width / height / className を変更できる。
 * keyframes 注入は冪等なため `destroy` は不要（DOM 要素の除去は呼び元が実施）。
 */
export function createSkeleton(opts: CreateSkeletonOptions = {}): {
  el: HTMLSpanElement;
  update: (next: Partial<CreateSkeletonOptions>) => void;
} {
  ensureKeyframes();

  const el = document.createElement("span");

  const applyClass = (variant: SkeletonVariant, extra: string | undefined): void => {
    el.className = [ROOT_CLASS, VARIANT_CLASS[variant], extra].filter(Boolean).join(" ");
  };
  const applySize = (width: number | string | undefined, height: number | string | undefined): void => {
    el.style.width = toLength(width);
    el.style.height = toLength(height);
  };

  let variant: SkeletonVariant = opts.variant ?? "rectangular";
  let className = opts.className;
  applyClass(variant, className);
  applySize(opts.width, opts.height);
  // style は size 適用後に重ねる（width/height を上書き可能にするため、React の {width,height,...style} 順に一致）。
  if (opts.style) Object.assign(el.style, opts.style);

  return {
    el,
    update(next: Partial<CreateSkeletonOptions>) {
      if (next.variant !== undefined) {
        variant = next.variant;
        applyClass(variant, className);
      }
      if (next.className !== undefined) {
        className = next.className;
        applyClass(variant, className);
      }
      if (next.width !== undefined) el.style.width = toLength(next.width);
      if (next.height !== undefined) el.style.height = toLength(next.height);
      if (next.style) Object.assign(el.style, next.style);
    },
  };
}
