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

/** packages 配下の各拡張の skills/<name>/SKILL.md を列挙する。 */
function findBundledSkills() {
  const results = [];
  if (!existsSync(packagesDir)) return results;
  for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const skillsDir = join(packagesDir, pkg.name, 'skills');
    if (!existsSync(skillsDir)) continue;
    for (const skill of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!skill.isDirectory()) continue;
      const bundled = join(skillsDir, skill.name, BUNDLED_FILE);
      // SKILL.md 完全一致のみ。SKILL.md.template 等のテンプレートは対象外。
      if (existsSync(bundled)) {
        results.push({ pkg: pkg.name, skillName: skill.name, bundled });
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
  const canonical = join(canonicalRoot, entry.skillName, BUNDLED_FILE);
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

console.log(`[check-bundled-skills] 同梱スキル ${bundled.length} 件を検査`);
console.log(`  一致: ${okCount} / 不一致: ${mismatches.length} / canonical 無し(対象外): ${missingCanonical.length}`);

for (const m of missingCanonical) {
  console.log(`  - SKIP (canonical 無し): ${m.pkg}/skills/${m.skillName}`);
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
  process.exit(1);
}

console.log('[check-bundled-skills] OK: 全同梱スキルが canonical と一致');
