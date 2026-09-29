import { test } from 'node:test';
import assert from 'node:assert/strict';

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { checkManifestBump, collectChangedSkills, findMissingBumps } from './check-skill-manifest-bump.mjs';

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

test('checkManifestBump: squash マージ済みの変更をマージベース起点で再検出しない', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-bump-'));
  try {
    const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf-8' });
    const write = (rel, body) => {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), body);
    };
    const skillDir = 'packages/vscode-agent-extension/skills';
    g('init', '-q', '-b', 'master');
    g('config', 'user.email', 't@example.com');
    g('config', 'user.name', 't');
    write(`${skillDir}/manifest.json`, '{"s": 1}');
    write(`${skillDir}/s/SKILL.md`, 'v1');
    g('add', '.');
    g('commit', '-qm', 'A');
    g('switch', '-qc', 'develop');
    write(`${skillDir}/manifest.json`, '{"s": 2}');
    write(`${skillDir}/s/SKILL.md`, 'v2');
    g('commit', '-qam', 'B');
    // master へは squash マージ（develop の履歴は master に入らない）
    g('switch', '-q', 'master');
    g('merge', '-q', '--squash', 'develop');
    g('commit', '-qm', 'C (squash)');
    g('switch', '-q', 'develop');

    assert.deepEqual(checkManifestBump({ base: 'master', cwd: dir }).violations, []);

    // 以降の変更で版数を上げ忘れたら検出する
    write(`${skillDir}/s/SKILL.md`, 'v3');
    g('commit', '-qam', 'D');
    const { violations } = checkManifestBump({ base: 'master', cwd: dir });
    assert.deepEqual(
      violations.map((v) => [v.skill, v.base, v.head]),
      [['s', 2, 2]],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
