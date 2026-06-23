'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const cr = require('./codex-review.cjs');

test('buildReviewPrompt は review-finding-format とセンチネルと read-only 制約と diff 指示を含む', () => {
  const p = cr.buildReviewPrompt('develop');
  assert.match(p, /git diff develop\.\.\.HEAD/);
  assert.match(p, /### N\. タイトル/);
  assert.match(p, /重大度: error \| warn \| info/);
  assert.match(p, /問題:/);
  assert.match(p, /提案:/);
  assert.match(p, /<<<CROSS-REVIEW-START>>>/);
  assert.match(p, /<<<CROSS-REVIEW-END>>>/);
  assert.match(p, /ファイルを変更しない|read-only|読み取り専用/);
});

test('extractReviewSection はセンチネル間のみ抽出し codex メタを除去する', () => {
  const stdout = [
    'reading diff...', 'tokens used 1234',
    '<<<CROSS-REVIEW-START>>>',
    '### 1. NULL 参照の可能性', '- 重大度: warn', '問題: x が null になりうる。', '提案: ?. を使う。',
    '<<<CROSS-REVIEW-END>>>', 'done.',
  ].join('\n');
  const section = cr.extractReviewSection(stdout);
  assert.match(section, /### 1\. NULL 参照/);
  assert.doesNotMatch(section, /tokens used/);
  assert.doesNotMatch(section, /CROSS-REVIEW/);
});
test('extractReviewSection はマーカー不在なら null を返す', () => {
  assert.strictEqual(cr.extractReviewSection('no markers here'), null);
});

test('parseFindings は ### N. 見出しと 重大度 行を抽出する', () => {
  const section = ['### 1. A', '- 重大度: warn', '問題: a', '', '### 2. B', '- 重大度: error', '問題: b'].join('\n');
  const fs = cr.parseFindings(section);
  assert.strictEqual(fs.length, 2);
  assert.strictEqual(fs[0].severity, 'warn');
  assert.strictEqual(fs[1].severity, 'error');
});
test('parseFindings は 重大度 行が無い指摘を info 既定にする', () => {
  const fs = cr.parseFindings('### 1. X\n問題: x');
  assert.strictEqual(fs.length, 1);
  assert.strictEqual(fs[0].severity, 'info');
});
test('maxSeverity は error > warn > info', () => {
  assert.strictEqual(cr.maxSeverity([{ severity: 'info' }, { severity: 'warn' }]), 'warn');
  assert.strictEqual(cr.maxSeverity([{ severity: 'warn' }, { severity: 'error' }]), 'error');
  assert.strictEqual(cr.maxSeverity([]), 'info');
});

test('detectMutation は before/after の git status 差分を検出する', () => {
  const r = cr.detectMutation(' M packages/a.ts', ' M packages/a.ts\n M packages/b.ts');
  assert.strictEqual(r.mutated, true);
  assert.deepStrictEqual(r.added, [' M packages/b.ts']);
});
test('detectMutation は変化なしなら mutated=false', () => {
  const r = cr.detectMutation(' M a.ts', ' M a.ts');
  assert.strictEqual(r.mutated, false);
  assert.deepStrictEqual(r.added, []);
});

test('detectMutation は porcelain 行が同一でも内容(git diff)が変われば mutated=true (dirty file 上書き・指摘#1)', () => {
  const before = ' M a.ts\n--- git diff HEAD ---\n-old line';
  const after = ' M a.ts\n--- git diff HEAD ---\n+new line';
  const r = cr.detectMutation(before, after);
  assert.strictEqual(r.mutated, true);
});

test('runReview は codex 出力を抽出し finding を集計、mutation を検出する', async () => {
  const fakeStdout = ['<<<CROSS-REVIEW-START>>>','### 1. X','- 重大度: warn','問題: x','提案: y','<<<CROSS-REVIEW-END>>>'].join('\n');
  const r = await cr.runReview({ base: 'develop', runCodex: async () => ({ code: 0, stdout: fakeStdout, stderr: '' }), gitStatus: () => '', logger: { info() {}, error() {} } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.findingCount, 1);
  assert.strictEqual(r.maxSeverity, 'warn');
  assert.strictEqual(r.mutated, false);
  assert.match(r.section, /### 1\. X/);
});
test('runReview は codex がファイル変更したら mutated=true・ok=false', async () => {
  let n = 0;
  const r = await cr.runReview({ base: 'develop', runCodex: async () => ({ code: 0, stdout: '<<<CROSS-REVIEW-START>>>指摘なし<<<CROSS-REVIEW-END>>>', stderr: '' }), gitStatus: () => (n++ === 0 ? '' : ' M leaked.ts'), logger: { info() {}, error() {} } });
  assert.strictEqual(r.mutated, true);
  assert.strictEqual(r.ok, false);
});
test('runReview は codex 非ゼロ終了で ok=false・error を返す', async () => {
  const r = await cr.runReview({ base: 'develop', runCodex: async () => ({ code: 1, stdout: '', stderr: 'boom' }), gitStatus: () => '', logger: { info() {}, error() {} } });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /boom|exit 1/);
});
