'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const cr = require('./codex-review.cjs');

test('buildReviewPrompt は review-finding-format とセンチネルと read-only 制約を含む', () => {
  const p = cr.buildReviewPrompt();
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
