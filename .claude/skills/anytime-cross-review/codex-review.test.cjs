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
