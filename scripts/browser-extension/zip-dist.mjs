/**
 * dist ディレクトリの中身を Chrome Web Store / Edge Add-ons 提出用 zip にパックする。
 *
 * `zip` コマンドが無い環境（WSL 等）向けのフォールバック。jszip（monorepo ルートに導入済み）で
 * DEFLATE 圧縮しつつ、アーカイブのルートに manifest.json が来るよう dist 直下の相対パスで格納する
 * （`dist/` フォルダごと包むとストア審査で弾かれるため）。
 *
 * 使い方: `node scripts/browser-extension/zip-dist.mjs <distDir> <outZip>`
 */
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

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
