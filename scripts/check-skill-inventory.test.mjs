import assert from 'node:assert/strict';
import test from 'node:test';

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkCountPhrases,
  collectBundledSkills,
  diffSets,
  main,
  parseSkillNames,
  trackedSkillNames,
} from './check-skill-inventory.mjs';

const BOUNDS = { start: '## 1. 拡張同梱スキル', end: '### 1.1' };

// 実文書の構造を模す。総数は frontmatter の excerpt と本文の 2 か所に出る。
const doc = [
  '---',
  'excerpt: "anytime-markdown が保持する 3 本の Claude Code スキルの一覧。"',
  '---',
  '',
  '# スキル一覧',
  '',
  '本プロジェクトは 3 本の Claude Code スキルを保持する。うち 2 本は VS Code 拡張に同梱され、残る 1 本は本リポジトリ固有である。',
  '',
  '## 1. 拡張同梱スキル（2 本）',
  '',
  '| スキル | 用途 | 拡張 | 配置方式 |',
  '| --- | --- | --- | --- |',
  '| `anytime-alpha` | 説明 | anytime-agent | `installStaticSkillDir` |',
  '| `anytime-beta` | 説明 | anytime-trail | `installStaticSkillDir` |',
  '',
  '### 1.1. 配置方式',
  '',
  '## 3. 拡張同梱なしスキル（1 本）',
  '',
  '| スキル | 用途 | 起動トリガ |',
  '| --- | --- | --- |',
  '| `local-only` | 説明 | トリガ |',
  '',
  '## 4. 制約',
].join('\n');

test('parseSkillNames: 表の行からスキル名だけを抜く', () => {
  const { names, found } = parseSkillNames(doc, BOUNDS);
  assert.equal(found, true);
  assert.deepEqual([...names].sort(), ['anytime-alpha', 'anytime-beta']);
});

test('parseSkillNames: セクションの範囲外の行を拾わない', () => {
  const { names } = parseSkillNames(doc, BOUNDS);
  assert.equal(names.has('local-only'), false);
});

test('parseSkillNames: 見出しが無ければ found=false（空集合を正常と誤判定させない）', () => {
  const { names, found } = parseSkillNames(doc, { start: '## 9. 無い見出し', end: '## 10.' });
  assert.equal(found, false);
  assert.equal(names.size, 0);
});

test('trackedSkillNames: git ls-files の出力からスキル名を重複なく抽出する', () => {
  const out = [
    '.claude/skills/screen-design/SKILL.md',
    '.claude/skills/screen-design/references/tokens.md',
    '.claude/skills/i18n-naming/SKILL.md',
    '.claude/settings.json',
    '',
  ].join('\n');
  assert.deepEqual([...trackedSkillNames(out)].sort(), ['i18n-naming', 'screen-design']);
});

test('diffSets: 掲載漏れと過剰掲載を双方向に返す', () => {
  const result = diffSets(new Set(['a', 'stale']), new Set(['a', 'fresh']));
  assert.deepEqual(result.missingInDoc, ['fresh']);
  assert.deepEqual(result.missingInReality, ['stale']);
});

test('diffSets: 一致していれば両方向とも空', () => {
  const result = diffSets(new Set(['a', 'b']), new Set(['b', 'a']));
  assert.deepEqual(result.missingInDoc, []);
  assert.deepEqual(result.missingInReality, []);
});

test('checkCountPhrases: 件数が一致していれば欠落なし', () => {
  assert.deepEqual(checkCountPhrases(doc, { total: 3, bundled: 2, projectOnly: 1 }), []);
});

test('checkCountPhrases: 実体が増えると該当する表記だけが不一致として返る', () => {
  const problems = checkCountPhrases(doc, { total: 4, bundled: 3, projectOnly: 1 });
  const labels = problems.map((p) => p.label);
  assert.equal(labels.includes('保持する N 本（excerpt）'), true);
  assert.equal(labels.includes('本プロジェクトは N 本（本文）'), true);
  assert.equal(labels.includes('## 1. 拡張同梱スキル（N 本）'), true);
  assert.equal(labels.includes('残る N 本は本リポジトリ固有'), false);
  assert.equal(problems.every((p) => p.kind === 'count-mismatch'), true);
});

test('checkCountPhrases: excerpt だけ直して本文を直し忘れた状態を検出する', () => {
  const halfFixed = doc.replace('anytime-markdown が保持する 3 本', 'anytime-markdown が保持する 4 本');
  const problems = checkCountPhrases(halfFixed, { total: 4, bundled: 2, projectOnly: 1 });
  assert.deepEqual(problems.map((p) => p.label), ['本プロジェクトは N 本（本文）']);
  assert.deepEqual(problems[0].found, [3]);
});

test('checkCountPhrases: 同じ数量が 2 か所にあり片方だけ古い状態を検出する', () => {
  // includes() 方式では「正しい値がどこかに在る」だけで通ってしまっていた退行の再現
  const twoPlaces = doc.replace(
    '本プロジェクトは 3 本の Claude Code スキルを保持する。',
    '本プロジェクトは 3 本の Claude Code スキルを保持する。（再掲）本プロジェクトは 2 本の Claude Code スキルを保持する。',
  );
  const problems = checkCountPhrases(twoPlaces, { total: 3, bundled: 2, projectOnly: 1 });
  assert.deepEqual(problems.map((p) => p.label), ['本プロジェクトは N 本（本文）']);
  assert.deepEqual(problems[0].found, [2]);
});

