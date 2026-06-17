/**
 * dist ディレクトリの中身を Chrome Web Store / Edge Add-ons 提出用 zip にパックする。
 *
 * `zip` コマンドが無い環境（WSL 等）向けのフォールバック。DEFLATE 圧縮しつつ、アーカイブの
 * ルートに manifest.json が来るよう dist 直下の相対パスで格納する（`dist/` フォルダごと包むと
 * ストア審査で弾かれるため）。
 *
 * jszip は monorepo ルートの node_modules に推移的に存在するものを解決する（直接依存ではない）。
 * 解決できない場合は明確なエラーで手動対応（`zip` のインストール or ルートで `npm install`）を促す。
 *
 * 使い方: `node scripts/browser-extension/zip-dist.mjs <distDir> <outZip>`
 */
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const require = createRequire(import.meta.url);
let JSZip;
try {
  JSZip = require("jszip");
} catch (error) {
  console.error(
    "[zip-dist] jszip を解決できませんでした（推移的依存のため未解決の可能性）。" +
      "`zip` コマンドをインストールするか、リポジトリルートで `npm install` してください。\n" +
      `  原因: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

const [distDir, outZip] = process.argv.slice(2);
if (!distDir || !outZip) {
  console.error("usage: node zip-dist.mjs <distDir> <outZip>");
  process.exit(1);
}

const zip = new JSZip();

/** distDir 配下を再帰的に走査し、dist ルートからの相対パスで zip へ追加する。 */
function addDir(absDir) {
  for (const entry of readdirSync(absDir)) {
    const abs = join(absDir, entry);
    if (statSync(abs).isDirectory()) {
      addDir(abs);
    } else {
      // zip 内パスは常に "/" 区切り（ストア・OS 非依存）。
      const rel = relative(distDir, abs).split(sep).join("/");
      zip.file(rel, readFileSync(abs));
    }
  }
}

addDir(distDir);

const buf = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 },
});
writeFileSync(outZip, buf);
console.log(`Packaged (jszip): ${outZip} (${buf.length} bytes)`);
