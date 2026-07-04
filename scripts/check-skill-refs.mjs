#!/usr/bin/env node
// check-skill-refs.mjs — SKILL.md の参照実在性 lint。
// スキル本文が参照する (1) /Shared/anytime-markdown-docs 配下パス
// (2) リポジトリ相対パス(scripts/ packages/) (3) `npm run <script>` の実在を検証し、
// (4) `/Shared/` プレフィクス欠落 typo(`/anytime-markdown-docs/...`)を検出する。
// 参照先が先に移動・改名されるとスキルがサイレントに陳腐化するため CI でドリフトを検出する
// (check-bundled-skills.mjs が同梱コピーの byte 一致を守るのと対になる本文側ゲート)。
//
// 使い方: node scripts/check-skill-refs.mjs [--json] [skillsDir ...]
//   skillsDir 省略時は <repoRoot>/.claude/skills。リポジトリ外の dir(例: ~/.claude/skills)を
//   渡した場合、リポジトリ相対パス参照と npm script 参照の検証はスキップする(別リポの文脈のため)。
// 終了コード: 参照切れ検出時のみ 1。更新日欠落は warn(非 fail)。

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// パス参照の終端: 空白・バッククォート・引用符・括弧(全半角)・句読点・山括弧/角括弧/波括弧(プレースホルダ)・glob
const PATH_STOP = String.raw`\s\`"'()（）、。<>\[\]{}|*`;
const PATH_RE = new RegExp(
  String.raw`(\/Shared\/anytime-markdown-docs(?:\/[^${PATH_STOP}]*)?|(?<![\w/.@-])(?:scripts|packages)\/[^${PATH_STOP}]+)`,
  'g',
);
const PLACEHOLDER_CHARS = new Set(['<', '[', '{', '*']);
// `/Shared/` プレフィクス欠落 typo: 実在しない絶対パス /anytime-markdown-docs/... を検出する
// (lookbehind で正規の /Shared/anytime-markdown-docs/... 内の部分一致を除外)。
const TYPO_DOC_RE = new RegExp(
  String.raw`(?<!\/Shared)\/anytime-markdown-docs\/[^${PATH_STOP}]*`,
  'g',
);

/** markdown からパス参照と npm script 参照を抽出する(純粋関数)。 */
export function extractRefs(markdown) {
  const paths = [];
  for (const m of markdown.matchAll(PATH_RE)) {
    const value = m[1].replace(/[.,:：]+$/, '');
    const next = markdown[m.index + m[1].length];
    const truncated = PLACEHOLDER_CHARS.has(next);
    const kind = value.startsWith('/Shared/') ? 'docPath' : 'repoPath';
    paths.push({ kind, value, truncated });
  }
  for (const m of markdown.matchAll(TYPO_DOC_RE)) {
    paths.push({ kind: 'typoPath', value: m[0].replace(/[.,:：]+$/, ''), truncated: false });
  }
  const npmScripts = [];
  for (const line of markdown.split('\n')) {
    // SHORTCUT: --workspace/-w 付き npm run は行ごとスキップ. ceiling: root scripts のみ照合.
    // upgrade: workspace 参照の参照切れが実害を出したら workspace 解決を実装.
    if (/--workspace|-w /.test(line)) continue;
    for (const m of line.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) npmScripts.push(m[1]);
  }
  return { paths, npmScripts };
}

/** 実在確認すべきパスへ正規化する(純粋関数)。プレースホルダで切れた参照はディレクトリ部分のみ検証する。 */
export function verificationTarget(ref) {
  let p = ref.value;
  if (ref.truncated && !p.endsWith('/')) p = p.slice(0, p.lastIndexOf('/') + 1);
  return p.replace(/\/+$/, '') || '/';
}

