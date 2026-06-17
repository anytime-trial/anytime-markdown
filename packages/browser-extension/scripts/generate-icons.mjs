/**
 * 拡張アイコン PNG を生成する（16 / 32 / 48 / 128 px）。
 *
 * VS Code markdown 拡張（`packages/vscode-markdown-extension/images/camel_markdown.png`）と
 * 同一のキャメル + M ロゴを正式アイコンとして使う。本パッケージにも同じ画像が
 * `public/images/camel_markdown.png` に同梱されており（md5 一致）、これを各サイズへ
 * 高品質縮小（lanczos3・アルファ保持）して書き出す。
 *
 * 生成済みアイコンは `public/icons/` にコミット済みのため、通常ビルドでは再生成不要。
 * ソース画像を差し替えた場合のみ、本スクリプトを手動実行して更新する。
 *
 * 依存: sharp（monorepo ルートに導入済み）。
 *   実行例: `node scripts/generate-icons.mjs`（packages/browser-extension で）。
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const SRC = "public/images/camel_markdown.png";
const SIZES = [16, 32, 48, 128];

mkdirSync("public/icons", { recursive: true });

await Promise.all(
  SIZES.map((size) =>
    sharp(SRC)
      .resize(size, size, {
        kernel: "lanczos3",
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toFile(`public/icons/icon-${size}.png`),
  ),
);

console.log(`[browser-extension] icons generated from ${SRC}: ${SIZES.join(", ")}`);
