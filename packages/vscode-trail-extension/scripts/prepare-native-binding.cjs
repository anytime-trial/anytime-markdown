#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// VS Code Extension Host が使う Node のバージョン (現状 v22) 向けの
// better-sqlite3 prebuilt binary を `prebuilt-vscode/` にダウンロードする。
//
// なぜ手動で配置するか:
// - `npm rebuild better-sqlite3` だとホストの Node バージョン (例: v24) 用に
//   binary が上書きされ、VS Code 内では `NODE_MODULE_VERSION mismatch` エラーになる。
// - 一方ホスト側 jest テストではホスト Node 互換の binary が必要。
// - そこで「ホスト用 binary は `node_modules/better-sqlite3/build/Release/` のまま」
//   「VS Code 用 binary は `prebuilt-vscode/` に並行配置」する戦略を採る。
// - webpack CopyPlugin が prebuilt-vscode/better_sqlite3.node を
//   dist/node_modules/better-sqlite3/build/Release/ にコピーすることで両立する。

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const VSCODE_NODE_TARGET = process.env.VSCODE_NODE_TARGET || '22.18.0';
// matrix CI で他プラットフォーム/アーキ向け binary をダウンロードしたい場合に
// TARGET_ARCH / TARGET_PLATFORM を指定する (例: ubuntu-x64 runner で linux-arm64
// 用 binary を取得する)。未指定ならホスト値を使う (= 既存のローカル開発挙動)。
const TARGET_ARCH = process.env.TARGET_ARCH || null;
const TARGET_PLATFORM = process.env.TARGET_PLATFORM || null;

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const betterSqlite3Root = path.join(repoRoot, 'node_modules', 'better-sqlite3');
const sourceBinding = path.join(betterSqlite3Root, 'build', 'Release', 'better_sqlite3.node');
const prebuiltDir = path.resolve(__dirname, '..', 'prebuilt-vscode');
const prebuiltBinding = path.join(prebuiltDir, 'better_sqlite3.node');

function nodeModuleVersion(binaryPath) {
  if (!fs.existsSync(binaryPath)) return null;
  const Module = require('module');
  const m = new Module('probe');
  m.filename = binaryPath;
  try {
    process.dlopen(m, binaryPath);
    return process.versions.modules; // already loaded → matches host
  } catch (err) {
    const match = /NODE_MODULE_VERSION (\d+)/.exec(err.message || '');
    return match ? match[1] : null;
  }
}

function log(msg) {
  console.log(`[prepare-native] ${msg}`);
}

function backupHostBinding() {
  if (!fs.existsSync(sourceBinding)) return null;
  const tmp = `${sourceBinding}.host-backup`;
  fs.copyFileSync(sourceBinding, tmp);
  return tmp;
}

function restoreHostBinding(tmp) {
  if (!tmp || !fs.existsSync(tmp)) return;
  fs.copyFileSync(tmp, sourceBinding);
  fs.unlinkSync(tmp);
}

function downloadVscodeBinding() {
  // prebuild-install のキャッシュ機構を使うため一旦 source の場所にダウンロードして
  // prebuilt-vscode/ に move する。直接 --path で別ディレクトリへ書くと
  // prebuild-install が package.json の場所を見失うため、source 位置のダウンロード
  // → mv のステップを踏む。
  const archDesc = TARGET_ARCH ? ` arch=${TARGET_ARCH}` : '';
  const platformDesc = TARGET_PLATFORM ? ` platform=${TARGET_PLATFORM}` : '';
  log(`downloading better-sqlite3 prebuilt for Node v${VSCODE_NODE_TARGET}${platformDesc}${archDesc}...`);
  const args = ['prebuild-install', '--runtime=node', `--target=${VSCODE_NODE_TARGET}`];
  if (TARGET_ARCH) args.push(`--arch=${TARGET_ARCH}`);
  if (TARGET_PLATFORM) args.push(`--platform=${TARGET_PLATFORM}`);
  // Windows では `npx` ではなく `npx.cmd` を解決する必要があるため shell 経由で実行する。
  // shell なしだと spawn が exit null で abrupt termination する (CI で再現)。
  const result = spawnSync('npx', args, {
    cwd: betterSqlite3Root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error('prebuild-install failed (exit ' + result.status + ')');
  }
  if (!fs.existsSync(sourceBinding)) {
    throw new Error(`expected ${sourceBinding} to exist after prebuild-install`);
  }
  fs.mkdirSync(prebuiltDir, { recursive: true });
  fs.copyFileSync(sourceBinding, prebuiltBinding);
  log(`copied vscode binding → ${prebuiltBinding}`);
}

function main() {
  // 既存 prebuilt-vscode/ binding が VS Code Node 互換ならスキップ。
  // ただし TARGET_ARCH / TARGET_PLATFORM が指定された場合はクロスビルドの可能性が
  // あり、キャッシュされた binary は別アーキの可能性があるため再ダウンロードする。
  if (fs.existsSync(prebuiltBinding) && !TARGET_ARCH && !TARGET_PLATFORM) {
    log(`reusing existing ${prebuiltBinding}`);
    return;
  }
  const hostBackup = backupHostBinding();
  try {
    downloadVscodeBinding();
  } finally {
    // テスト用に host 用 binary を復元
    restoreHostBinding(hostBackup);
    const ver = nodeModuleVersion(sourceBinding);
    log(`source binding now NODE_MODULE_VERSION=${ver ?? '?'} (host)`);
  }
}

main();
