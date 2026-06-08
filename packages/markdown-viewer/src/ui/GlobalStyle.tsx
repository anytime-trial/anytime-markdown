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
 * 重要: 本シリアライザに渡るスタイルオブジェクト(getEditorPaperSx / getHeadingStyles
 * など)は元々 MUI の sx prop 経由で消費され、styleFunctionSx により sx ショートハンド
 * (pl / py / px / m* / bgcolor / borderRadius / border 等)が実 CSS へ展開されていた。
 * 注入経路を sx prop から GlobalStyles/本シリアライザへ移した際にこの展開が失われ、
 * `pl:2px` のような無効プロパティが出力されて .tiptap の左パディングが消失し、左 gutter
 * に置かれる hover ラベル(H1/H2 バッジ)が overflow:hidden にクリップされ不可視になる
 * 回帰が生じた。これを防ぐため、本シリアライザは styleFunctionSx と同じ規則
 * (spacing×8 / shape.borderRadius×4 / bgcolor→background-color 等)で展開する。
 */

/** MUI デフォルトテーマの spacing 単位(px)。spacing 系プロパティの数値に乗算する。 */
const SPACING_UNIT = 8;
/** MUI デフォルトテーマの shape.borderRadius(px)。borderRadius の数値に乗算する。 */
const SHAPE_BORDER_RADIUS = 4;

/** sx spacing ショートハンド → longhand CSS プロパティ(camelCase)。値は spacing 変換対象。 */
const SPACING_ALIASES: Record<string, readonly string[]> = {
  m: ["margin"], mt: ["marginTop"], mr: ["marginRight"], mb: ["marginBottom"], ml: ["marginLeft"],
  mx: ["marginLeft", "marginRight"], my: ["marginTop", "marginBottom"],
  p: ["padding"], pt: ["paddingTop"], pr: ["paddingRight"], pb: ["paddingBottom"], pl: ["paddingLeft"],
  px: ["paddingLeft", "paddingRight"], py: ["paddingTop", "paddingBottom"],
};

/** longhand のまま値だけ spacing 変換するプロパティ(camelCase)。alias の展開先 + gap 系。 */
const SPACING_PROPS = new Set<string>([
  ...Object.values(SPACING_ALIASES).flat(),
  "gap", "rowGap", "columnGap",
]);

/** 数値のみ factor 倍する(MUI styleFunctionSx 準拠・後段で px 付与)。文字列はそのまま。 */
function scaleIfNumber(value: string | number, factor: number): string | number {
  return typeof value === "number" ? value * factor : value;
}

/**
 * sx 宣言 (camelCase プロパティ, 値) を実 CSS の宣言ペア配列へ展開する。
 * ショートハンドでないプロパティはそのまま 1 件返す。
 */
function resolveSxDeclaration(prop: string, value: string | number): Array<[string, string | number]> {
  // alias は longhand 群へ展開、longhand spacing は自身へ。いずれも spacing 変換する。
  const spacingTargets = SPACING_ALIASES[prop] ?? (SPACING_PROPS.has(prop) ? [prop] : null);
  if (spacingTargets) {
    const v = scaleIfNumber(value, SPACING_UNIT);
    return spacingTargets.map((real) => [real, v]);
  }
  if (prop === "borderRadius") {
    return [[prop, scaleIfNumber(value, SHAPE_BORDER_RADIUS)]];
  }
  if (prop === "border") {
    // sx: border に数値を渡すと `Npx solid` になる(色は currentColor/別途 borderColor)。
    return [[prop, typeof value === "number" ? `${value}px solid` : value]];
  }
  if (prop === "bgcolor") return [["backgroundColor", value]];
  return [[prop, value]];
}

/**
 * @emotion/unitless 0.10.0 のキー(camelCase)。
 * これらのプロパティは数値をそのまま出力し px を付与しない。
 */
const UNITLESS_KEYS = new Set([
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
  // emotion 準拠: number かつ 0 でなく unitless でなければ px を付与（0 は String(0)="0"）。
  if (typeof value === "number" && value !== 0 && !UNITLESS_KEYS.has(camelProp)) {
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
    if (typeof value === "object" && !Array.isArray(value)) {
      out += `${key}{${objectToRawCss(value as StyleObject)}}`;
      continue;
    }
    // scalar は単一値、配列は CSS フォールバックとして同一プロパティを複数宣言（emotion 準拠）。
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (item == null || typeof item === "boolean") continue;
      // sx ショートハンド(pl/py/bgcolor/borderRadius 等)を実 CSS の宣言へ展開する。
      for (const [cssProp, cssValue] of resolveSxDeclaration(key, item as string | number)) {
        out += `${hyphenate(cssProp)}:${valueToCss(cssProp, cssValue)};`;
      }
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
  // useInsertionEffect は SSR では実行されないため、注入はクライアントのみで起きる。
  useInsertionEffect(() => {
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
