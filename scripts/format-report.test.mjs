import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO_ROOT, '.claude/skills/resolve-issues/scripts/format-report.sh');

function runReport(resolved, unresolved = [], skipped = [], prUrl) {
  const dir = mkdtempSync(path.join(tmpdir(), 'format-report-'));
  try {
    const files = [
      ['r.json', resolved],
      ['u.json', unresolved],
      ['k.json', skipped],
    ].map(([name, data]) => {
      const p = path.join(dir, name);
      writeFileSync(p, JSON.stringify(data));
      return p;
    });
    return spawnSync('bash', [SCRIPT, ...files, ...(prUrl ? [prUrl] : [])], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const item = (source, extra = {}) => ({
  source,
  rule: 'r',
  severity: 'high',
  file: 'a.ts',
  title: 't',
  ...extra,
});

/** サマリー行の全角括弧の中から「ラベル: 件数」を抜き出す。 */
function breakdown(stdout) {
  const line = stdout.split('\n').find((l) => l.startsWith('- 対象:'));
  assert.ok(line, 'サマリーの対象行が無い');
  const inner = /（(.*)）/.exec(line)?.[1] ?? '';
  const counts = {};
  for (const part of inner.split(',')) {
    const m = /^\s*(.+?):\s*(\d+)\s*$/.exec(part);
    if (m) counts[m[1]] = Number(m[2]);
  }
  return { line, counts };
}

test('内訳の合計が対象件数と一致する（どのソースも欠落しない）', () => {
  // fetch-github-issues.sh / fetch-sonar-issues.sh が実際に出す source をすべて含める。
  // 固定リストで数えていると、新しい source が「内訳 0」として黙って消える。
  const resolved = [
    item('github-issue'),
    item('dependabot'),
    item('security-alert'),
    item('code-scanning'),
    item('code-scanning'),
    item('sonarcloud'),
    item('sonarcloud-hotspot'),
  ];
  const res = runReport(resolved);
  assert.equal(res.status, 0, `exit ${res.status}\nstderr: ${res.stderr}`);

  const { counts } = breakdown(res.stdout);
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.equal(sum, resolved.length, `内訳の和 ${sum} が対象 ${resolved.length} と一致しない`);
  assert.equal(counts['code-scanning'], 2, 'code-scanning が内訳に出ていない');
  assert.equal(counts['sonarcloud-hotspot'], 1, 'sonarcloud-hotspot が内訳に出ていない');
});

test('未知の source が増えても内訳に現れる', () => {
  const res = runReport([item('brand-new-scanner')]);
  const { counts } = breakdown(res.stdout);
  assert.equal(counts['brand-new-scanner'], 1, '未知の source が黙って落ちている');
});

test('resolved / unresolved / skipped を横断して数える', () => {
  const res = runReport([item('code-scanning')], [item('code-scanning')], [item('sonarcloud')]);
  const { counts } = breakdown(res.stdout);
  assert.equal(counts['code-scanning'], 2);
  assert.equal(counts['sonarcloud'], 1);
});

test('0 件でも frontmatter と見出しは壊れない', () => {
  const res = runReport([]);
  assert.equal(res.status, 0, `exit ${res.status}\nstderr: ${res.stderr}`);
  assert.match(res.stdout, /^---\n/);
  assert.match(res.stdout, /title: "Issue 解決レポート/);
  assert.match(res.stdout, /- 対象: 0 件/);
});
