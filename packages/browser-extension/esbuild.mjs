/**
 * 拡張パッケージのビルド（rich エディタ版）。
 *
 * 1. src/editor.ts を bundle して dist/editor.js（`<anytime-markdown-rich-editor>` 登録 + 自動保存）
 *    - mermaid / plotly / jsxgraph 等は動的 import のため code splitting で遅延チャンク化
 *    - katex の CSS は dist/editor.css に抽出、フォント(woff2/woff/ttf)は file loader で同梱
 * 2. src/background.js を bundle して dist/background.js（MV3 service worker）
 * 3. public/ 配下（manifest.json / editor.html / icons）を dist/ にコピー
 *
 * markdown-rich は本来 ESM 配布で重量 peer を external にするが、拡張は CSP（script-src 'self'）
 * のため外部 CDN を読めない。よってここでは全 peer を bundle し、フォント等も拡張内へ同梱する。
 *
 * 注意: workspace パッケージの解決に node_modules の symlink が要るため、
 * ビルド前にリポジトリルートで `npm install` が必要。
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

const fileLoaders = {
  ".md": "text",
  ".woff2": "file",
  ".woff": "file",
  ".ttf": "file",
  ".eot": "file",
  ".png": "file",
  ".svg": "file",
  ".gif": "file",
};

// メインエントリ: 動的 import を抱えるため splitting + outdir。
await build({
  entryPoints: ["src/editor.ts"],
  bundle: true,
  format: "esm",
  splitting: true,
  outdir: OUT_DIR,
  target: "es2023",
  platform: "browser",
  sourcemap: false,
  minify: true,
  loader: fileLoaders,
  // 重量ライブラリ（mathjs/mermaid/d3 等）の process.env / global 参照を解決。
  define: { "process.env.NODE_ENV": '"production"', global: "globalThis" },
  // 遅延チャンク / アセット名を整理。
  chunkNames: "chunks/[name]-[hash]",
  assetNames: "assets/[name]-[hash]",
});

// service worker: import を持たない単一ファイル。
await build({
  entryPoints: ["src/background.js"],
  bundle: true,
  format: "esm",
  target: "es2023",
  platform: "browser",
  sourcemap: false,
  minify: true,
  outfile: `${OUT_DIR}/background.js`,
});

// 静的アセット（manifest / html / icons）をコピー。
cpSync("public", OUT_DIR, { recursive: true });

console.log(`[browser-extension] build done → ${OUT_DIR}/`);
