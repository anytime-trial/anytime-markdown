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
// **実効範囲はローカル実行のみ。** docsRoot はリポジトリ外にあり GitHub ランナーには
// 存在しないため、CI の `npm run check-skills` 経由では常に skip される（skip は warn を
// stderr へ出すだけで、CI ログは緑のまま）。CI にも実効性を持たせるには docs リポジトリを
// checkout する必要がある。現状は「develop マージ前にローカルで回すゲート」と位置づける。
//
// 検査しないもの（意図的な範囲外）:
//   - §1.1 配置方式の拡張別内訳（表記ゆれに弱く、集合差分で実質カバーされる）
//   - 各行の用途・トリガ列の内容（機械判定できない）

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/**
 * 件数表記の検査（純粋関数）。表の行数と本文の数字がずれるのが典型的な陳腐化。
 *
 * 期待フレーズの includes だけでは不足する。正しい数字が 1 か所にあれば、同じ言い回しの
 * 古い数字が別の箇所に残っていても通ってしまう（総数は frontmatter の excerpt と本文の
 * 2 か所にある）。値を抽出して**全出現**を比較し、書式変更（0 件ヒット）と値の陳腐化を
 * 別 kind で返す。
 */
export function checkCountPhrases(markdown, { total, bundled, projectOnly }) {
  // アンカーは「その数量にしか当たらない」ところまで伸ばす。緩いと別の数量を拾う。
  // 実測: `うち (\d+) 本` は §4 の「23 本のうち 20 本は packages 側が正本」にも当たり、
  // 同梱数 23 を期待して 20 を検出する誤報になった。
  const specs = [
    { label: '保持する N 本（excerpt）', re: /保持する (\d+) 本の Claude Code スキル/g, expected: total },
    { label: '本プロジェクトは N 本（本文）', re: /本プロジェクトは (\d+) 本の Claude Code スキル/g, expected: total },
    { label: 'うち N 本は VS Code 拡張に同梱', re: /うち (\d+) 本は VS Code 拡張に同梱/g, expected: bundled },
    { label: '残る N 本は本リポジトリ固有', re: /残る (\d+) 本は本リポジトリ固有/g, expected: projectOnly },
    { label: '## 1. 拡張同梱スキル（N 本）', re: /## 1\. 拡張同梱スキル（(\d+) 本）/g, expected: bundled },
    { label: '## 3. 拡張同梱なしスキル（N 本）', re: /## 3\. 拡張同梱なしスキル（(\d+) 本）/g, expected: projectOnly },
  ];
  const problems = [];
  for (const { label, re, expected } of specs) {
    const found = [...markdown.matchAll(re)].map((m) => Number(m[1]));
    if (found.length === 0) {
      // 推敲で言い回しが変わった可能性。データの陳腐化とは区別する
      problems.push({ kind: 'count-phrase-missing', label, expected });
      continue;
    }
    const stale = found.filter((v) => v !== expected);
    if (stale.length > 0) {
      problems.push({ kind: 'count-mismatch', label, expected, found: stale });
    }
  }
  return problems;
}

export function main(args = process.argv.slice(2)) {
  const asJson = args.includes('--json');
  const explicitPath = args.find((a) => !a.startsWith('--'));
  const inventoryPath = explicitPath ?? join(DOCS_ROOT, INVENTORY_REL);

  // fail-open は「docsRoot ごと存在しない」ケースだけに限定する。
  // docsRoot が在るのに一覧文書だけ無いのは、検証不能ではなく一覧が消えた状態であり、
  // まさに本ゲートが検知すべき事象なので落とす。明示パス指定時も同様（打ち間違いを
  // 黙って成功にすると「走らせたつもりで走っていない」を作れる）。
  if (!explicitPath && !existsSync(DOCS_ROOT)) {
    const reason = `${DOCS_ROOT} が存在しません。検証不能のためスキップします（掲載漏れの有無は未判定）`;
    if (asJson) console.log(JSON.stringify({ inventoryPath, skipped: true, reason, problems: [] }, null, 2));
    else console.warn(`[check-skill-inventory] ${reason}`);
    return 0;
  }
  if (!existsSync(inventoryPath)) {
    const detail = `${inventoryPath} が見つかりません`;
    if (asJson) {
      console.log(JSON.stringify({ inventoryPath, problems: [{ kind: 'inventory-missing', detail }] }, null, 2));
    } else {
      console.error(`[check-skill-inventory] NG: ${detail}（docsRoot は存在します。改名・削除を疑ってください）`);
    }
    return 1;
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
    problems.push(...checkCountPhrases(markdown, {
      total: actualBundled.size + actualProjectOnly.size,
      bundled: actualBundled.size,
      projectOnly: actualProjectOnly.size,
    }));
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
      console.error(`  件数表記 "${p.label}" が実態 ${p.expected} と食い違います（記載: ${p.found.join(' / ')}）`);
    } else if (p.kind === 'count-phrase-missing') {
      console.error(`  件数表記 "${p.label}" が本文に見つかりません（期待値 ${p.expected}。言い回しの変更を疑ってください）`);
    } else {
      console.error(`  ${p.kind} [${p.section}] ${p.detail}`);
    }
  }
  console.error(`[check-skill-inventory] NG: ${problems.length} 件`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
