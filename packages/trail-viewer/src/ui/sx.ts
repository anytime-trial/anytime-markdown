/**
 * MUI `sx` 風オブジェクトを素の React `CSSProperties` へ変換するヘルパ。
 *
 * trail-viewer の脱 @mui 移行で `sx={{...}}` → `style={sxToStyle({...})}` に置き換えるための薄い変換層。
 * 対応するのは「機械的に等価変換できる」範囲のみ:
 *  - spacing shorthand（p/m/gap 系）の数値 → `n * 8px`
 *  - `borderRadius` の数値 → `n * 4px`（MUI 既定 shape.borderRadius=4）
 *  - `bgcolor` → `backgroundColor`
 *  - MUI テーマ色トークン文字列（`text.secondary` 等）→ `var(--trv-color-*)`
 *  - それ以外は React の style にそのまま渡す（数値の px 補完は React に委ねる）
 *
 * responsive オブジェクト（`{ xs, sm }`）・テーマ関数・擬似セレクタ（`&:hover`）は変換できないため、
 * 呼び出し側で個別に className / 直接 style に書き換える（移行手順参照）。
 */

import type { CSSProperties } from "react";

/** MUI のテーマ色トークン（`palette.*`）→ trail UI CSS 変数の対応表。 */
const COLOR_TOKEN_MAP: Record<string, string> = {
  "text.primary": "var(--trv-color-text-primary)",
  "text.secondary": "var(--trv-color-text-secondary)",
  "text.disabled": "var(--trv-color-text-disabled)",
  divider: "var(--trv-color-divider)",
  "primary.main": "var(--trv-color-primary-main)",
  "primary.contrastText": "var(--trv-color-primary-contrast)",
  "error.main": "var(--trv-color-error-main)",
  "warning.main": "var(--trv-color-warning-main)",
  "info.main": "var(--trv-color-info-main)",
  "success.main": "var(--trv-color-success-main)",
  "background.paper": "var(--trv-color-bg-paper)",
  "background.default": "var(--trv-color-bg-default)",
  "action.hover": "var(--trv-color-action-hover)",
  "action.selected": "var(--trv-color-action-selected)",
  "action.disabled": "var(--trv-color-text-disabled)",
  "action.active": "var(--trv-color-text-secondary)",
  "primary.bg": "var(--trv-color-primary-bg)",
};

/** MUI テーマ色トークン文字列なら CSS 変数へ、そうでなければそのまま返す。 */
export function mapColorToken(value: string): string {
  return COLOR_TOKEN_MAP[value] ?? value;
}

const SPACING_UNIT = 8;
const RADIUS_UNIT = 4;

// spacing shorthand → 展開先 longhand プロパティ。
const SPACING_SHORTHAND: Record<string, readonly (keyof CSSProperties)[]> = {
  p: ["padding"],
  px: ["paddingLeft", "paddingRight"],
  py: ["paddingTop", "paddingBottom"],
  pt: ["paddingTop"],
  pb: ["paddingBottom"],
  pl: ["paddingLeft"],
  pr: ["paddingRight"],
  m: ["margin"],
  mx: ["marginLeft", "marginRight"],
  my: ["marginTop", "marginBottom"],
  mt: ["marginTop"],
  mb: ["marginBottom"],
  ml: ["marginLeft"],
  mr: ["marginRight"],
};

const COLOR_KEYS = new Set(["color", "backgroundColor", "borderColor"]);

function spacingValue(v: unknown): string | number | undefined {
  if (typeof v === "number") return `${v * SPACING_UNIT}px`;
  if (typeof v === "string") return v;
  return undefined;
}

/** sx 風オブジェクトを CSSProperties に変換する。`undefined` を渡すと `undefined` を返す。 */
export function sxToStyle(
  sx: Record<string, unknown> | undefined,
): CSSProperties | undefined {
  if (!sx) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(sx)) {
    if (raw == null) continue;

    // ネスト/擬似セレクタ（`&:hover` / `& .x` / `&::-webkit-scrollbar` 等）や
    // レスポンシブ/ネストオブジェクト値は inline style では表現できない。
    // React に渡すと "Unsupported style property" 警告が出るためここで除外する
    // （元々 inline では効かないため挙動上の損失はなし。必要なら className/CSS で代替）。
    if (key.startsWith("&") || key.includes(":")) continue;
    if (typeof raw === "object" && !Array.isArray(raw)) continue;

    // spacing shorthand
    const targets = SPACING_SHORTHAND[key];
    if (targets) {
      const val = spacingValue(raw);
      if (val !== undefined) for (const t of targets) out[t as string] = val;
      continue;
    }

    if (key === "gap" || key === "rowGap" || key === "columnGap") {
      out[key] = spacingValue(raw);
      continue;
    }

    if (key === "bgcolor") {
      out.backgroundColor =
        typeof raw === "string" ? mapColorToken(raw) : raw;
      continue;
    }

    if (key === "borderRadius") {
      out.borderRadius =
        typeof raw === "number" ? `${raw * RADIUS_UNIT}px` : raw;
      continue;
    }

    if (COLOR_KEYS.has(key) && typeof raw === "string") {
      out[key] = mapColorToken(raw);
      continue;
    }

    out[key] = raw;
  }
  return out as CSSProperties;
}
