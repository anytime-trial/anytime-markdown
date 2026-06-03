#!/usr/bin/env node
// vendored tiptap (`@anytime-markdown/markdown-*`) の tsconfig paths を
// packages/markdown-core/alias.cjs（webpack/turbopack/jest 解決の単一源）から導出し、
// 単一プログラムで vendored ソースをインライン展開する consumer の tsconfig に同期する。
//
// 背景: next build（web-app）は project references を使わず paths→src でソースを
// 1 つのプログラムに展開するため、consumer 側に vendored namespace の完全な paths が必要。
// alias.cjs を真実源とし、本スクリプトで drift を防ぐ。
//
// 使い方:
//   node scripts/sync-vendored-tsconfig-paths.mjs --write [--tsconfig <path>]
//   node scripts/sync-vendored-tsconfig-paths.mjs --check [--tsconfig <path>]
// 既定の対象 tsconfig は packages/web-app/tsconfig.json。
//
// 注意: tsconfig 全体を再シリアライズすると lib/types 等のインライン配列まで整形が
// 変わるため、"paths" ブロックのみをテキストで外科的に編集し、他の整形は保持する。

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const mode = args.includes('--write') ? 'write' : args.includes('--check') ? 'check' : null;
const tsconfigArgIdx = args.indexOf('--tsconfig');
const tsconfigRel =
  tsconfigArgIdx >= 0 ? args[tsconfigArgIdx + 1] : 'packages/web-app/tsconfig.json';

if (!mode) {
  console.error('Usage: sync-vendored-tsconfig-paths.mjs --write|--check [--tsconfig <path>]');
  process.exit(2);
}

const tsconfigPath = path.resolve(repoRoot, tsconfigRel);
const tsconfigDir = path.dirname(tsconfigPath);

// vendored consumer かどうかの判定（viewer/rich/engine は consumer 自身の依存なので保持する）。
// markdown-engine はフレームワーク非依存層で vendored tiptap (alias.cjs) ではないが、
// markdown-* prefix に合致するため明示的に除外しないと vendored と誤分類され除去される。
// 除去すると next build(web-app) が paths→src で取り込む markdown-viewer ソースの
// markdown-engine import を解決できず型エラーで落ちる。
const isVendoredKey = (k) =>
  k.startsWith('@anytime-markdown/markdown-') &&
  !/^@anytime-markdown\/markdown-(viewer|rich|engine)(\/|$)/.test(k);

function buildVendoredPaths() {
  const alias = require(path.join(repoRoot, 'packages/markdown-core/alias.cjs'));
  const entries = alias.buildAliasEntries();
  const out = {};
  for (const e of entries) {
    const request = (e.request ?? e[0]).replace(/\$$/, '');
    const target = e.target ?? e[1];
    let rel = path.relative(tsconfigDir, target).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    out[request] = rel;
  }
  return out;
}

const raw = readFileSync(tsconfigPath, 'utf8');

// "paths": { ... } ブロックを抽出（バランスの取れた最初の波括弧まで）。
const pathsKeyIdx = raw.indexOf('"paths"');
if (pathsKeyIdx < 0) {
  console.error(`[sync-vendored] no "paths" block in ${tsconfigRel}`);
  process.exit(2);
}
const openIdx = raw.indexOf('{', pathsKeyIdx);
let depth = 0;
let closeIdx = -1;
for (let i = openIdx; i < raw.length; i++) {
  if (raw[i] === '{') depth++;
  else if (raw[i] === '}') {
    depth--;
    if (depth === 0) {
      closeIdx = i;
      break;
    }
  }
}
const inner = raw.slice(openIdx + 1, closeIdx);

// 既存エントリ行をパースし、非 vendored を順序保持で残す。
const entryRe = /"((?:[^"\\]|\\.)+)"\s*:\s*\[\s*"((?:[^"\\]|\\.)+)"\s*\]/g;
const preserved = [];
let m;
while ((m = entryRe.exec(inner)) !== null) {
  if (!isVendoredKey(m[1])) preserved.push([m[1], m[2]]);
}

const vendored = buildVendoredPaths();

// 6 スペースインデントで paths ブロックを再構成（preserved を先頭、vendored を続ける）。
const indent = '      ';
const lines = [];
for (const [k, v] of preserved) lines.push(`${indent}"${k}": ["${v}"]`);
for (const [k, v] of Object.entries(vendored)) lines.push(`${indent}"${k}": ["${v}"]`);
const newInner = '\n' + lines.join(',\n') + '\n    ';

const newRaw = raw.slice(0, openIdx + 1) + newInner + raw.slice(closeIdx);

if (mode === 'check') {
  if (newRaw === raw) {
    console.log(`[sync-vendored] in sync: ${tsconfigRel}`);
    process.exit(0);
  }
  console.error(
    `[sync-vendored] OUT OF SYNC: ${tsconfigRel}\n` +
      `Run: node scripts/sync-vendored-tsconfig-paths.mjs --write`,
  );
  process.exit(1);
}

// write
writeFileSync(tsconfigPath, newRaw);
console.log(
  `[sync-vendored] wrote ${Object.keys(vendored).length} vendored paths to ${tsconfigRel}`,
);