test('checkCountPhrases: 言い回しが変わった場合は値の陳腐化と別 kind で返る', () => {
  const rephrased = doc.replace('本プロジェクトは 3 本の Claude Code スキル', '現在 3 本の Claude Code スキル');
  const problems = checkCountPhrases(rephrased, { total: 3, bundled: 2, projectOnly: 1 });
  assert.deepEqual(problems.map((p) => p.kind), ['count-phrase-missing']);
});

test('collectBundledSkills: packages/*/skills/<name>/ を走査しパッケージ名を対応づける', () => {
  const dirs = {
    '/repo/packages': ['vscode-agent-extension', 'markdown-core'],
    '/repo/packages/vscode-agent-extension/skills': ['anytime-alpha', 'manifest.json'],
  };
  const fs = {
    exists: (p) => Object.hasOwn(dirs, p) || p === '/repo/packages/vscode-agent-extension/skills',
    readdir: (p) => dirs[p] ?? [],
    isDir: (p) => p.endsWith('skills') || p.endsWith('anytime-alpha'),
  };
  const bundled = collectBundledSkills('/repo', fs);
  assert.deepEqual([...bundled.entries()], [['anytime-alpha', 'vscode-agent-extension']]);
});

test('collectBundledSkills: skills/ を持たないパッケージは無視する', () => {
  const fs = {
    exists: (p) => p === '/repo/packages',
    readdir: (p) => (p === '/repo/packages' ? ['markdown-core'] : []),
    isDir: () => true,
  };
  assert.equal(collectBundledSkills('/repo', fs).size, 0);
});

// ---- main() の end-to-end 検査 -------------------------------------------
// 純粋関数が正しくても、それを受けた main() が exit 1 にしなければゲートは機能しない。
// 実リポジトリの実体から「正しい一覧」を組み立て、変異を入れて落ちることを確かめる。

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 実体から辻褄の合う一覧 Markdown を生成する。 */
function buildValidInventory() {
  const bundled = [...collectBundledSkills(repoRoot).keys()];
  const tracked = trackedSkillNames(
    execFileSync('git', ['-C', repoRoot, 'ls-files', '.claude/skills/'], { encoding: 'utf8' }),
  );
  const projectOnly = [...tracked].filter((n) => !bundled.includes(n));
  const row = (n) => `| \`${n}\` | 用途 | 拡張 | 方式 |`;
  return [
    '---',
    `excerpt: "anytime-markdown が保持する ${bundled.length + projectOnly.length} 本の Claude Code スキルの一覧。"`,
    '---',
    '',
    `本プロジェクトは ${bundled.length + projectOnly.length} 本の Claude Code スキルを保持する。`
      + `うち ${bundled.length} 本は VS Code 拡張に同梱され、`
      + `残る ${projectOnly.length} 本は本リポジトリ固有の運用・規約である。`,
    '',
    `## 1. 拡張同梱スキル（${bundled.length} 本）`,
    '',
    ...bundled.map(row),
    '',
    '### 1.1. 配置方式',
    '',
    `## 3. 拡張同梱なしスキル（${projectOnly.length} 本）`,
    '',
    ...projectOnly.map(row),
    '',
    '## 4. 制約',
  ].join('\n');
}

/** 一時ディレクトリへ md を書いて main() を静かに実行する。 */
function runMain(markdown, { write = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'skill-inventory-test-'));
  const file = join(dir, 'inventory.ja.md');
  if (write) writeFileSync(file, markdown);
  const { log, warn, error } = console;
  console.log = console.warn = console.error = () => {};
  try {
    return main([file]);
  } finally {
    Object.assign(console, { log, warn, error });
    rmSync(dir, { recursive: true, force: true });
  }
}

test('main: 実体と辻褄の合う一覧なら 0 を返す', () => {
  assert.equal(runMain(buildValidInventory()), 0);
});

test('main: 同梱スキルの行を 1 つ削ると 1 を返す（掲載漏れ）', () => {
  const lines = buildValidInventory().split('\n');
  const idx = lines.findIndex((l) => l.startsWith('| `'));
  lines.splice(idx, 1);
  assert.equal(runMain(lines.join('\n')), 1);
});

test('main: 実体にないスキルを足すと 1 を返す（過剰掲載）', () => {
  const md = buildValidInventory().replace(
    '### 1.1. 配置方式',
    '| `ghost-skill-that-does-not-exist` | 架空 | 架空 | 架空 |\n\n### 1.1. 配置方式',
  );
  assert.equal(runMain(md), 1);
});

test('main: 件数表記だけ古いと 1 を返す', () => {
  const md = buildValidInventory().replace(/うち (\d+) 本は VS Code 拡張に同梱/, 'うち 999 本は VS Code 拡張に同梱');
  assert.equal(runMain(md), 1);
});

test('main: 見出しを変えて表を切り出せなくなると 1 を返す（空集合を正常と誤判定しない）', () => {
  const md = buildValidInventory().replace('## 1. 拡張同梱スキル（', '## 1. 同梱されるスキル（');
  assert.equal(runMain(md), 1);
});

test('main: 明示パスが存在しなければ 1 を返す（走らせたつもりで走っていない状態を作らない）', () => {
  assert.equal(runMain('', { write: false }), 1);
});
