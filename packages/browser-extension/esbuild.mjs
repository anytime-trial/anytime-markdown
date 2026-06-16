/**
 * 拡張パッケージのビルド。
 *
 * 1. src/editor.ts を bundle して dist/editor.js（`<anytime-markdown-editor>` 登録 + 自動保存）
 * 2. src/background.js を bundle して dist/background.js（MV3 service worker）
 * 3. public/ 配下（manifest.json / editor.html / icons）を dist/ にコピー
 *
 * markdown-viewer の配布ビルドと同じく React / MUI は含まれない。peer の dompurify / diff は
 * 拡張内で自己完結させるため external にせず bundle する（CSP の script-src 'self' 制約のため
 * 外部 CDN 読み込みは不可）。
 *
 * 注意: workspace パッケージ（@anytime-markdown/markdown-viewer 等）の解決に node_modules の
 * symlink が要るため、ビルド前にリポジトリルートで `npm install` が必要。
 */
import { build } from "esbuild";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";

const OUT_DIR = "dist";

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

// アイコン未生成なら生成する。
if (!existsSync("public/icons") || readdirSync("public/icons").length === 0) {
  await import("./scripts/generate-icons.mjs");
}

const common = {
  bundle: true,
  format: "esm",
  target: "es2023",
  sourcemap: false,
  // raw .md import（テンプレート / 初期コンテンツ）を文字列として取り込む。
  loader: { ".md": "text" },
};

await build({
  ...common,
  entryPoints: ["src/editor.ts"],
  outfile: `${OUT_DIR}/editor.js`,
});

await build({
  ...common,
  entryPoints: ["src/background.js"],
  outfile: `${OUT_DIR}/background.js`,
});

// 静的アセット（manifest / html / icons）をコピー。
cpSync("public", OUT_DIR, { recursive: true });

console.log(`[browser-extension] build done → ${OUT_DIR}/`);
