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
