import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRefs, lintSkillsDir, verificationTarget } from './check-skill-refs.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('docPath を全角括弧・読点の手前で切り出す', () => {
  const { paths } = extractRefs(
    '参照（/Shared/anytime-markdown-docs/spec/10.web-app/design.md）参照義務、以降',
  );
  assert.deepEqual(paths, [
    { kind: 'docPath', value: '/Shared/anytime-markdown-docs/spec/10.web-app/design.md', truncated: false },
  ]);
});

test('プレースホルダで切れた参照は truncated=true でディレクトリ検証に落ちる', () => {
  const { paths } = extractRefs('出力: /Shared/anytime-markdown-docs/report/<YYYYMMDD>-dev-health.ja.md');
  assert.equal(paths[0].truncated, true);
  assert.equal(verificationTarget(paths[0]), '/Shared/anytime-markdown-docs/report');
});

test('repoPath と npm script を抽出し --workspace 行は除外する', () => {
  const md = [
    '`scripts/gen-spec-index.mjs` を実行',
    'npm run check-skills を回す',
    'npm run compile --workspace=anytime-trail',
  ].join('\n');
  const { paths, npmScripts } = extractRefs(md);
  assert.deepEqual(paths, [{ kind: 'repoPath', value: 'scripts/gen-spec-index.mjs', truncated: false }]);
  assert.deepEqual(npmScripts, ['check-skills']);
});

test('文末ピリオド・コロンを参照値から除去する', () => {
  const { paths } = extractRefs('詳細は /Shared/anytime-markdown-docs/proposal/index.ja.md.');
  assert.equal(paths[0].value, '/Shared/anytime-markdown-docs/proposal/index.ja.md');
});

test('lintSkillsDir: リポ外 dir では repoPath/npm script チェックをスキップし更新日を検出する', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'check-skill-refs-'));
  try {
    mkdirSync(join(tmp, 'dummy-skill'));
    writeFileSync(
      join(tmp, 'dummy-skill', 'SKILL.md'),
      [
        '# dummy-skill',
        '更新日: 2026-07-04',
        '',
        '存在しない `packages/no-such-pkg/file.ts` を参照する。',
        'npm run no-such-script も参照する。',
      ].join('\n'),
      'utf-8',
    );
    const results = lintSkillsDir(tmp, new Set());
    assert.equal(results.length, 1);
    assert.equal(results[0].skill, 'dummy-skill');
    assert.deepEqual(results[0].missingRefs, []);
    assert.deepEqual(results[0].missingScripts, []);
    assert.equal(results[0].hasUpdateDate, true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('lintSkillsDir: リポ内実在 dir で結果スキーマ {dir, skill, missingRefs, missingScripts, hasUpdateDate} を返す', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
  const rootScripts = new Set(Object.keys(pkg.scripts ?? {}));
  const results = lintSkillsDir(join(repoRoot, '.claude', 'skills'), rootScripts);
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0);
  for (const r of results) {
    assert.deepEqual(
      Object.keys(r).sort(),
      ['dir', 'hasUpdateDate', 'missingRefs', 'missingScripts', 'skill'],
    );
    assert.equal(typeof r.dir, 'string');
    assert.equal(typeof r.skill, 'string');
    assert.ok(Array.isArray(r.missingRefs));
    assert.ok(Array.isArray(r.missingScripts));
    assert.equal(typeof r.hasUpdateDate, 'boolean');
  }
});

test('lintSkillsDir: 相対パス指定でも絶対パス指定と同一結果になる（isRepoLocal 偽陰性の回帰）', (t) => {
  if (resolve(process.cwd()) !== resolve(repoRoot)) {
    t.skip('cwd が repoRoot でないためスキップ');
    return;
  }
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
  const rootScripts = new Set(Object.keys(pkg.scripts ?? {}));
  const relative = lintSkillsDir('.claude/skills', rootScripts);
  const absolute = lintSkillsDir(join(repoRoot, '.claude', 'skills'), rootScripts);
  const strip = (rs) => rs.map(({ dir: _dir, ...rest }) => rest);
  assert.equal(JSON.stringify(strip(relative)), JSON.stringify(strip(absolute)));
});