/** 1 つの skills ディレクトリを lint し、スキルごとの結果を返す。 */
export function lintSkillsDir(dir, rootScripts) {
  const resolved = resolve(dir);
  const isRepoLocal = resolved === repoRoot || resolved.startsWith(repoRoot + sep);
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(dir, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const body = readFileSync(skillFile, 'utf-8');
    const { paths, npmScripts } = extractRefs(body);
    const missingRefs = [];
    for (const ref of paths) {
      // /Shared 欠落 typo は実在しない絶対パスなので常に fail(実在確認は不要)
      if (ref.kind === 'typoPath') {
        missingRefs.push(`(typo? /Shared 欠落) ${ref.value}`);
        continue;
      }
      if (ref.kind === 'repoPath' && !isRepoLocal) continue;
      const target = verificationTarget(ref);
      const abs = ref.kind === 'docPath' ? target : join(repoRoot, target);
      if (!existsSync(abs)) missingRefs.push(ref.value);
    }
    const missingScripts = isRepoLocal
      ? [...new Set(npmScripts)].filter((s) => !rootScripts.has(s))
      : [];
    const hasUpdateDate = /^更新日: \d{4}-\d{2}-\d{2}/m.test(body);
    results.push({
      dir,
      skill: entry.name,
      missingRefs: [...new Set(missingRefs)],
      missingScripts,
      hasUpdateDate,
    });
  }
  return results;
}

/** canonical(.claude/skills)に存在しないスキルの結果だけを残す(同梱のみスキルの CI カバレッジ用)。 */
export function selectBundledOnly(results, canonicalNames) {
  return results.filter((r) => !canonicalNames.has(r.skill));
}

/**
 * packages/*\/skills ディレクトリのうち canonical(.claude/skills)に存在しない
 * 同梱専用スキルの lint 結果を集める(既定モード限定の拡張。引数明示モードでは呼ばない)。
 * canonical ありの同梱コピーは check-bundled-skills.mjs の byte 一致検証で守られるため、
 * ここでは二重報告しない。
 */
function lintBundledOnlySkills(rootScripts, canonicalNames) {
  const packagesDir = join(repoRoot, 'packages');
  if (!existsSync(packagesDir)) return [];
  const results = [];
  for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const skillsDir = join(packagesDir, pkg.name, 'skills');
    if (!existsSync(skillsDir)) continue;
    const bundledResults = lintSkillsDir(skillsDir, rootScripts);
    results.push(...selectBundledOnly(bundledResults, canonicalNames));
  }
  return results;
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const dirs = args.filter((a) => !a.startsWith('--'));
  const isDefaultMode = dirs.length === 0;
  if (isDefaultMode) dirs.push(join(repoRoot, '.claude', 'skills'));

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      console.error(`[check-skill-refs] skillsDir が存在しません: ${dir}`);
      process.exit(1);
    }
  }

  const pkgPath = join(repoRoot, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch (err) {
    console.error(
      `[check-skill-refs] package.json の読み込みに失敗しました: ${pkgPath} (${err instanceof Error ? err.message : String(err)})`,
    );
    process.exit(1);
  }
  const rootScripts = new Set(Object.keys(pkg.scripts ?? {}));

  const results = dirs.flatMap((d) => lintSkillsDir(d, rootScripts));
  if (isDefaultMode) {
    const canonicalNames = new Set(
      readdirSync(dirs[0], { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name),
    );
    results.push(...lintBundledOnlySkills(rootScripts, canonicalNames));
  }
  const broken = results.filter((r) => r.missingRefs.length > 0 || r.missingScripts.length > 0);
  const noDate = results.filter((r) => !r.hasUpdateDate);

  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`[check-skill-refs] スキル ${results.length} 件を検査 (${dirs.join(', ')})`);
    for (const r of broken) {
      console.error(`  ✗ ${r.skill}`);
      for (const p of r.missingRefs) console.error(`      参照切れ: ${p}`);
      for (const s of r.missingScripts) console.error(`      npm script 不在: ${s}`);
    }
    for (const r of noDate) console.warn(`  ! ${r.skill}: 更新日 なし (warn)`);
    if (broken.length === 0) console.log('[check-skill-refs] OK: 参照切れなし');
  }
  if (broken.length > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
