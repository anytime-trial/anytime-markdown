#!/usr/bin/env node
// check-bundled-skills.mjs — 拡張同梱スキル(packages/*/skills/<name>/)と
// canonical(.claude/skills/<name>/)の byte 一致を検証する。
//
// スキルは 2 方向で複製されるため、どちらが git 正本かで検査の意味が変わる:
//
//   (A) canonical 正本: `.claude/skills/<name>/` が git 追跡されているスキル。
//       同梱コピーは手動複製のため、canonical を更新して同梱へ反映し忘れると
//       ユーザーへ古いスキルが配布される。この方向のドリフトを検出する。
//
//   (B) packages 正本: `.claude/skills/<name>/` が .gitignore された生成物のスキル
//       (markdown 拡張が activate 時に packages 側から配置する)。git 正本は
//       packages 側の 1 箇所しかなくドリフトし得ないため検査対象外。
//       生成物はチェックアウト状態に依存する(CI には存在しない)ので、実在で判定すると
//       「ローカルは通るが CI で落ちる」環境依存ゲートになる。git 追跡の有無で判定する。
//
// 対象外:
//   - テンプレート同梱(SKILL.md.template)。配置時にプレースホルダ展開され canonical と
//     一致しないため(例: anytime-note)。
//   - (B) の packages 正本スキル、および canonical が存在しない拡張固有スキル。
//
// 終了コード: (A) のドリフト検出時のみ 1。一致 or 対象なしは 0。

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL_REL = join('.claude', 'skills');
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
export function findBundledSkills(packagesDir) {
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

/** git 追跡されている canonical パス一覧からスキル名の集合を作る(純粋関数)。 */
export function trackedSkillNames(gitLsFilesOutput) {
  const names = new Set();
  for (const line of gitLsFilesOutput.split('\n')) {
    const path = line.trim();
    if (!path) continue;
    // 例: .claude/skills/anytime-trail-review/SKILL.md → anytime-trail-review
    const parts = path.split('/');
    const idx = parts.indexOf('skills');
    const name = idx >= 0 ? parts[idx + 1] : undefined;
    if (name) names.add(name);
  }
  return names;
}

/** canonical 側が git 追跡されているスキル名の集合を返す。 */
export function listTrackedCanonicalSkills(root, runGit = defaultRunGit) {
  return trackedSkillNames(runGit(root));
}

function defaultRunGit(root) {
  return execFileSync('git', ['ls-files', '--', CANONICAL_REL], {
    cwd: root,
    encoding: 'utf-8',
  });
}

/**
 * 同梱ファイルを canonical と突合し、ok / mismatch / missing / skipped に分類する(純粋関数)。
 *
 * canonical 正本でないスキル(packages 正本の生成コピー・拡張固有)は skipped に落とし fail させない。
 */
export function classifyBundledFiles(entries, { canonicalRoot, trackedSkills, exists, read }) {
  const ok = [];
  const mismatches = [];
  const missingCanonical = [];
  const skipped = [];

  for (const entry of entries) {
    if (!trackedSkills.has(entry.skillName)) {
      skipped.push(entry);
      continue;
    }
    const canonical = join(canonicalRoot, entry.skillName, entry.relPath);
    // canonical 正本なのに対応ファイルが無い = 同梱だけに存在する。SKILL.md しか比較して
    // いなかった頃はここが検出されず、同梱スクリプトの追加が canonical に反映されないまま
    // 出荷されていた。
    if (!exists(canonical)) {
      missingCanonical.push({ ...entry, canonical });
      continue;
    }
    if (read(entry.bundled) === read(canonical)) {
      ok.push({ ...entry, canonical });
    } else {
      mismatches.push({ ...entry, canonical });
    }
  }

  return { ok, mismatches, missingCanonical, skipped };
}

function main() {
  const bundled = findBundledSkills(join(repoRoot, 'packages'));
  const trackedSkills = listTrackedCanonicalSkills(repoRoot);
  const { ok, mismatches, missingCanonical, skipped } = classifyBundledFiles(bundled, {
    canonicalRoot: join(repoRoot, CANONICAL_REL),
    trackedSkills,
    exists: existsSync,
    read: (p) => readFileSync(p, 'utf-8'),
  });

  const rel = (p) => p.replace(`${repoRoot}/`, '');
  const countSkills = (list) => new Set(list.map((e) => `${e.pkg}/${e.skillName}`)).size;

  console.log(
    `[check-bundled-skills] canonical 正本の同梱スキル ${countSkills([...ok, ...mismatches, ...missingCanonical])} 件 / ファイル ${ok.length + mismatches.length + missingCanonical.length} 件を検査`,
  );
  console.log(`  一致: ${ok.length} / 不一致: ${mismatches.length} / canonical に無い: ${missingCanonical.length}`);
  if (skipped.length > 0) {
    console.log(
      `  SKIP (packages 正本 / canonical 未追跡): ${countSkills(skipped)} 件 — ${[...new Set(skipped.map((e) => e.skillName))].join(', ')}`,
    );
  }

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
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
