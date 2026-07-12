#!/usr/bin/env node
// check-bundled-skills.mjs — 拡張同梱スキル(packages/*/skills/<name>/SKILL.md)が
// canonical(.claude/skills/<name>/SKILL.md)と byte 一致しているか検証する。
//
// 同梱コピーは手動複製のため canonical 更新時に追随漏れするとユーザーへ古いスキルが
// 配布される。CI/ローカルでこのドリフトを検出する。
//
// 対象外:
//   - テンプレート同梱(SKILL.md.template)。配置時にプレースホルダ展開され canonical と
//     一致しないため(例: anytime-note)。
//   - canonical が存在しない同梱(拡張固有スキル)。WARN として一覧表示し fail はしない。
//
// 終了コード: ドリフト検出時のみ 1。一致 or 対象なしは 0。

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(repoRoot, 'packages');
const canonicalRoot = join(repoRoot, '.claude', 'skills');
const BUNDLED_FILE = 'SKILL.md';

/** スキル dir 配下の全ファイルを再帰列挙する（skill dir からの相対パス）。 */
function walkFiles(dir, prefix = '') {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...walkFiles(join(dir, entry.name), rel));
    } else if (entry.isFile()) {
      results.push(rel);
    }
  }
  return results;
}

/**
 * packages 配下の各拡張の skills/<name>/ 配下の全ファイルを列挙する。
 *
 * SKILL.md だけでなく同梱スクリプト(.cjs)・データ(.json)・references/ も比較する。
 * SKILL.md しか見ていなかった頃は、スクリプトだけ canonical とずれてもゲートを通過し、
 * 古いスクリプトがユーザーへ配布されていた。
 */
function findBundledSkills() {
  const results = [];
  if (!existsSync(packagesDir)) return results;
  for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const skillsDir = join(packagesDir, pkg.name, 'skills');
    if (!existsSync(skillsDir)) continue;
    for (const skill of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!skill.isDirectory()) continue;
      const skillDir = join(skillsDir, skill.name);
      // SKILL.md を持つ同梱のみ対象。SKILL.md.template だけの同梱(anytime-note)は
      // 配置時にプレースホルダ展開され canonical と一致しないため対象外。
      if (!existsSync(join(skillDir, BUNDLED_FILE))) continue;

      for (const rel of walkFiles(skillDir)) {
        results.push({
          pkg: pkg.name,
          skillName: skill.name,
          relPath: rel,
          bundled: join(skillDir, rel),
        });
      }
    }
  }
  return results.sort((a, b) => a.bundled.localeCompare(b.bundled));
}

const bundled = findBundledSkills();
const mismatches = [];
const missingCanonical = [];
let okCount = 0;

for (const entry of bundled) {
  const canonical = join(canonicalRoot, entry.skillName, entry.relPath);
  if (!existsSync(canonical)) {
    missingCanonical.push(entry);
    continue;
  }
  const bundledContent = readFileSync(entry.bundled, 'utf-8');
  const canonicalContent = readFileSync(canonical, 'utf-8');
  if (bundledContent === canonicalContent) {
    okCount++;
  } else {
    mismatches.push({ ...entry, canonical });
  }
}

const rel = (p) => p.replace(`${repoRoot}/`, '');
const skillCount = new Set(bundled.map((b) => `${b.pkg}/${b.skillName}`)).size;

console.log(`[check-bundled-skills] 同梱スキル ${skillCount} 件 / ファイル ${bundled.length} 件を検査`);
console.log(`  一致: ${okCount} / 不一致: ${mismatches.length} / canonical 無し: ${missingCanonical.length}`);

// canonical 側に対応ファイルが無い = 同梱だけに存在する。SKILL.md しか比較していなかった
// 頃はここが検出されず、同梱スクリプトの追加が canonical に反映されないまま出荷されていた。
for (const m of missingCanonical) {
  console.error(`  ✗ canonical に無い: ${rel(m.bundled)}`);
}

if (mismatches.length > 0) {
  console.error('\n[check-bundled-skills] 同梱コピーが canonical とドリフトしています:');
  for (const m of mismatches) {
    console.error(`  ✗ ${rel(m.bundled)}`);
    console.error(`      != ${rel(m.canonical)}`);
  }
  console.error('\n  canonical を同梱先へ再コピーしてください:');
  for (const m of mismatches) {
    console.error(`    cp ${rel(m.canonical)} ${rel(m.bundled)}`);
  }
}

if (mismatches.length > 0 || missingCanonical.length > 0) {
  process.exit(1);
}

console.log('[check-bundled-skills] OK: 全同梱スキルが canonical と一致');
