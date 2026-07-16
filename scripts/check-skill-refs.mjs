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
//   別リポジトリを生成するスキル(例: anytime-build-webapp)は本文の npm script・リポ相対パスが
//   生成先リポを指すため、SKILL.md frontmatter の `externalRepoRefs: true` で同じスキップを
//   スキル単位に宣言できる(docPath・スキル間参照・/Shared 欠落 typo の検査は継続する)。
// 終了コード: 参照切れ検出時のみ 1。更新日欠落は warn(非 fail)。

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
// ドキュメント正本の置き場。リポジトリ外のため CI ランナーには存在しない。
// 不在時は docPath の実在検証を行わない(検証不能であって参照切れではない)。typo 検出は継続する。
export const DOCS_ROOT = '/Shared/anytime-markdown-docs';

// パス参照の終端: 空白・バッククォート・引用符・括弧(全半角)・句読点・山括弧/角括弧/波括弧(プレースホルダ)・glob
const PATH_STOP = String.raw`\s\`"'()（）、。<>\[\]{}|*`;
const PATH_RE = new RegExp(
  String.raw`(\/Shared\/anytime-markdown-docs(?:\/[^${PATH_STOP}]*)?|(?<![\w/.@-])(?:\.claude\/skills|scripts|packages)\/[^${PATH_STOP}]+)`,
  'g',
);
const PLACEHOLDER_CHARS = new Set(['<', '[', '{', '*']);
// `/Shared/` プレフィクス欠落 typo: 実在しない絶対パス /anytime-markdown-docs/... を検出する
// (lookbehind で正規の /Shared/anytime-markdown-docs/... 内の部分一致を除外)。
const TYPO_DOC_RE = new RegExp(
  String.raw`(?<!\/Shared)\/anytime-markdown-docs\/[^${PATH_STOP}]*`,
  'g',
);

/** パス文字列を参照 kind に分類する(純粋関数)。 */
export function classifyPathKind(value) {
  if (value.startsWith('/Shared/')) return 'docPath';
  if (value.startsWith('.claude/skills/')) return 'skillRef';
  return 'repoPath';
}

/**
 * スキル間参照(`.claude/skills/<name>/<rest>`)の解決候補を返す(純粋関数)。
 *
 * canonical(`.claude/skills/`)は同梱スキルの場合 .gitignore された実行時コピーで、CI には存在しない。
 * よって git 正本である `packages/<ext>/skills/<name>/<rest>` でも解決できなければならない。
 * どちらか一方に実在すれば参照は生きている。
 */
export function skillRefCandidates(value, packageNames, canonicalAvailable = true) {
  const rest = value.slice('.claude/skills/'.length);
  const packagesCandidates = packageNames.map((pkg) => join('packages', pkg, 'skills', rest));
  // canonicalAvailable=false は CI(同梱スキルの .claude/skills が .gitignore で不在)の再現。
  // packages 正本だけで解決できることを検証するための seam。
  return canonicalAvailable ? [value, ...packagesCandidates] : packagesCandidates;
}

/** packages/ 配下で skills/ を持つ拡張パッケージ名を列挙する。 */
function listSkillPackages() {
  const packagesDir = join(repoRoot, 'packages');
  if (!existsSync(packagesDir)) return [];
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(packagesDir, e.name, 'skills')))
    .map((e) => e.name);
}

/**
 * SKILL.md frontmatter の `externalRepoRefs: true` 宣言を判定する(純粋関数)。
 *
 * 本文中の同名文字列で誤発動しないよう、先頭の frontmatter ブロック(--- ... ---)内のみを見る。
 */
export function hasExternalRepoRefs(markdown) {
  if (!markdown.startsWith('---\n')) return false;
  const end = markdown.indexOf('\n---', 4);
  if (end === -1) return false;
  return /^externalRepoRefs:\s*true\s*$/m.test(markdown.slice(4, end));
}

/** markdown からパス参照と npm script 参照を抽出する(純粋関数)。 */
export function extractRefs(markdown) {
  const paths = [];
  for (const m of markdown.matchAll(PATH_RE)) {
    const value = m[1].replace(/[.,:：]+$/, '');
    const next = markdown[m.index + m[1].length];
    const truncated = PLACEHOLDER_CHARS.has(next);
    paths.push({ kind: classifyPathKind(value), value, truncated });
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

/**
 * 1 つの skills ディレクトリを lint し、スキルごとの結果を返す。
 * opts.docsRootAvailable を省略すると DOCS_ROOT の実在から判定する(テスト用の seam)。
 */
export function lintSkillsDir(dir, rootScripts, opts = {}) {
  const docsRootAvailable = opts.docsRootAvailable ?? existsSync(DOCS_ROOT);
  const skillPackages = opts.skillPackages ?? listSkillPackages();
  // 既定は canonical(.claude/skills)も解決候補に含める。テストで CI 環境(canonical 不在)を再現する seam。
  const canonicalAvailable = opts.canonicalAvailable ?? true;
  const resolved = resolve(dir);
  // opts.repoLocal はテスト用 seam(tmp dir はリポ外扱いになり repo 文脈の分岐を検証できないため)。
  const isRepoLocal = opts.repoLocal ?? (resolved === repoRoot || resolved.startsWith(repoRoot + sep));
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(dir, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const body = readFileSync(skillFile, 'utf-8');
    const { paths, npmScripts } = extractRefs(body);
    // 別リポ生成型スキルは repoPath / npm script が生成先リポの文脈(リポ外 dir と同じ扱い)。
    const repoContext = isRepoLocal && !hasExternalRepoRefs(body);
    const missingRefs = [];
    for (const ref of paths) {
      // /Shared 欠落 typo は実在しない絶対パスなので常に fail(実在確認は不要)
      if (ref.kind === 'typoPath') {
        missingRefs.push(`(typo? /Shared 欠落) ${ref.value}`);
        continue;
      }
      if (ref.kind === 'repoPath' && !repoContext) continue;
      // docsRoot ごと存在しない環境(CI ランナー)では docPath を検証できない
      if (ref.kind === 'docPath' && !docsRootAvailable) continue;
      const target = verificationTarget(ref);

      // スキル間参照は canonical(実行時コピー)か packages 正本のどちらかに実在すればよい。
      // 同梱スキルの canonical は .gitignore 済みで CI に無いため、正本側で解決する。
      if (ref.kind === 'skillRef') {
        const candidates = skillRefCandidates(target, skillPackages, canonicalAvailable);
        if (!candidates.some((c) => existsSync(join(repoRoot, c)))) missingRefs.push(ref.value);
        continue;
      }

      const abs = ref.kind === 'docPath' ? target : join(repoRoot, target);
      if (!existsSync(abs)) missingRefs.push(ref.value);
    }
    const missingScripts = repoContext
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

  const docsRootAvailable = existsSync(DOCS_ROOT);
  if (!docsRootAvailable && !json) {
    console.log(`[check-skill-refs] ${DOCS_ROOT} が無いため docPath の実在検証をスキップします`);
  }
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
