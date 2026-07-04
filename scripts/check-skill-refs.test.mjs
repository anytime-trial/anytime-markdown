import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRefs, verificationTarget } from './check-skill-refs.mjs';

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
