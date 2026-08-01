#!/usr/bin/env node
// check-readme-package-graph.mjs — README の依存図が実態と一致しているかの CI ゲート。
//
// README.ja.md / README.md の「プロジェクト構成」に置いた mermaid 依存図は、手書きゆえに
// パッケージの追加・改名へ追随せず腐る。実際 2026-05-31 の名前玉突き
// (markdown-core -> markdown-viewer / tiptap-vendor -> markdown-core) に約 2 か月間
// 追随しておらず、markdown-core を「エディタエンジン」と説明したまま放置されていた。
// この乖離が markdown-viewer と markdown-rich の依存の向きを逆に読む誤解を生んだため、
// 図の主張を packages/*/package.json の実依存と機械的に突合する。
//
// 検査する 5 点:
//   1. ja / en の図がノード集合・エッジ集合ともに一致するか(片方だけ更新する事故を防ぐ)
//   2. 全エッジが図中で宣言済みのノードを指すか
//   3. 全エッジが実際の @anytime-markdown/* 依存に裏付けられるか(BUNDLER_ONLY を除く)
//   4. 図に出したノードが孤立していないか(依存ゼロが正しい ORPHAN_OK を除く)
//   5. mermaid ブロック自体が見つかるか(見つからないまま「エラーなし」で通す fail-open を防ぐ)
//
// 使い方: node scripts/check-readme-package-graph.mjs [repoRoot]
//   repoRoot 省略時はリポジトリルート。終了コード: 乖離検出時のみ 1。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** 図のノード ID -> 実パッケージ名。複数を 1 ノードに束ねている場合は配列。 */
export const ID_TO_PKG = {
  MV: ['markdown-viewer'],
  MR: ['markdown-rich'],
  MC: ['markdown-core'],
  GC: ['graph-core'],
  TC: ['trail-core'],
  CC: ['cms-core'],
  AC: ['agent-core'],
  SC: ['spreadsheet-core', 'trace-core'],
  DC: ['database-core'],
  TV: ['trail-viewer'],
  GV: ['graph-viewer'],
  SV: ['spreadsheet-viewer'],
  CV: ['cooccurrence-viewer'],
  DV: ['database-viewer'],
  WA: ['web-app'],
  VME: ['vscode-markdown-extension'],
  VTE: ['vscode-trail-extension'],
  VAE: ['vscode-agent-extension'],
  VGE: ['vscode-graph-extension'],
  VDE: ['vscode-database-extension'],
  VSE: ['vscode-sheet-extension', 'vscode-history-extension'],
  VEP: ['vscode-extension-pack'],
  MM: ['mcp-markdown'],
  MG: ['mcp-graph'],
  MT: ['mcp-trail'],
  MCM: ['mcp-cms', 'mcp-cms-remote'],
};

// package.json に現れない既知の依存。README の注記と対で維持する。
// vscode-trail-extension は trail-viewer を webpack の transpile 対象として取り込む。
export const BUNDLER_ONLY = new Set(['VTE->TV']);

// 内部依存を持たないのが正しいノード(束ねるだけの拡張パック等)。
export const ORPHAN_OK = new Set(['VEP']);

const EDGE_KEY = (from, to) => from + '->' + to;

/** packages 配下の各 package.json から @anytime-markdown スコープの依存を集める。 */
export function collectInternalDeps(repoRoot) {
  const map = new Map();
  const packagesDir = join(repoRoot, 'packages');
  if (!existsSync(packagesDir)) return map;
  for (const entry of readdirSync(packagesDir)) {
    const manifest = join(packagesDir, entry, 'package.json');
    if (!existsSync(manifest)) continue;
    const json = JSON.parse(readFileSync(manifest, 'utf8'));
    const deps = Object.keys({ ...json.dependencies, ...json.devDependencies })
      .filter((name) => name.startsWith('@anytime-markdown/'))
      .map((name) => name.slice('@anytime-markdown/'.length));
    map.set(entry, new Set(deps));
  }
  return map;
}

/**
 * README 本文から mermaid の flowchart を 1 つ取り出してノードとエッジに分解する。
 * ブロックが無い場合は例外を投げる(黙って空グラフを返すと検査が素通りするため)。
 */
export function parseMermaidGraph(markdown, label) {
  const block = markdown.match(/```mermaid\nflowchart TD\n([\s\S]*?)```/);
  if (!block) {
    throw new Error('mermaid の flowchart ブロックが見つからない: ' + label);
  }
  const body = block[1];
  const nodes = new Set([...body.matchAll(/^\s+([A-Z]+)\[/gm)].map((m) => m[1]));
  const edges = [...body.matchAll(/^\s+([A-Z]+) --> ([A-Z]+)\s*$/gm)].map((m) => [m[1], m[2]]);
  if (nodes.size === 0 || edges.length === 0) {
    throw new Error('ノードまたはエッジを 1 つも抽出できなかった: ' + label);
  }
  return { nodes, edges };
}

const sameSet = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));
const only = (a, b) => [...a].filter((v) => !b.has(v));

