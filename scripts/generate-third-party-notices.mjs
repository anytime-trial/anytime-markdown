#!/usr/bin/env node
// 配布物（ブラウザ拡張 / VS Code 拡張 / web-app 等）が bundle 同梱する第三者 OSS の
// ライセンス表記（THIRD-PARTY-NOTICES.md）を生成する。
//
// 仕組み: 指定パッケージの production dependencies を起点に推移的閉包を辿り、各依存の
// node_modules を walk-up で解決して license / copyright / LICENSE 本文を収集する。
// workspace パッケージ（@anytime-markdown/*）自体は first-party（MIT）のため列挙せず
// 依存だけ辿る。ただし markdown-core は Tiptap / tiptap-markdown を vendoring している
// （npm 依存ではない）ため、閉包に含まれる場合のみ vendored 表記を追記する。
// 同様に、対象パッケージの codegen が第三者のソースを生成ファイルへ取り込んでいる場合
// （
//
// 使い方: node scripts/generate-third-party-notices.mjs <package-dir> [out-file]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const WORKSPACE_SCOPE = "@anytime-markdown/";

const LICENSE_FILE_NAMES = [
  "LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "LICENCE.md",
  "license", "license.md", "License", "License.md", "COPYING",
];

/** 起点ディレクトリから上位 node_modules を辿り、依存パッケージの実体ディレクトリを返す。 */
function findPackageDir(depName, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, "node_modules", depName);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readLicenseText(pkgDir) {
  for (const name of LICENSE_FILE_NAMES) {
    const file = path.join(pkgDir, name);
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  }
  return null;
}

/** package.json の license フィールドが無い場合に LICENSE 本文から SPDX を推定する。 */
function inferLicenseFromText(text) {
  if (!text) return "UNKNOWN";
  if (/MIT License|Permission is hereby granted, free of charge/i.test(text)) return "MIT";
  if (/Apache License,?\s+Version 2\.0/i.test(text)) return "Apache-2.0";
  if (/ISC License/i.test(text)) return "ISC";
  if (/BSD 3-Clause|Redistribution and use .* 3\. Neither/i.test(text)) return "BSD-3-Clause";
  if (/BSD 2-Clause/i.test(text)) return "BSD-2-Clause";
  return "UNKNOWN";
}

function normalizeLicense(pkg, licenseText) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license && typeof pkg.license === "object") return pkg.license.type ?? "SEE LICENSE";
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(" OR ");
  return inferLicenseFromText(licenseText);
}

function authorString(pkg) {
  const a = pkg.author;
  if (!a) return "";
  if (typeof a === "string") return a;
  return [a.name, a.email && `<${a.email}>`, a.url && `(${a.url})`].filter(Boolean).join(" ");
}

/** depName を fromDir 起点で解決し、package 情報を返す（未解決は null）。 */
function resolvePackage(depName, fromDir) {
  const pkgDir = findPackageDir(depName, fromDir);
  if (!pkgDir) return null;
  try {
    return { pkgDir, pkg: readJson(path.join(pkgDir, "package.json")) };
  } catch (e) {
    // 壊れた package.json（空 / BOM / JSON5 等）や一時 FS エラーで配布ビルド全体を
    // 止めないよう、当該依存をスキップして継続する（識別子付きで通知＝silent catch 回避）。
    console.warn(`[third-party-notices] skip ${depName} (${pkgDir}): ${e.message}`);
    return null;
  }
}

/**
 * production 依存の推移的閉包を収集する。
 * @returns Map<string, {name,version,license,author,repository,licenseText}>（key=name@version）
 */
function collectDependencies(rootDir) {
  const collected = new Map();
  const seen = new Set();
  let includesMarkdownCore = false;

  /** @param {string} fromDir 依存解決の起点 @param {Record<string,string>} deps */
  function walk(fromDir, deps) {
    for (const depName of Object.keys(deps ?? {})) {
      const resolved = resolvePackage(depName, fromDir);
      if (!resolved) continue;
      const { pkgDir, pkg } = resolved;
      const id = `${pkg.name}@${pkg.version}`;
      if (seen.has(id)) continue;
      seen.add(id);

      const isWorkspace = depName.startsWith(WORKSPACE_SCOPE);
      if (depName === `${WORKSPACE_SCOPE}markdown-core`) includesMarkdownCore = true;

      // first-party（workspace）は列挙せず依存だけ辿る。外部依存は notices へ収集。
      if (!isWorkspace) {
        const licenseText = readLicenseText(pkgDir);
        collected.set(id, {
          name: pkg.name,
          version: pkg.version,
          license: normalizeLicense(pkg, licenseText),
          author: authorString(pkg),
          repository:
            typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url ?? "",
          licenseText,
        });
      }
      walk(pkgDir, pkg.dependencies);
    }
  }

  const rootPkg = readJson(path.join(rootDir, "package.json"));
  walk(rootDir, rootPkg.dependencies);
  return { collected, includesMarkdownCore, rootPkg };
}

/** 生成ファイルが取り込み元を宣言する機械可読マーカー。codegen 側が同じ書式で出力する。 */
const VENDORED_FROM_PATTERN = /^\/\/ vendored-from: (\S+?)@(\S+) \(([^)]+)\) (\S+)$/m;

