#!/usr/bin/env node
// check-skill-manifest-bump.mjs — 同梱スキルの内容を変えたのに manifest 版数を上げていない変更をブロックする。
//
// 拡張は `skills/manifest.json` の版数が配置済み版数を上回るときだけ、配布済みコピーを上書きする
// (packages/vscode-common/src/skill-installer/installSkills.ts の版数ゲート)。版数を据え置いたまま
// SKILL.md を変えると、その変更はユーザーのワークスペースへ二度と届かない(恒久 stale)。
// 実際に anytime-cross-review が旧 references パスを指したまま出荷され、参照切れを起こした。
//
// 使い方: node scripts/check-skill-manifest-bump.mjs [baseRef]
//   baseRef 省略時は origin/master。base が解決できない環境(shallow clone 等)では検証をスキップする
//   (検証不能であってバンプ漏れではない)。終了コード: バンプ漏れ検出時のみ 1。

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BASE = 'origin/master';
const MANIFEST = 'manifest.json';

/**
 * 変更ファイル一覧から「内容が変わった同梱スキル」を拡張ごとに集める(純粋関数)。
 *
 * manifest.json 自体の変更はスキルの内容変更に数えない(版数だけ上げるのは正当)。
 */
export function collectChangedSkills(changedPaths) {
  /** @type {Map<string, Set<string>>} pkg -> skill names */
  const byPackage = new Map();
  for (const path of changedPaths) {
    const m = /^packages\/([^/]+)\/skills\/([^/]+)\/(.+)$/.exec(path.trim());
    if (!m) continue;
    const [, pkg, skill] = m;
    if (!byPackage.has(pkg)) byPackage.set(pkg, new Set());
    byPackage.get(pkg).add(skill);
  }
  return byPackage;
}

/**
 * 版数が上がっていないスキルを列挙する(純粋関数)。manifest に載っていないスキルも違反として返す。
 *
 * `skillExists(pkg, skill)` は HEAD の作業ツリーにそのスキル dir が在るかを返す。改名・削除された
 * スキルは旧 dir の全ファイルが削除差分として `changedByPackage` に載るが、消えたスキルに manifest
 * 登録を求めるのは誤り(登録すべきは新名だけ)なので対象外にする。
 */
export function findMissingBumps(changedByPackage, manifests, skillExists = () => true) {
  const violations = [];
  for (const [pkg, skills] of changedByPackage) {
    const manifest = manifests.get(pkg);
    // manifest を持たない拡張(版数ゲート未導入)は対象外。導入済みの拡張だけを守る。
    if (!manifest) continue;
    for (const skill of [...skills].sort()) {
      // 削除・改名で HEAD に存在しないスキルは検査対象外。
      if (!skillExists(pkg, skill)) continue;
      const base = manifest.base[skill];
      const head = manifest.head[skill];
      if (head === undefined) {
        violations.push({ pkg, skill, reason: 'manifest に登録されていない', base, head });
        continue;
      }
      if (base !== undefined && head <= base) {
        violations.push({ pkg, skill, reason: '版数が上がっていない', base, head });
      }
    }
  }
  return violations;
}

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8' });
}

/** base ref が解決できるか。shallow clone や base 未 fetch の環境では false。 */
function canResolve(ref) {
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function readManifestAt(ref, pkg) {
  const rel = `packages/${pkg}/skills/${MANIFEST}`;
  if (ref === null) {
    const abs = join(repoRoot, rel);
    if (!existsSync(abs)) return null;
    return JSON.parse(readFileSync(abs, 'utf-8'));
  }
  try {
    return JSON.parse(git(['show', `${ref}:${rel}`]));
  } catch {
    // base 時点で manifest が無い = 版数ゲート導入コミット。全スキルが新規登録なので違反にしない。
    return {};
  }
}

function main() {
  const base = process.argv[2] ?? DEFAULT_BASE;
  if (!canResolve(base)) {
    console.log(`[check-skill-manifest-bump] base ref を解決できないためスキップ: ${base}`);
    return;
  }

  const changed = git(['diff', '--name-only', `${base}...HEAD`]).split('\n').filter(Boolean);
  const changedByPackage = collectChangedSkills(changed);
  if (changedByPackage.size === 0) {
    console.log('[check-skill-manifest-bump] 同梱スキルの変更なし');
    return;
  }

  const manifests = new Map();
  for (const pkg of changedByPackage.keys()) {
    const head = readManifestAt(null, pkg);
    if (head === null) continue; // manifest 未導入の拡張
    manifests.set(pkg, { base: readManifestAt(base, pkg) ?? {}, head });
  }

  const skillExists = (pkg, skill) => existsSync(join(repoRoot, 'packages', pkg, 'skills', skill));
  const violations = findMissingBumps(changedByPackage, manifests, skillExists);
  const checked = [...changedByPackage].map(([pkg, s]) => `${pkg}(${s.size})`).join(', ');
  console.log(`[check-skill-manifest-bump] base=${base} / 変更のあった同梱スキル: ${checked}`);

  if (violations.length === 0) {
    console.log('[check-skill-manifest-bump] OK: 変更されたスキルはすべて manifest 版数が上がっています');
    return;
  }

  console.error('\n[check-skill-manifest-bump] manifest の版数バンプが漏れています:');
  for (const v of violations) {
    console.error(
      `  ✗ ${v.pkg}/skills/${v.skill} — ${v.reason} (base=${v.base ?? '-'} head=${v.head ?? '-'})`,
    );
  }
  console.error(
    '\n  版数を上げないと、配布済みコピーが preserve され変更がユーザーへ届きません。',
  );
  for (const v of violations) {
    console.error(`    packages/${v.pkg}/skills/${MANIFEST} の "${v.skill}" を +1 する`);
  }
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
