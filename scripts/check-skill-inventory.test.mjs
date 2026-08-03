import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkCountPhrases,
  collectBundledSkills,
  diffSets,
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
  '本プロジェクトは 3 本の Claude Code スキルを保持する。うち 2 本は VS Code 拡張に同梱され、残る 1 本は固有。',
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

test('checkCountPhrases: 実体が増えると該当する表記だけが欠落として返る', () => {
  const missing = checkCountPhrases(doc, { total: 4, bundled: 3, projectOnly: 1 });
  assert.equal(missing.includes('保持する 4 本'), true);
  assert.equal(missing.includes('本プロジェクトは 4 本'), true);
  assert.equal(missing.includes('## 1. 拡張同梱スキル（3 本）'), true);
  assert.equal(missing.includes('残る 1 本'), false);
});

test('checkCountPhrases: excerpt だけ直して本文を直し忘れた状態を検出する', () => {
  const halfFixed = doc.replace('anytime-markdown が保持する 3 本', 'anytime-markdown が保持する 4 本');
  const missing = checkCountPhrases(halfFixed, { total: 4, bundled: 2, projectOnly: 1 });
  assert.deepEqual(missing, ['本プロジェクトは 4 本']);
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
