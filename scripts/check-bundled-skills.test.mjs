import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyBundledFiles, trackedSkillNames } from './check-bundled-skills.mjs';

const entry = (skillName, relPath) => ({
  pkg: 'vscode-x-extension',
  skillName,
  relPath,
  bundled: `/repo/packages/vscode-x-extension/skills/${skillName}/${relPath}`,
});

/** exists / read を注入して canonical 側の状態を組み立てる。 */
function fakeFs(files) {
  return {
    exists: (p) => Object.hasOwn(files, p),
    read: (p) => (Object.hasOwn(files, p) ? files[p] : `bundled:${p}`),
  };
}

test('trackedSkillNames: git ls-files の出力からスキル名を抽出する', () => {
  const out = [
    '.claude/skills/anytime-trail-review/SKILL.md',
    '.claude/skills/anytime-ollama-delegation/SKILL.md',
    '.claude/skills/anytime-ollama-delegation/references/task-criteria.md',
    '',
  ].join('\n');
  assert.deepEqual(
    [...trackedSkillNames(out)].sort(),
    ['anytime-ollama-delegation', 'anytime-trail-review'],
  );
});

test('canonical が git 未追跡(packages 正本の生成コピー)なら SKIP し fail させない', () => {
  // 回帰: canonical dir の「実在」で判定していた頃は、.gitignore された生成コピーが
  // ローカルにだけ在るため「ローカル pass / CI fail」の環境依存ゲートになっていた。
  const entries = [entry('anytime-doc-authoring', 'SKILL.md')];
  const result = classifyBundledFiles(entries, {
    canonicalRoot: '/repo/.claude/skills',
    trackedSkills: new Set(['anytime-trail-review']),
    ...fakeFs({}),
  });

  assert.equal(result.skipped.length, 1);
  assert.equal(result.missingCanonical.length, 0);
  assert.equal(result.mismatches.length, 0);
});

test('canonical 正本でファイルが欠落していれば missingCanonical(fail) にする', () => {
  const entries = [entry('anytime-trail-review', 'helper.cjs')];
  const result = classifyBundledFiles(entries, {
    canonicalRoot: '/repo/.claude/skills',
    trackedSkills: new Set(['anytime-trail-review']),
    ...fakeFs({ '/repo/.claude/skills/anytime-trail-review/SKILL.md': 'x' }),
  });

  assert.equal(result.missingCanonical.length, 1);
  assert.equal(result.skipped.length, 0);
});

test('canonical 正本で内容が異なれば mismatch にする', () => {
  const entries = [entry('anytime-trail-review', 'SKILL.md')];
  const result = classifyBundledFiles(entries, {
    canonicalRoot: '/repo/.claude/skills',
    trackedSkills: new Set(['anytime-trail-review']),
    exists: () => true,
    read: (p) => (p.startsWith('/repo/.claude') ? 'canonical' : 'bundled'),
  });

  assert.equal(result.mismatches.length, 1);
  assert.equal(result.ok.length, 0);
});

test('canonical 正本で内容が一致すれば ok にする', () => {
  const entries = [entry('anytime-trail-review', 'SKILL.md')];
  const result = classifyBundledFiles(entries, {
    canonicalRoot: '/repo/.claude/skills',
    trackedSkills: new Set(['anytime-trail-review']),
    exists: () => true,
    read: () => 'same',
  });

  assert.equal(result.ok.length, 1);
  assert.equal(result.mismatches.length, 0);
});
