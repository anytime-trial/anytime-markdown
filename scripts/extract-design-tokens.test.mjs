import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildDesignTokens, countLiteralColors, extractFromRepo, TOKEN_MAPPING } from "./extract-design-tokens.mjs";

const colors = {
  DEFAULT_LIGHT_BG: "#F2EFE8",
  DEFAULT_DARK_BG: "#0D1117",
  ACCENT_COLOR: "#e8a012",
  ADMONITION_NOTE: "#1f6feb",
  getBgPaper: (isDark) => (isDark ? "#121212" : "#FBF9F3"),
  getPrimaryMain: (isDark) => (isDark ? "#90caf9" : "#3D4A52"),
};
const presets = {
  DEFAULT_PRESET_NAME: "handwritten",
  THEME_PRESETS: {
    handwritten: { fontFamily: '"Nunito", sans-serif', displayFont: '"Nunito", serif', borderRadius: { sm: 12, md: 20, lg: 28 } },
    professional: { fontFamily: '"Roboto", sans-serif', displayFont: '"Playfair Display", serif', borderRadius: { sm: 4, md: 8, lg: 12 } },
  },
};
const dimensions = { SPACING_SM: 16, RADIUS_FULL: "50%", MENU_ITEM_FONT_SIZE: "0.875rem", EDITOR_HEIGHT_MD: 600 };

const MAPPING = {
  modes: { background: ["DEFAULT_LIGHT_BG", "DEFAULT_DARK_BG"], surface: "getBgPaper", primary: "getPrimaryMain" },
  common: { secondary: "ACCENT_COLOR", "admonition-note": "ADMONITION_NOTE" },
};

test("ライト／ダークの値を定数とゲッターの両方から引く", () => {
  const t = buildDesignTokens({ colors, presets, dimensions, mapping: MAPPING });
  assert.deepEqual(t.light, { background: "#F2EFE8", surface: "#FBF9F3", primary: "#3D4A52" });
  assert.deepEqual(t.dark, { background: "#0D1117", surface: "#121212", primary: "#90caf9" });
});

test("モード共通の色は other に入れる", () => {
  const t = buildDesignTokens({ colors, presets, dimensions, mapping: MAPPING });
  assert.ok(t.other.some((o) => o.name === "secondary" && o.value === "#e8a012"));
  assert.ok(t.other.some((o) => o.name === "admonition-note" && o.value === "#1f6feb"));
});

test("プリセットの角丸とフォントを名前付きで other に入れ、数値は px にする", () => {
  const t = buildDesignTokens({ colors, presets, dimensions, mapping: MAPPING });
  const get = (name) => t.other.find((o) => o.name === name)?.value;
  assert.equal(get("preset.handwritten.borderRadius.md"), "20px");
  assert.equal(get("preset.professional.borderRadius.sm"), "4px");
  assert.equal(get("preset.handwritten.fontFamily"), '"Nunito", sans-serif');
  assert.equal(get("preset.default"), "handwritten");
});

test("dimensions の数値は px、文字列はそのまま", () => {
  const t = buildDesignTokens({ colors, presets, dimensions, mapping: MAPPING });
  const get = (name) => t.other.find((o) => o.name === name)?.value;
  assert.equal(get("SPACING_SM"), "16px");
  assert.equal(get("RADIUS_FULL"), "50%");
  assert.equal(get("MENU_ITEM_FONT_SIZE"), "0.875rem");
});

test("マッピングが存在しない定数を指したら例外にする（黙って欠落させない）", () => {
  assert.throws(
    () => buildDesignTokens({ colors, presets, dimensions, mapping: { modes: { x: "NO_SUCH" }, common: {} } }),
    /NO_SUCH/,
  );
});

test("ソース中の直書き色を出現数つきで数える（大文字小文字は正規化）", () => {
  const src = `a = '#FBF9F3'; b = "#fbf9f3"; c = '#000000'; d = rgba(0, 0, 0, 0.5)`;
  assert.deepEqual(countLiteralColors(src), [
    { value: "#fbf9f3", count: 2 },
    { value: "#000000", count: 1 },
    { value: "rgba(0,0,0,0.5)", count: 1 },
  ]);
});

test("実ソースを import して既定の TOKEN_MAPPING が全キー解決できる", async () => {
  const tokens = await extractFromRepo();
  for (const name of Object.keys(TOKEN_MAPPING.modes)) {
    assert.equal(typeof tokens.light[name], "string", `light.${name}`);
    assert.equal(typeof tokens.dark[name], "string", `dark.${name}`);
  }
});

test("DESIGN.md の colors はすべて抽出値に実在する（再抽出忘れの検知）", async () => {
  const tokens = await extractFromRepo();
  const pool = new Set(
    [...Object.values(tokens.light), ...Object.values(tokens.dark), ...tokens.other.map((o) => o.value), ...tokens.hardcoded.providersColors.map((c) => c.value)]
      .map((v) => String(v).toLowerCase().replaceAll(/\s+/g, "")),
  );
  const md = readFileSync(new URL("../DESIGN.md", import.meta.url), "utf8");
  const block = /^colors:\n((?: {2}.*\n)+)/m.exec(md)?.[1] ?? "";
  const entries = [...block.matchAll(/^ {2}([\w-]+): "([^"]+)"$/gm)];
  assert.ok(entries.length > 0, "colors ブロックを読めない");
  for (const [, name, value] of entries) {
    assert.ok(pool.has(value.toLowerCase().replaceAll(/\s+/g, "")), `${name} = ${value} が抽出元に無い`);
  }
});

test("マッピング先が関数でも配列でもなければ名前つきで例外にする", () => {
  assert.throws(
    () => buildDesignTokens({ colors, presets, dimensions, mapping: { modes: { x: "ACCENT_COLOR" }, common: {} } }),
    /ACCENT_COLOR/,
  );
});

test("5〜7 桁の # 表記は色として数えない", () => {
  assert.deepEqual(countLiteralColors("#abcde #1234567 #abc"), [{ value: "#abc", count: 1 }]);
});
