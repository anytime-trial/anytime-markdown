#!/usr/bin/env node
// DESIGN.md（リポジトリ直下）の抽出元トークンを TypeScript 定数から取り出し、
// design-md スキルの check-values.mjs が読む tokens.json と同じ形で標準出力へ書く。
//
// 使い方: node scripts/extract-design-tokens.mjs > tokens.json
//         （Node 24 の型除去で .ts を直接 import する。ビルド不要）
//
// 抽出元は design.md（spec/10.web-app）冒頭「実装参照」のコード側:
//   packages/markdown-editor/src/constants/{colors,themePresets,dimensions}.ts
//   packages/web-app/src/app/[locale]/providers.tsx（MUI テーマ。直書き色だけを数える）
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * トークン名 → 抽出元の対応。providers.tsx の MUI palette と同じ定数・ゲッターを指す。
 * modes の値は `[ライト定数, ダーク定数]` か、`(isDark) => string` のゲッター名。
 * common はモード共通の定数名。
 */
export const TOKEN_MAPPING = {
  modes: {
    background: ["DEFAULT_LIGHT_BG", "DEFAULT_DARK_BG"],
    surface: "getBgPaper",
    "on-surface": "getTextPrimary",
    "on-surface-variant": "getTextSecondary",
    "on-surface-disabled": "getTextDisabled",
    "editor-text": ["DEFAULT_LIGHT_TEXT", "DEFAULT_DARK_TEXT"],
    divider: "getDivider",
    hover: "getActionHover",
    selected: "getActionSelected",
    primary: "getPrimaryMain",
    "primary-strong": "getPrimaryDark",
    "primary-soft": "getPrimaryLight",
    "on-primary": "getPrimaryContrast",
    error: "getErrorMain",
    warning: "getWarningMain",
    "warning-light": "getWarningLight",
    success: "getSuccessMain",
    info: "getInfoMain",
    "code-surface": ["DEFAULT_LIGHT_CODE_BG", "DEFAULT_DARK_CODE_BG"],
    "heading-surface": ["DEFAULT_LIGHT_HEADING_BG", "DEFAULT_DARK_HEADING_BG"],
    "heading-link": ["DEFAULT_LIGHT_HEADING_LINK", "DEFAULT_DARK_HEADING_LINK"],
  },
  common: {
    secondary: "ACCENT_COLOR",
    "secondary-alpha": "ACCENT_COLOR_ALPHA",
    "admonition-note": "ADMONITION_NOTE",
    "admonition-tip": "ADMONITION_TIP",
    "admonition-important": "ADMONITION_IMPORTANT",
    "admonition-warning": "ADMONITION_WARNING",
    "admonition-caution": "ADMONITION_CAUTION",
  },
};

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;

function normalizeColor(value) {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "");
}

function toCss(value) {
  return typeof value === "number" ? `${value}px` : String(value);
}

function pick(colors, name) {
  if (!(name in colors)) throw new Error(`抽出元に ${name} がありません`);
  return colors[name];
}

function resolveMode(colors, source, isDark) {
  if (Array.isArray(source)) return pick(colors, source[isDark ? 1 : 0]);
  return pick(colors, source)(isDark);
}

/** ソース文字列の直書き色（hex / rgb / rgba）を出現数の多い順に数える。 */
export function countLiteralColors(source) {
  const tally = new Map();
  for (const m of source.match(COLOR_RE) ?? []) {
    const v = normalizeColor(m);
    tally.set(v, (tally.get(v) ?? 0) + 1);
  }
  return [...tally].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

/** 読み込んだ定数モジュールから tokens.json 形式のオブジェクトを組み立てる。 */
export function buildDesignTokens({ colors, presets, dimensions, mapping = TOKEN_MAPPING, providersSource = "" }) {
  const light = {};
  const dark = {};
  for (const [name, source] of Object.entries(mapping.modes)) {
    light[name] = resolveMode(colors, source, false);
    dark[name] = resolveMode(colors, source, true);
  }

  const other = Object.entries(mapping.common).map(([name, source]) => ({ name, value: pick(colors, source) }));
  other.push({ name: "preset.default", value: presets.DEFAULT_PRESET_NAME });
  for (const [presetName, preset] of Object.entries(presets.THEME_PRESETS)) {
    other.push({ name: `preset.${presetName}.fontFamily`, value: preset.fontFamily });
    other.push({ name: `preset.${presetName}.displayFont`, value: preset.displayFont });
    for (const [level, px] of Object.entries(preset.borderRadius)) {
      other.push({ name: `preset.${presetName}.borderRadius.${level}`, value: toCss(px) });
    }
  }
  for (const [name, value] of Object.entries(dimensions)) {
    if (typeof value === "number" || typeof value === "string") other.push({ name, value: toCss(value) });
  }

  return { light, dark, other, hardcoded: { providersColors: countLiteralColors(providersSource) } };
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const constants = join(root, "packages/markdown-editor/src/constants");
  const load = (file) => import(pathToFileURL(join(constants, file)).href);
  const [colors, presets, dimensions] = await Promise.all([
    load("colors.ts"),
    load("themePresets.ts"),
    load("dimensions.ts"),
  ]);
  const providersSource = readFileSync(join(root, "packages/web-app/src/app/[locale]/providers.tsx"), "utf8");
  const tokens = buildDesignTokens({ colors, presets, dimensions, providersSource });
  process.stdout.write(`${JSON.stringify(tokens, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
