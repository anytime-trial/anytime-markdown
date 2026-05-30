#!/usr/bin/env node
// 指定した VS Code 拡張パッケージが依存する in-repo workspace パッケージのうち、
// 「ビルド出力 (out/ dist/ lib/) を main/exports で公開し、かつ build スクリプトを
// 持つ」ものを推移的閉包・topological 順で `npm run build` する。
//
// 背景: 各 build-*.sh は `npm install --ignore-scripts` 後に拡張を webpack する。
// vscode-common のように exports が `./out/index.js` を指すパッケージは tsc ビルドの
// 出力が無いと webpack が `Module not found` で失敗する (build スクリプトが prepare/
// postinstall でないため install では生成されない)。本ヘルパーで packaging 前に
// 必要な依存だけを確実にビルドする。
//
// 使い方: node _build-workspace-deps.mjs <extension-package-dir>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');
const SCOPE = '@anytime-markdown/';

function log(message) {
  process.stdout.write(`[build-deps] ${message}\n`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// exports/main から compiled 出力 (out/ dist/ lib/) を指す文字列があるか判定する。
// exports は値が文字列 / オブジェクト (条件付き) の入れ子になり得るため再帰走査する。
const COMPILED_RE = /(^|\/)(out|dist|lib)\//;

function collectExportLeaves(node, acc) {
  if (typeof node === 'string') {
    acc.push(node);
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectExportLeaves(value, acc);
  }
}

function pointsToCompiledOutput(pkgJson) {
  const leaves = [];
  if (typeof pkgJson.main === 'string') leaves.push(pkgJson.main);
  if (typeof pkgJson.module === 'string') leaves.push(pkgJson.module);
  collectExportLeaves(pkgJson.exports, leaves);
  return leaves.some((leaf) => COMPILED_RE.test(leaf));
}

// packages/* の workspace パッケージを名前で索引する。
function loadWorkspacePackages() {
  const byName = new Map();
  for (const entry of fs.readdirSync(PACKAGES_DIR)) {
    const pkgPath = path.join(PACKAGES_DIR, entry, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    let json;
    try {
      json = readJson(pkgPath);
    } catch (err) {
      log(`WARN: ${pkgPath} の読み込みに失敗: ${err.message}`);
      continue;
    }
    if (!json.name || !json.name.startsWith(SCOPE)) continue;
    const deps = Object.keys(json.dependencies || {}).filter((d) => d.startsWith(SCOPE));
    byName.set(json.name, {
      name: json.name,
      dir: path.join(PACKAGES_DIR, entry),
      deps,
      hasBuild: Boolean(json.scripts && json.scripts.build),
      compiled: pointsToCompiledOutput(json),
    });
  }
  return byName;
}

// 与えた拡張の @anytime-markdown 依存を推移的閉包で集めつつ、
// 依存→被依存の順 (topological) で並べる。循環は訪問済みフラグで打ち切る。
function topoOrderedClosure(rootDeps, byName) {
  const ordered = [];
  const state = new Map(); // name -> 'visiting' | 'done'

  function visit(name) {
    const status = state.get(name);
    if (status === 'done') return;
    if (status === 'visiting') {
      log(`WARN: 循環依存を検出 (${name})。閉路を打ち切ります。`);
      return;
    }
    const pkg = byName.get(name);
    if (!pkg) return; // workspace 外 (公開パッケージ) は対象外
    state.set(name, 'visiting');
    for (const dep of pkg.deps) visit(dep);
    state.set(name, 'done');
    ordered.push(pkg);
  }

  for (const dep of rootDeps) visit(dep);
  return ordered;
}

function main() {
  const extDirArg = process.argv[2];
  if (!extDirArg) {
    log('ERROR: 拡張パッケージのディレクトリを引数で指定してください。');
    process.exit(1);
  }
  const extDir = path.resolve(extDirArg);
  const extPkgPath = path.join(extDir, 'package.json');
  if (!fs.existsSync(extPkgPath)) {
    log(`ERROR: ${extPkgPath} が存在しません。`);
    process.exit(1);
  }

  const extPkg = readJson(extPkgPath);
  const rootDeps = Object.keys(extPkg.dependencies || {}).filter((d) => d.startsWith(SCOPE));
  const byName = loadWorkspacePackages();

  const ordered = topoOrderedClosure(rootDeps, byName);
  const toBuild = ordered.filter((p) => p.hasBuild && p.compiled);

  if (toBuild.length === 0) {
    log(`${extPkg.name}: ビルドが必要な workspace 依存はありません。`);
    return;
  }

  log(`${extPkg.name}: ${toBuild.map((p) => p.name).join(' -> ')} をビルドします。`);
  for (const pkg of toBuild) {
    log(`building ${pkg.name} ...`);
    execFileSync('npm', ['run', 'build', '--workspace', pkg.name], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
  }
  log('workspace 依存のビルド完了。');
}

main();
