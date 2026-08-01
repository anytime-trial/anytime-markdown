#!/usr/bin/env node
// export-viewer-dist.mjs — viewer 配布バンドルの受け渡しパッケージング。
// 対象パッケージをビルドし、dist の .js を出力先へコピーして、由来（コミット SHA・
// dirty・sha256・サイズ）を記録した manifest.json を併置する。dist は gitignore のため
// 「渡した版がどのコミット由来か」が消えやすく、それを manifest で機械的に残すのが目的。
//
// 使い方: node scripts/export-viewer-dist.mjs --out <dir> [--package <name>]
//   --package 省略時は cooccurrence-viewer。対象は package.json に build スクリプトを持ち
//   dist/*.js を出すパッケージ（cooccurrence-viewer / markdown-viewer / mindmap-viewer 等）。
//   出力: <out>/<name>/ に dist の .js と manifest.json。
// 終了コード: 引数不正・対象不正・ビルド失敗・dist が空のとき 1。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = 'usage: node scripts/export-viewer-dist.mjs --out <dir> [--package <name>]';

/** 引数を解釈する（純粋関数）。不正時は usage を含む Error を投げる。 */
export function parseArgs(argv) {
  let outDir;
  let packageName = 'cooccurrence-viewer';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      outDir = argv[i + 1];
      if (!outDir) throw new Error(`--out requires a directory. ${USAGE}`);
      i += 1;
    } else if (arg === '--package') {
      packageName = argv[i + 1];
      if (!packageName) throw new Error(`--package requires a name. ${USAGE}`);
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}. ${USAGE}`);
    }
  }
  if (!outDir) throw new Error(`--out is required. ${USAGE}`);
  // packages/ 直下の名前だけを受け付け、パス区切りで外へ出る解決を防ぐ。
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(packageName)) {
    throw new Error(`invalid package name: ${packageName}. ${USAGE}`);
  }
  return { outDir, packageName };
}

/** dist 直下から配布対象（.js のみ）を名前順で選ぶ（純粋関数）。 */
export function selectDistFiles(names) {
  return names.filter((name) => name.endsWith('.js')).sort();
}

/** 受け渡しの由来と検証情報を持つ manifest を組み立てる（純粋関数）。 */
export function buildManifest({ packageName, version, commit, dirty, generatedAt, files }) {
  return {
    package: packageName,
    version,
    commit,
    // dirty=true は未コミット差分を含むワークツリーから作った配布物であることを示す。
    // 再現できない版を「コミット由来」の顔で渡さないための印。
    dirty,
    generatedAt,
    files,
  };
}

function git(args) {
  // --no-optional-locks: status が index.lock を奪って並行セッションを妨げないようにする。
  return execFileSync('git', ['--no-optional-locks', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
}

function main() {
  const { outDir, packageName } = parseArgs(process.argv.slice(2));
  const pkgDir = join(repoRoot, 'packages', packageName);
  const pkgJsonPath = join(pkgDir, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    throw new Error(`packages/${packageName} not found (${pkgJsonPath})`);
  }
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  if (!pkgJson.scripts?.build) {
    throw new Error(`packages/${packageName} has no build script; nothing to export`);
  }

  console.log(`[export-viewer-dist] building ${pkgJson.name} ...`);
  execFileSync('npm', ['run', 'build', '-w', pkgJson.name], { cwd: repoRoot, stdio: 'inherit' });

  const distDir = join(pkgDir, 'dist');
  const files = selectDistFiles(existsSync(distDir) ? readdirSync(distDir) : []);
  if (files.length === 0) {
    throw new Error(`build succeeded but ${distDir} has no .js output`);
  }

  const destDir = join(outDir, packageName);
  mkdirSync(destDir, { recursive: true });
  const fileEntries = files.map((name) => {
    const content = readFileSync(join(distDir, name));
    copyFileSync(join(distDir, name), join(destDir, name));
    return {
      name,
      bytes: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
    };
  });

  const manifest = buildManifest({
    packageName,
    version: pkgJson.version,
    commit: git(['rev-parse', 'HEAD']),
    // バンドルは workspace 依存（graph-core 等）のソースを内包するため、対象パッケージ
    // 単体で判定すると依存側だけが dirty のとき「clean な commit 由来」と偽ってしまう。
    // 依存グラフからの導出は申告揺れ（dependencies/devDependencies の不一致例あり）で
    // 信頼できないため、バンドル入力の全域である packages/ で判定する（過剰側に倒す）。
    dirty: git(['status', '--porcelain', '--', 'packages/']).length > 0,
    generatedAt: new Date().toISOString(),
    files: fileEntries,
  });
  writeFileSync(join(destDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`[export-viewer-dist] exported to ${destDir}`);
  for (const entry of fileEntries) {
    console.log(`[export-viewer-dist]   ${entry.name} (${(entry.bytes / 1024).toFixed(0)} KB)`);
  }
  console.log(`[export-viewer-dist] commit ${manifest.commit}${manifest.dirty ? ' (dirty)' : ''}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`[export-viewer-dist] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
