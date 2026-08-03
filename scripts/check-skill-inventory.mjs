#!/usr/bin/env node
// check-skill-inventory.mjs — スキル一覧ドキュメントの掲載漏れ・過剰掲載 lint。
//
// <docsRoot>/spec/90.skill/skill-inventory.ja.md のセクション 1（拡張同梱スキル）と
// セクション 3（拡張同梱なしスキル）に載っているスキル名を、実体から導出した集合と
// 双方向に突合する。実体の導出は次の 2 経路:
//   同梱     = packages/*/skills/<name>/ の実ディレクトリ
//   同梱なし = git 追跡された .claude/skills/<name>/ のうち同梱でないもの
//
// check-bundled-skills.mjs が同梱コピーの byte 一致を、check-skill-refs.mjs が本文の
// 参照実在性を守るのに対し、本ゲートは「一覧に載っているか」を守る。スキルを新設しても
// 一覧へ足し忘れると誰も気づかず、実際に `anytime-coding-conventions`（2026-08-02 新設）が
// 2026-08-03 の全件突合まで未掲載のまま残った。リネームだけでなく新設でも漏れる。
//
// 使い方: node scripts/check-skill-inventory.mjs [--json] [inventoryPath]
// 終了コード: 掲載漏れ・過剰掲載・件数表記の不一致を検出したときのみ 1。
//
// 検査しないもの（意図的な範囲外）:
//   - §1.1 配置方式の拡張別内訳（表記ゆれに弱く、集合差分で実質カバーされる）
//   - 各行の用途・トリガ列の内容（機械判定できない）

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// ドキュメント正本の置き場。リポジトリ外のため CI ランナーには存在しない。
// 不在時は検証不能であって掲載漏れではないため、warn を残して成功終了する（fail-open）。
// 補助機構の fail-open はスコープを限定する: 開くのは「doc が読めないケース」だけで、
// doc が読めたのに集合が食い違うケースは必ず fail-closed で落とす。
export const DOCS_ROOT = '/Shared/anytime-markdown-docs';
export const INVENTORY_REL = 'spec/90.skill/skill-inventory.ja.md';

const SECTION_BOUNDS = {
  bundled: { start: '## 1. 拡張同梱スキル', end: '### 1.1' },
  projectOnly: { start: '## 3. 拡張同梱なしスキル', end: '## 4. 制約' },
};

/**
 * 表の行頭 `| \`name\` |` からスキル名を抜く（純粋関数）。
 *
 * 見出しが変わって切り出しに失敗した場合は空集合になるため、呼び出し側で空を異常として扱う。
 */