/** 検出した乖離をメッセージ配列で返す。空配列なら合格。 */
export function checkReadmeGraph(repoRoot, files = ['README.ja.md', 'README.md']) {
  const errors = [];
  const graphs = files.map((file) => {
    const path = join(repoRoot, file);
    if (!existsSync(path)) throw new Error('README が見つからない: ' + file);
    return { file, ...parseMermaidGraph(readFileSync(path, 'utf8'), file) };
  });

  // 1. 言語間パリティ。基準は先頭のファイル。
  const [base, ...rest] = graphs;
  for (const other of rest) {
    if (!sameSet(base.nodes, other.nodes)) {
      errors.push(
        'ノード集合が ' + base.file + ' と ' + other.file + ' で不一致: ' +
          base.file + ' のみ=[' + only(base.nodes, other.nodes).join(', ') + '] ' +
          other.file + ' のみ=[' + only(other.nodes, base.nodes).join(', ') + ']',
      );
    }
    const baseEdges = new Set(base.edges.map(([f, t]) => EDGE_KEY(f, t)));
    const otherEdges = new Set(other.edges.map(([f, t]) => EDGE_KEY(f, t)));
    if (!sameSet(baseEdges, otherEdges)) {
      errors.push(
        'エッジ集合が ' + base.file + ' と ' + other.file + ' で不一致: ' +
          base.file + ' のみ=[' + only(baseEdges, otherEdges).join(', ') + '] ' +
          other.file + ' のみ=[' + only(otherEdges, baseEdges).join(', ') + ']',
      );
    }
  }

  const deps = collectInternalDeps(repoRoot);
  for (const [from, to] of base.edges) {
    const key = EDGE_KEY(from, to);
    // 2. 未宣言ノードの参照。
    if (!base.nodes.has(from)) errors.push('未宣言ノードを参照: ' + from + ' (' + key + ')');
    if (!base.nodes.has(to)) errors.push('未宣言ノードを参照: ' + to + ' (' + key + ')');
    if (BUNDLER_ONLY.has(key)) continue;

    // 3. 実依存の裏付け。
    const fromPkgs = ID_TO_PKG[from];
    const toPkgs = ID_TO_PKG[to];
    if (!fromPkgs) { errors.push('ID_TO_PKG に未定義のノード: ' + from); continue; }
    if (!toPkgs) { errors.push('ID_TO_PKG に未定義のノード: ' + to); continue; }
    const backed = fromPkgs.some((f) => toPkgs.some((t) => deps.get(f)?.has(t)));
    if (!backed) {
      errors.push(
        '実依存に裏付けなし: ' + key +
          ' (' + fromPkgs.join('|') + ' -> ' + toPkgs.join('|') + ')',
      );
    }
  }

  // ID マップに定義があるのに図へ出していないノードは許容する(図は概観であり網羅ではない)。
  // 逆に図へ出したノードの実在は必須。
  for (const node of base.nodes) {
    const pkgs = ID_TO_PKG[node];
    if (!pkgs) { errors.push('ID_TO_PKG に未定義のノード: ' + node); continue; }
    for (const pkg of pkgs) {
      if (!deps.has(pkg)) errors.push('図のノードが packages 配下に実在しない: ' + node + ' (' + pkg + ')');
    }
    // 4. 孤立ノード。
    if (ORPHAN_OK.has(node)) continue;
    const connected = base.edges.some(([f, t]) => f === node || t === node);
    if (!connected) errors.push('孤立ノード: ' + node);
  }

  return errors;
}

function main() {
  const repoRoot = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..');
  let errors;
  try {
    errors = checkReadmeGraph(repoRoot);
  } catch (error) {
    console.error('README 依存図の検査に失敗: ' + error.message);
    console.error(error.stack);
    process.exit(1);
  }
  if (errors.length > 0) {
    console.error('README の依存図が実態と乖離している (' + errors.length + ' 件)');
    for (const message of errors) console.error('  - ' + message);
    console.error('README.ja.md / README.md の「プロジェクト構成」の図を修正するか、');
    console.error('意図した変更なら scripts/check-readme-package-graph.mjs の ID_TO_PKG /');
    console.error('BUNDLER_ONLY を更新すること。');
    process.exit(1);
  }
  console.log('OK: README の依存図は packages/*/package.json の実依存と整合している');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
