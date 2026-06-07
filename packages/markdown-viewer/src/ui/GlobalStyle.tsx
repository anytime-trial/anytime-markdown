import { useInsertionEffect } from "react";
import { compile, middleware, prefixer, serialize, stringify } from "stylis";

// stylis は同梱型を持たないため、型は src/types/stylis.d.ts の ambient 宣言で補う。

/**
 * 自前グローバルスタイル注入コンポーネント（@mui/material/GlobalStyles 代替）。
 *
 * MUI GlobalStyles は内部で emotion(=stylis) を用いてスタイルオブジェクトを
 * CSS 文字列化し `<style>` を head へ注入する。本コンポーネントは同じ stylis を
 * 直接用いることで、emotion と「ほぼバイト等価」な CSS を生成する（ベンダー
 * プレフィックス・ネスト解決・数値→px 変換の挙動を一致させる）。
 *
 * 重要: MUI sx ショートハンド(py / pl / bgcolor 等)は emotion でも展開されず
 * 無効プロパティとして出力されるため、本シリアライザでも展開しない。これにより
 * 旧 GlobalStyles 経路と出力 CSS が一致し、見た目のピクセル等価が保証される。
 */

/**
 * @emotion/unitless 0.10.0 のキー(camelCase)。
 * これらのプロパティは数値をそのまま出力し px を付与しない。
 */
const UNITLESS_KEYS = new Set<string>([
  "animationIterationCount", "aspectRatio", "borderImageOutset", "borderImageSlice",
  "borderImageWidth", "boxFlex", "boxFlexGroup", "boxOrdinalGroup", "columnCount",
  "columns", "flex", "flexGrow", "flexPositive", "flexShrink", "flexNegative",
  "flexOrder", "gridRow", "gridRowEnd", "gridRowSpan", "gridRowStart", "gridColumn",
  "gridColumnEnd", "gridColumnSpan", "gridColumnStart", "msGridRow", "msGridRowSpan",
  "msGridColumn", "msGridColumnSpan", "fontWeight", "lineHeight", "opacity", "order",
  "orphans", "scale", "tabSize", "widows", "zIndex", "zoom", "WebkitLineClamp",
  "fillOpacity", "floodOpacity", "stopOpacity", "strokeDasharray", "strokeDashoffset",
  "strokeMiterlimit", "strokeOpacity", "strokeWidth",
]);

/** camelCase プロパティ名を kebab-case へ変換する（emotion と同一規則）。 */
function hyphenate(prop: string): string {
  return prop.replace(/[A-Z]|^ms/g, "-$&").toLowerCase();
}

/** プロパティ値を CSS 値へ変換する（数値→px、ただし 0 と unitless は除外）。 */
function valueToCss(camelProp: string, value: string | number): string {
  if (typeof value === "number") {
    if (value === 0) return "0";
    if (UNITLESS_KEYS.has(camelProp)) return String(value);
    return `${value}px`;
  }
  return String(value);
}

export type StyleObject = Record<string, unknown>;

/**
 * スタイルオブジェクトを stylis 互換の生 CSS 文字列へ変換する（プレフィックス未適用）。
 * object 値のキーはセレクタ/at-rule として `key{...}` のブロックに、
 * scalar 値のキーは宣言(`prop:value;`)に展開する。
 */
function objectToRawCss(obj: StyleObject): string {
  let out = "";
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value == null || typeof value === "boolean") continue;
    if (Array.isArray(value)) {
      // 配列値は CSS フォールバックとして同一プロパティを複数宣言する（emotion 準拠）。
      for (const item of value) {
        if (item == null || typeof item === "boolean") continue;
        out += `${hyphenate(key)}:${valueToCss(key, item as string | number)};`;
      }
    } else if (typeof value === "object") {
      out += `${key}{${objectToRawCss(value as StyleObject)}}`;
    } else {
      out += `${hyphenate(key)}:${valueToCss(key, value as string | number)};`;
    }
  }
  return out;
}

/**
 * スタイルオブジェクトを最終 CSS 文字列へ変換する。
 * stylis の prefixer + stringify を通し、ネスト解決とベンダープレフィックスを適用する。
 */
export function serializeGlobalStyles(styles: StyleObject): string {
  const raw = objectToRawCss(styles);
  return serialize(compile(raw), middleware([prefixer, stringify]));
}

export interface GlobalStyleProps {
  /** セレクタ/at-rule をキーとするスタイルオブジェクト（MUI GlobalStyles の styles と同形）。 */
  readonly styles: StyleObject;
}

/**
 * グローバルスタイルを head へ注入する。styles から生成した CSS が変化したときのみ
 * 再注入する。SSR 時は何も描画しない（注入は useInsertionEffect でクライアントのみ）。
 */
export function GlobalStyle({ styles }: GlobalStyleProps): null {
  const css = serializeGlobalStyles(styles);
  useInsertionEffect(() => {
    if (typeof document === "undefined") return undefined;
    const el = document.createElement("style");
    el.setAttribute("data-anytime-global", "");
    el.textContent = css;
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, [css]);
  return null;
}
