import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectChangedSkills, findMissingBumps } from './check-skill-manifest-bump.mjs';

test('collectChangedSkills: 同梱スキル配下の変更だけを拡張ごとに集める', () => {
  const changed = [
    'packages/vscode-agent-extension/skills/anytime-dev-cycle/SKILL.md',
    'packages/vscode-agent-extension/skills/anytime-dev-cycle/references/delegation.md',
    'packages/vscode-trail-extension/skills/anytime-dev-retro/grounding.cjs',
    'packages/vscode-agent-extension/src/extension.ts',
    'scripts/check-skill-refs.mjs',
  ];
  const got = collectChangedSkills(changed);
  assert.deepEqual([...got.keys()].sort(), ['vscode-agent-extension', 'vscode-trail-extension']);
  assert.deepEqual([...got.get('vscode-agent-extension')], ['anytime-dev-cycle']);
  assert.deepEqual([...got.get('vscode-trail-extension')], ['anytime-dev-retro']);
});

test('collectChangedSkills: manifest.json 直下の変更はスキル扱いしない', () => {
  const got = collectChangedSkills(['packages/vscode-agent-extension/skills/manifest.json']);
  assert.equal(got.size, 0);
});

test('findMissingBumps: 版数が上がっていれば違反なし', () => {
  const changed = collectChangedSkills([
    'packages/vscode-agent-extension/skills/anytime-dev-cycle/SKILL.md',
  ]);
  const manifests = new Map([
    ['vscode-agent-extension', { base: { 'anytime-dev-cycle': 1 }, head: { 'anytime-dev-cycle': 2 } }],
  ]);
  assert.deepEqual(findMissingBumps(changed, manifests), []);
});

test('findMissingBumps: 内容を変えたのに版数据置なら違反', () => {
  const changed = collectChangedSkills([
    'packages/vscode-agent-extension/skills/anytime-cross-review/SKILL.md',
  ]);
  const manifests = new Map([
    [
      'vscode-agent-extension',
      { base: { 'anytime-cross-review': 2 }, head: { 'anytime-cross-review': 2 } },
    ],
  ]);
  const violations = findMissingBumps(changed, manifests);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].skill, 'anytime-cross-review');
  assert.match(violations[0].reason, /版数が上がっていない/);
});

test('findMissingBumps: 版数を下げるのも違反', () => {
  const changed = collectChangedSkills([
    'packages/vscode-agent-extension/skills/anytime-proposal/SKILL.md',
  ]);
  const manifests = new Map([
    ['vscode-agent-extension', { base: { 'anytime-proposal': 3 }, head: { 'anytime-proposal': 2 } }],
  ]);
  assert.equal(findMissingBumps(changed, manifests).length, 1);
});

test('findMissingBumps: manifest 未登録のスキルは違反（登録漏れを検出する）', () => {
  const changed = collectChangedSkills([
    'packages/vscode-agent-extension/skills/brand-new-skill/SKILL.md',
  ]);
  const manifests = new Map([
    ['vscode-agent-extension', { base: {}, head: { 'anytime-dev-cycle': 1 } }],
  ]);
  const violations = findMissingBumps(changed, manifests);
  assert.equal(violations.length, 1);
  assert.match(violations[0].reason, /登録されていない/);
});

test('findMissingBumps: base に無い新規スキルは head に登録されていれば違反にしない', () => {
  const changed = collectChangedSkills([
    'packages/vscode-agent-extension/skills/anytime-dev-cycle/SKILL.md',
  ]);
  const manifests = new Map([
    ['vscode-agent-extension', { base: {}, head: { 'anytime-dev-cycle': 1 } }],
  ]);
  assert.deepEqual(findMissingBumps(changed, manifests), []);
});

test('findMissingBumps: 削除・改名で HEAD に無くなったスキルは違反にしない', () => {
  // 改名（anytime-dev-health → anytime-dev-retro）では旧 dir の全ファイルが削除差分として出る。
  // 消えたスキルに manifest 登録を求めるのは誤り（登録すべきは新名だけ）。
  const changed = collectChangedSkills([
    'packages/vscode-trail-extension/skills/anytime-dev-health/SKILL.md',
    'packages/vscode-trail-extension/skills/anytime-dev-retro/SKILL.md',
  ]);
  const manifests = new Map([
    ['vscode-trail-extension', { base: { 'anytime-dev-health': 4 }, head: { 'anytime-dev-retro': 5 } }],
  ]);
  const exists = (pkg, skill) => skill === 'anytime-dev-retro'; // 旧 dir は HEAD に存在しない
  const violations = findMissingBumps(changed, manifests, exists);
  assert.deepEqual(violations, []);
});

test('findMissingBumps: manifest 未導入の拡張は対象外', () => {
  const changed = collectChangedSkills([
    'packages/vscode-markdown-extension/skills/anytime-mermaid/SKILL.md',
  ]);
  assert.deepEqual(findMissingBumps(changed, new Map()), []);
});
