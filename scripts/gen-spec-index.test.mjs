// gen-spec-index CLI（tsx ラッパー）の冪等性テスト（要件書 AC-1・AC-2 の CLI 経路）。
// 生成ロジック本体のテストは packages/doc-core/src/folderIndex/__tests__/ にあり、
// ここでは「npm script が呼ぶ経路」が実際に tsx で動き、冪等であることだけを固定する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx');
const cli = path.join(repoRoot, 'scripts', 'gen-spec-index.mjs');

function runCli(docDir) {
  // ハングをコミット・CI のブロックにしないため timeout 必須。
  return spawnSync(tsxBin, [cli, docDir, '設計書', 'ja'], {
    encoding: 'utf8',
    timeout: 60_000,
  });
}

test('gen-spec-index CLI は 2 回目の実行で 1 件も書き込まない', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-spec-index-'));
  try {
    fs.writeFileSync(
      path.join(root, 'sample.ja.md'),
      '---\ntitle: "サンプル"\nexcerpt: "説明"\n---\n\n# サンプル\n',
      'utf8',
    );

    const first = runCli(root);
    assert.equal(first.status, 0, `first run failed: ${first.stderr}`);
    assert.match(first.stdout, /wrote 1, unchanged 0/);

    const indexPath = path.join(root, 'index.ja.md');
    const afterFirst = fs.readFileSync(indexPath, 'utf8');

    const second = runCli(root);
    assert.equal(second.status, 0, `second run failed: ${second.stderr}`);
    assert.match(second.stdout, /wrote 0, unchanged 1/);
    assert.equal(fs.readFileSync(indexPath, 'utf8'), afterFirst);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gen-spec-index CLI は存在しないディレクトリで exit 1', () => {
  const missing = path.join(os.tmpdir(), 'gen-spec-index-missing-does-not-exist');
  const result = runCli(missing);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /dir not found/);
});