/**
 * 対象パッケージの `src` 配下から `*.generated.ts` を集め、vendored-from マーカーを読む。
 *
 * Why not: パッケージ名やパスを直書きしない。取り込みを増やすたびに本スクリプトを直す運用は
 * 「追記し忘れ＝表記から黙って消える」を招く。宣言の在り処を生成ファイル側に置く。
 */
function collectVendoredFromMarkers(targetDir) {
  const found = new Map();
  const roots = [path.join(targetDir, "src")];
  while (roots.length > 0) {
    const dir = roots.pop();
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") roots.push(full);
        continue;
      }
      if (!entry.name.endsWith(".generated.ts")) continue;
      const match = VENDORED_FROM_PATTERN.exec(fs.readFileSync(full, "utf8"));
      if (!match) continue;
      const [, name, version, license, url] = match;
      found.set(name, { name, version, license, url, from: path.relative(REPO_ROOT, full) });
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** vendored-from マーカーで宣言された取り込み元の表記を組み立てる。 */
function renderVendoredFromNotice(markers, targetDir) {
  if (markers.length === 0) return "";
  const sections = markers.map((m) => {
    const pkgDir = findPackageDir(m.name, targetDir);
    const licenseText = pkgDir ? readLicenseText(pkgDir) : null;
    const body = licenseText
      ? "```\n" + licenseText + "\n```"
      : `_LICENSE file not resolvable at generation time; SPDX license identifier: ${m.license}._`;
    return [
      `### ${m.name} (v${m.version}) — ${m.license}`,
      "",
      `Source: ${m.url}`,
      `Embedded into: \`${m.from}\``,
      "",
      body,
    ].join("\n");
  });
  return [
    "## Vendored sources (embedded by codegen)",
    "",
    "The following projects are not npm dependencies of this package. Portions of their",
    "source (icon path data and similar) are embedded into generated modules and shipped",
    "in this distribution.",
    "",
    sections.join("\n\n"),
  ].join("\n");
}

/** vendored（npm 依存でない）Tiptap / tiptap-markdown の表記。 */
const VENDORED_NOTICE = `## Vendored sources (bundled via @anytime-markdown/markdown-core)

The following projects are vendored (source-copied) into \`packages/markdown-core\`
and bundled into this distribution. Their MIT license and copyright are reproduced here.

### Tiptap (v3.20.0) — MIT License

Copyright (c) Tiptap GmbH

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.

Source: https://github.com/ueberdosis/tiptap

### tiptap-markdown (v0.9.0) — MIT License

Copyright (c) 2021, Antoine Guingand

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.

Source: https://github.com/aguingand/tiptap-markdown
`;

function render(targetName, entries, includesMarkdownCore, vendoredFromNotice) {
  const sorted = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
  const breakdown = {};
  for (const e of sorted) breakdown[e.license] = (breakdown[e.license] ?? 0) + 1;

  const head = `# Third-Party Notices

This file lists the third-party open-source software bundled into **${targetName}**
and reproduces their licenses, as required by their terms (e.g. the MIT/BSD/ISC/Apache-2.0
permission-and-copyright-notice requirement). Generated by
\`scripts/generate-third-party-notices.mjs\`.

Total third-party packages: ${sorted.length}
License summary: ${Object.entries(breakdown)
    .sort()
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ")}

---

`;

  const body = sorted
    .map((e) => {
      const lines = [`## ${e.name} ${e.version} — ${e.license}`];
      if (e.author) lines.push(`Author: ${e.author}`);
      if (e.repository) lines.push(`Repository: ${e.repository.replace(/^git\+/, "").replace(/\.git$/, "")}`);
      lines.push("");
      lines.push(
        e.licenseText
          ? "```\n" + e.licenseText + "\n```"
          : `_No LICENSE file shipped; SPDX license identifier: ${e.license}._`,
      );
      return lines.join("\n");
    })
    .join("\n\n---\n\n");

  const vendored = includesMarkdownCore ? `\n\n---\n\n${VENDORED_NOTICE}` : "";
  const embedded = vendoredFromNotice ? `\n\n---\n\n${vendoredFromNotice}` : "";
  return `${head}${body}${vendored}${embedded}\n`;
}

function main() {
  const targetArg = process.argv[2];
  if (!targetArg) {
    console.error("usage: node scripts/generate-third-party-notices.mjs <package-dir> [out-file]");
    process.exit(1);
  }
  const targetDir = path.resolve(REPO_ROOT, targetArg);
  const outFile = process.argv[3]
    ? path.resolve(REPO_ROOT, process.argv[3])
    : path.join(targetDir, "THIRD-PARTY-NOTICES.md");

  const { collected, includesMarkdownCore, rootPkg } = collectDependencies(targetDir);
  const vendoredFrom = collectVendoredFromMarkers(targetDir);
  const content = render(
    rootPkg.name ?? targetArg,
    collected,
    includesMarkdownCore,
    renderVendoredFromNotice(vendoredFrom, targetDir),
  );
  fs.writeFileSync(outFile, content);
  console.log(
    `[third-party-notices] ${collected.size} packages → ${path.relative(REPO_ROOT, outFile)}` +
      (includesMarkdownCore ? " (+ vendored Tiptap/tiptap-markdown)" : "") +
      (vendoredFrom.length > 0
        ? ` (+ embedded ${vendoredFrom.map((m) => `${m.name}@${m.version}`).join(", ")})`
        : ""),
  );
}

main();
