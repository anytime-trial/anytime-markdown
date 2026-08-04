#!/usr/bin/env node
/**
 * SonarQube の coverage をローカルの lcov から推定する。
 *
 * SonarCloud は最後にリリースした master しか解析しないため、develop 上での
 * カバレッジ改善は次のリリースまでダッシュボードへ反映されない。本スクリプトは
 * sonar-project.properties の sources / exclusions / lcov.reportPaths を実際に
 * 読み、Sonar と同じスコープで overall coverage を集計することで、リリースを
 * 待たずに 80% ゲートの通過見込みを実測する。
 *
 * Sonar の overall coverage:
 *   (covered_lines + covered_conditions) / (lines_to_cover + conditions_to_cover)
 * lcov では LH+BRH / LF+BRF に対応する。
 *
 * 前提: 各パッケージの jest が collectCoverageFrom で全ソースを対象にしていること。
 * テストから一度も import されないファイルは lcov に出ないが Sonar は 0% で計上
 * するため、collectCoverageFrom が無いと本スクリプトは実態より高く出る。
 *
 * 使い方:
 *   node scripts/sonar-coverage-estimate.mjs            # サマリのみ
 *   node scripts/sonar-coverage-estimate.mjs --by-package
 *   node scripts/sonar-coverage-estimate.mjs --worst 40 # 未カバーの多いファイル
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROPS = resolve(ROOT, 'sonar-project.properties');

/** sonar-project.properties を読む（行末 `\` の継続行を連結する）。 */
function readProperties(path) {
  const raw = readFileSync(path, 'utf8');
  const joined = raw.replace(/\\\r?\n\s*/g, '');
  /** @type {Record<string, string>} */
  const props = {};
  for (const line of joined.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    props[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return props;
}

const listOf = (props, key) =>
  (props[key] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Sonar の ant 風 glob を正規表現へ変換する。
 * `**` は任意階層、`*` は区切り以外の任意文字、`?` は 1 文字。
 */
function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` は 0 階層にもマッチさせる（Sonar と同じ挙動）。
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

/**
 * lcov.info を { [絶対パス]: {lf, lh, brf, brh} } へ畳み込む。
 *
 * `SF:` はパッケージルート相対（jest をパッケージ内で起動した場合）と
 * リポジトリルート相対（`--rootDir` 指定でリポジトリルートから起動した場合）の
 * どちらにもなる。存在する方を採用しないと、片方が丸ごとスコープ外へ落ちて
 * 「パッケージが 1 つ消えた」ことに気づけない。
 */
function parseLcov(path, baseDir) {
  /** @type {Map<string, {lf:number, lh:number, brf:number, brh:number}>} */
  const files = new Map();
  let current = null;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      const sf = line.slice(3).trim();
      const fromPkg = resolve(baseDir, sf);
      const file = existsSync(fromPkg) ? fromPkg : resolve(ROOT, sf);
      current = files.get(file) ?? { lf: 0, lh: 0, brf: 0, brh: 0 };
      files.set(file, current);
    } else if (current) {
      if (line.startsWith('LF:')) current.lf += Number(line.slice(3));
      else if (line.startsWith('LH:')) current.lh += Number(line.slice(3));
      else if (line.startsWith('BRF:')) current.brf += Number(line.slice(4));
      else if (line.startsWith('BRH:')) current.brh += Number(line.slice(4));
      else if (line === 'end_of_record') current = null;
    }
  }
  return files;
}

function main() {
  const args = process.argv.slice(2);
  const byPackage = args.includes('--by-package');
  const worstIdx = args.indexOf('--worst');
  const worstN = worstIdx === -1 ? 0 : Number(args[worstIdx + 1] ?? 30);

  const props = readProperties(PROPS);
  const sources = listOf(props, 'sonar.sources').map((s) => resolve(ROOT, s));
  const exclusions = listOf(props, 'sonar.exclusions').map(globToRegExp);
  const coverageExclusions = listOf(props, 'sonar.coverage.exclusions').map(globToRegExp);
  const reportPaths = listOf(props, 'sonar.javascript.lcov.reportPaths');

  const missingReports = [];
  /** @type {Map<string, {lf:number, lh:number, brf:number, brh:number}>} */
  const merged = new Map();
  for (const rel of reportPaths) {
    const abs = resolve(ROOT, rel);
    if (!existsSync(abs)) {
      missingReports.push(rel);
      continue;
    }
    // lcov の SF: はパッケージルート相対で出力される。
    const pkgRoot = resolve(abs, '../..');
    for (const [file, m] of parseLcov(abs, pkgRoot)) {
      const prev = merged.get(file);
      if (!prev) merged.set(file, { ...m });
      else {
        prev.lf = Math.max(prev.lf, m.lf);
        prev.lh = Math.max(prev.lh, m.lh);
        prev.brf = Math.max(prev.brf, m.brf);
        prev.brh = Math.max(prev.brh, m.brh);
      }
    }
  }

  const inSources = (file) => sources.some((s) => file === s || file.startsWith(`${s}/`));
  const isExcluded = (relPath) =>
    exclusions.some((re) => re.test(relPath)) || coverageExclusions.some((re) => re.test(relPath));
  const isTest = (relPath) => /(^|\/)__tests__\//.test(relPath) || /\.test\.[cm]?[jt]sx?$/.test(relPath);

  let lf = 0, lh = 0, brf = 0, brh = 0;
  /** @type {Map<string, {lf:number, lh:number, brf:number, brh:number, files:number}>} */
  const perPackage = new Map();
  /** @type {Array<{relPath:string, uncovered:number, total:number}>} */
  const rows = [];

  for (const [file, m] of merged) {
    if (!inSources(file)) continue;
    const relPath = relative(ROOT, file);
    if (isExcluded(relPath) || isTest(relPath)) continue;
    lf += m.lf; lh += m.lh; brf += m.brf; brh += m.brh;
    const pkg = relPath.split('/')[1] ?? relPath;
    const agg = perPackage.get(pkg) ?? { lf: 0, lh: 0, brf: 0, brh: 0, files: 0 };
    agg.lf += m.lf; agg.lh += m.lh; agg.brf += m.brf; agg.brh += m.brh; agg.files += 1;
    perPackage.set(pkg, agg);
    rows.push({ relPath, uncovered: m.lf - m.lh + (m.brf - m.brh), total: m.lf + m.brf });
  }

  const total = lf + brf;
  const covered = lh + brh;
  const pct = total === 0 ? 0 : (100 * covered) / total;
  const needFor80 = Math.max(0, Math.ceil(0.8 * total) - covered);

  if (missingReports.length > 0) {
    console.log(`未生成の lcov (${missingReports.length}):`);
    for (const r of missingReports) console.log(`  - ${r}`);
    console.log('');
  }

  if (byPackage) {
    const list = [...perPackage.entries()]
      .map(([pkg, a]) => ({ pkg, ...a, pct: (100 * (a.lh + a.brh)) / (a.lf + a.brf || 1), unc: a.lf - a.lh + (a.brf - a.brh) }))
      .sort((x, y) => y.unc - x.unc);
    console.log('未カバー   合計   カバー率  ファイル  パッケージ');
    for (const r of list) {
      console.log(`${String(r.unc).padStart(8)} ${String(r.lf + r.brf).padStart(6)} ${r.pct.toFixed(1).padStart(8)}% ${String(r.files).padStart(9)}  ${r.pkg}`);
    }
    console.log('');
  }

  if (worstN > 0) {
    rows.sort((x, y) => y.uncovered - x.uncovered);
    console.log(`未カバーの多いファイル (上位 ${worstN}):`);
    for (const r of rows.slice(0, worstN)) {
      const p = r.total === 0 ? 0 : (100 * (r.total - r.uncovered)) / r.total;
      console.log(`${String(r.uncovered).padStart(6)} /${String(r.total).padStart(6)} ${p.toFixed(1).padStart(6)}%  ${r.relPath}`);
    }
    console.log('');
  }

  console.log(`対象ファイル : ${rows.length}`);
  console.log(`行           : ${lh}/${lf} (${lf ? ((100 * lh) / lf).toFixed(1) : '0.0'}%)`);
  console.log(`分岐         : ${brh}/${brf} (${brf ? ((100 * brh) / brf).toFixed(1) : '0.0'}%)`);
  console.log(`overall      : ${covered}/${total} (${pct.toFixed(2)}%)`);
  console.log(`80% まで     : ${needFor80 > 0 ? `+${needFor80} 要素` : '達成済み'}`);
}

main();
