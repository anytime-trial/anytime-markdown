import fs from 'node:fs';
import path from 'node:path';

import { classifyLayer } from '@anytime-markdown/code-analysis-core/architecture';
import type {
  ArchitectureLayer,
  FileMarker,
  ModuleManifest,
} from '@anytime-markdown/code-analysis-core/architecture';

/**
 * ModuleLayerResolver — 純不純の境界。
 *
 * code-analysis-core の純粋関数 `classifyLayer` を、trail-server のモノレポ FS 上で
 * パッケージ単位に適用する。FS 走査（package.json 読込＋マーカー検出）は本モジュールの責務で、
 * 分類ロジック自体は core に委譲する（[[arch-layer-detection-code-analysis-core]]）。
 */

/** 解析中の best-effort な失敗（malformed package.json 等）を通知するための最小ロガー。 */
export interface ModuleLayerLogger {
  warn(message: string): void;
}

/** package.json の解析に使う最小形。 */
interface PackageJsonShape {
  readonly name?: string;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly engines?: Record<string, string>;
}

const CONFIG_MARKERS: ReadonlyArray<{ readonly base: string; readonly marker: FileMarker }> = [
  { base: 'next', marker: 'next.config' },
  { base: 'vite', marker: 'vite.config' },
  { base: 'astro', marker: 'astro.config' },
];
const CONFIG_EXTS: readonly string[] = ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'];

/** マーカー走査で降りないディレクトリ（GraphDetector のデフォルト除外に倣う）。 */
const MARKER_WALK_EXCLUDE: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  '.next',
  'out',
  'build',
  '.git',
  'coverage',
  '.vscode-test',
]);

/** TS Compiler API の runtime 利用シグナル（`from 'typescript'` / `require('typescript')`）。 */
const TS_COMPILER_IMPORT = /(?:from|require\()\s*['"]typescript['"]/;

/** ts-compiler-import grep のファイル読み込み上限（best-effort・病的コスト防止）。 */
const MAX_TS_FILES_SCANNED = 600;

/**
 * `packages/<pkg>/package.json` ＋ FS マーカーから ModuleManifest を構築する。
 * package.json が無い／壊れている場合はパッケージ名のみの manifest に degrade する
 * （命名規則ベースの分類は引き続き機能する）。
 */
export function buildManifest(
  repoRoot: string,
  pkg: string,
  logger?: ModuleLayerLogger,
): ModuleManifest {
  const pkgDir = path.join(repoRoot, 'packages', pkg);
  const pkgJson = readPackageJson(pkgDir, pkg, logger);
  const markers = detectMarkers(pkgDir);
  return {
    name: pkgJson?.name ?? pkg,
    dependencies: pkgJson?.dependencies,
    devDependencies: pkgJson?.devDependencies,
    peerDependencies: pkgJson?.peerDependencies,
    engines: pkgJson?.engines,
    markers,
  };
}

/**
 * 与えられたパッケージ集合の層をパッケージ単位で一度ずつ解決し、`pkg -> layer` の Map を返す。
 * 同名パッケージは重複排除され 1 回だけ分類される。
 */
export function resolveLayers(
  repoRoot: string,
  packages: Iterable<string>,
  logger?: ModuleLayerLogger,
): Map<string, ArchitectureLayer> {
  const result = new Map<string, ArchitectureLayer>();
  for (const pkg of new Set(packages)) {
    try {
      const manifest = buildManifest(repoRoot, pkg, logger);
      result.set(pkg, classifyLayer(manifest).layer);
    } catch (err) {
      const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      logger?.warn(`[moduleLayer] failed to classify package '${pkg}' under ${repoRoot}: ${message}`);
    }
  }
  return result;
}

function readPackageJson(
  pkgDir: string,
  pkg: string,
  logger?: ModuleLayerLogger,
): PackageJsonShape | null {
  const file = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as PackageJsonShape;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger?.warn(`[moduleLayer] malformed package.json for '${pkg}' at ${file}: ${message}`);
    return null;
  }
}

function detectMarkers(pkgDir: string): FileMarker[] {
  const markers: FileMarker[] = [];
  for (const { base, marker } of CONFIG_MARKERS) {
    if (CONFIG_EXTS.some((ext) => fs.existsSync(path.join(pkgDir, `${base}.config.${ext}`)))) {
      markers.push(marker);
    }
  }
  if (hasSqlFile(pkgDir)) markers.push('sqlite-schema');
  if (srcImportsTypescript(path.join(pkgDir, 'src'))) markers.push('ts-compiler-import');
  return markers;
}

function hasSqlFile(pkgDir: string): boolean {
  const budget = { n: MAX_TS_FILES_SCANNED };
  return walkUntil(pkgDir, (full) => full.endsWith('.sql'), budget);
}

function srcImportsTypescript(srcDir: string): boolean {
  const budget = { n: MAX_TS_FILES_SCANNED };
  return walkUntil(
    srcDir,
    (full) => {
      if (!/\.(?:tsx?|mts|cts)$/.test(full)) return false;
      return TS_COMPILER_IMPORT.test(fs.readFileSync(full, 'utf8'));
    },
    budget,
  );
}

/**
 * `root` 配下を深さ優先で走査し、いずれかのファイルで `visit` が true を返したら即 true を返す。
 * `budget.n` 個のファイルを訪問した時点で打ち切る（best-effort・病的コスト防止）。
 */
function walkUntil(
  root: string,
  visit: (fullPath: string) => boolean,
  budget: { n: number },
): boolean {
  if (!fs.existsSync(root)) return false;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (budget.n <= 0) return false;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (MARKER_WALK_EXCLUDE.has(entry.name)) continue;
      if (walkUntil(full, visit, budget)) return true;
    } else if (entry.isFile()) {
      budget.n--;
      if (visit(full)) return true;
    }
  }
  return false;
}