export function parseSkillNames(markdown, { start, end }) {
  const afterStart = markdown.split(start);
  if (afterStart.length < 2) return { names: new Set(), found: false };
  const segment = afterStart[1].split(end)[0];
  const names = new Set();
  for (const line of segment.split('\n')) {
    const m = /^\|\s*`([^`]+)`\s*\|/.exec(line);
    if (m) names.add(m[1]);
  }
  return { names, found: true };
}

// packages 配下の各パッケージの skills/<name>/ を走査し、同梱スキル名 → パッケージ名の対応を作る。
// （JSDoc ブロックにしない: `packages/*/skills` の `*/` がコメントを閉じてしまう）
export function collectBundledSkills(root, fs = { readdir: readdirSync, isDir: (p) => statSync(p).isDirectory(), exists: existsSync }) {
  const packagesDir = join(root, 'packages');
  if (!fs.exists(packagesDir)) return new Map();
  const bundled = new Map();
  for (const pkg of fs.readdir(packagesDir)) {
    const skillsDir = join(packagesDir, pkg, 'skills');
    if (!fs.exists(skillsDir) || !fs.isDir(skillsDir)) continue;
    for (const entry of fs.readdir(skillsDir)) {
      const dir = join(skillsDir, entry);
      if (fs.isDir(dir)) bundled.set(entry, pkg);
    }
  }
  return bundled;
}

/** `git ls-files .claude/skills/` の出力からスキル名を抽出する（純粋関数）。 */
export function trackedSkillNames(gitOutput) {
  const names = new Set();
  for (const line of gitOutput.split('\n')) {
    const parts = line.trim().split('/');
    if (parts.length >= 3 && parts[0] === '.claude' && parts[1] === 'skills') names.add(parts[2]);
  }
  return names;
}

/** doc 側と実体側の双方向差分（純粋関数）。片方向だけだと過剰掲載を見逃す。 */
export function diffSets(docNames, actualNames) {
  return {
    missingInDoc: [...actualNames].filter((n) => !docNames.has(n)).sort(),
    missingInReality: [...docNames].filter((n) => !actualNames.has(n)).sort(),
  };
}

/** 件数表記の検査（純粋関数）。表の行数と本文の数字がずれるのが典型的な陳腐化。 */
export function checkCountPhrases(markdown, { total, bundled, projectOnly }) {
  // 総数は frontmatter の excerpt と本文の 2 か所にあり、片方だけ直すと食い違う。両方を見る。
  const expected = [
    `保持する ${total} 本`,
    `本プロジェクトは ${total} 本`,
    `うち ${bundled} 本`,
    `残る ${projectOnly} 本`,
    `## 1. 拡張同梱スキル（${bundled} 本）`,
    `## 3. 拡張同梱なしスキル（${projectOnly} 本）`,
  ];
  return expected.filter((phrase) => !markdown.includes(phrase));
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const explicitPath = args.find((a) => !a.startsWith('--'));
  const inventoryPath = explicitPath ?? join(DOCS_ROOT, INVENTORY_REL);

  if (!existsSync(inventoryPath)) {
    console.warn(
      `[check-skill-inventory] ${inventoryPath} が見つかりません。検証不能のためスキップします（掲載漏れの有無は未判定）`,
    );
    return 0;
  }

  const markdown = readFileSync(inventoryPath, 'utf8');
  const bundledMap = collectBundledSkills(repoRoot);
  const gitOutput = execFileSync('git', ['-C', repoRoot, 'ls-files', '.claude/skills/'], {
    encoding: 'utf8',
  });
  const tracked = trackedSkillNames(gitOutput);
  const actualBundled = new Set(bundledMap.keys());
  const actualProjectOnly = new Set([...tracked].filter((n) => !actualBundled.has(n)));

  const problems = [];
  const sections = {};
  for (const [key, bounds] of Object.entries(SECTION_BOUNDS)) {
    const { names, found } = parseSkillNames(markdown, bounds);
    if (!found || names.size === 0) {
      // 見出しが変わると静かに空集合になり、差分ゼロ＝正常に見えてしまう。異常として落とす。
      problems.push({
        kind: 'section-unparsable',
        section: key,
        detail: `見出し "${bounds.start}" 〜 "${bounds.end}" からスキル行を抽出できません`,
      });
    }
    sections[key] = names;
  }

  if (problems.length === 0) {
    const pairs = [
      ['bundled', sections.bundled, actualBundled],
      ['projectOnly', sections.projectOnly, actualProjectOnly],
    ];
    for (const [section, docNames, actualNames] of pairs) {
      const { missingInDoc, missingInReality } = diffSets(docNames, actualNames);
      for (const name of missingInDoc) {
        problems.push({ kind: 'missing-in-doc', section, name });
      }
      for (const name of missingInReality) {
        problems.push({ kind: 'missing-in-reality', section, name });
      }
    }
    for (const phrase of checkCountPhrases(markdown, {
      total: actualBundled.size + actualProjectOnly.size,
      bundled: actualBundled.size,
      projectOnly: actualProjectOnly.size,
    })) {
      problems.push({ kind: 'count-mismatch', detail: phrase });
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ inventoryPath, problems }, null, 2));
    return problems.length > 0 ? 1 : 0;
  }

  console.log(
    `[check-skill-inventory] 同梱 ${actualBundled.size} 件 / 拡張同梱なし ${actualProjectOnly.size} 件を ${INVENTORY_REL} と突合`,
  );
  if (problems.length === 0) {
    console.log('[check-skill-inventory] OK: 掲載漏れ・過剰掲載なし');
    return 0;
  }
  for (const p of problems) {
    if (p.kind === 'missing-in-doc') {
      console.error(`  掲載漏れ [${p.section}] ${p.name} — 実体はあるが一覧に載っていません`);
    } else if (p.kind === 'missing-in-reality') {
      console.error(`  過剰掲載 [${p.section}] ${p.name} — 一覧にあるが実体がありません`);
    } else if (p.kind === 'count-mismatch') {
      console.error(`  件数表記 "${p.detail}" が本文に見つかりません`);
    } else {
      console.error(`  ${p.kind} [${p.section}] ${p.detail}`);
    }
  }
  console.error(`[check-skill-inventory] NG: ${problems.length} 件`);
  return 1;
}

if (process.argv[1] && process.argv[1].endsWith('check-skill-inventory.mjs')) {
  process.exit(main());
}
