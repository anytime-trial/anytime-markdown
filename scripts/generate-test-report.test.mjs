import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportMarkdown } from './generate-test-report.mjs';

const passRun = {
  kind: 'unit',
  package: 'markdown-viewer',
  command: 'npx jest packages/markdown-viewer',
  status: 'pass',
  duration_ms: 1500,
  commit_hash: 'abc123def',
  tree_state: 'clean',
  environment: '{"node":"v22.0.0","platform":"linux"}',
  started_at: '2026-07-06T01:00:00.000Z',
  finished_at: '2026-07-06T01:00:01.500Z',
};

test('frontmatter と主要セクションを含む', () => {
  const md = buildReportMarkdown({
    runs: [passRun],
    targetLabel: 'commit abc123def',
    generatedAtIso: '2026-07-06T02:00:00.000Z',
  });
  assert.match(md, /^---\ntitle: /);
  assert.match(md, /type: "report"/);
  assert.match(md, /## サマリ/);
  assert.match(md, /## 種別別の結果/);
  assert.match(md, /## 失敗と対処/);
  assert.match(md, /## 検証欠落/);
});

test('検証欠落: pass 記録の無い kind を列挙する', () => {
  const md = buildReportMarkdown({ runs: [passRun], targetLabel: 't', generatedAtIso: '2026-07-06T02:00:00.000Z' });
  assert.doesNotMatch(md, /## 検証欠落[\s\S]*?- unit/);
  assert.match(md, /## 検証欠落[\s\S]*?- next-build/);
  assert.match(md, /## 検証欠落[\s\S]*?- manual/);
});

test('失敗と対処: fail の後の pass を対処済みとして示す', () => {
  const failRun = { ...passRun, status: 'fail', started_at: '2026-07-06T00:00:00.000Z' };
  const md = buildReportMarkdown({
    runs: [failRun, passRun],
    targetLabel: 't',
    generatedAtIso: '2026-07-06T02:00:00.000Z',
  });
  assert.match(md, /## 失敗と対処[\s\S]*?markdown-viewer[\s\S]*?fail/);
  assert.match(md, /対処済み/);
});

test('frontmatter の date は JST 日付になる（UTC 16:00 = JST 翌日）', () => {
  const md = buildReportMarkdown({ runs: [passRun], targetLabel: 't', generatedAtIso: '2026-07-06T16:00:00.000Z' });
  assert.match(md, /date: "2026-07-07"/);
});

test('日時は JST 表示に変換される', () => {
  const md = buildReportMarkdown({ runs: [passRun], targetLabel: 't', generatedAtIso: '2026-07-06T02:00:00.000Z' });
  assert.match(md, /10:00/); // 01:00Z = 10:00 JST
  assert.match(md, /JST/);
});
