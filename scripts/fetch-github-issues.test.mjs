import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO_ROOT, '.claude/skills/resolve-issues/scripts/fetch-github-issues.sh');

/**
 * `gh` を差し替えたスタブを PATH の先頭に置いてスクリプトを実行する。
 *
 * スタブは第 1 引数（`issue` / `api`）とエンドポイント文字列で分岐する。実際の `gh` と同じく
 * **HTTP エラー時もレスポンス本体を stdout へ書いてから非ゼロ終了する**ところが肝で、
 * ここを再現しないと 403 の回帰は起きない。
 */
function runWithStub(stubBody) {
  const dir = mkdtempSync(path.join(tmpdir(), 'fetch-gh-issues-'));
  try {
    const gh = path.join(dir, 'gh');
    writeFileSync(gh, `#!/bin/bash\n${stubBody}\n`);
    chmodSync(gh, 0o755);
    return spawnSync('bash', [SCRIPT, 'owner/repo'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 全エンドポイントが正常応答するスタブ。 */
const HEALTHY_STUB = `
case "$1" in
  issue) echo '[{"number":1,"title":"t","labels":[{"name":"bug"}],"url":"https://example.test/1"}]' ;;
  api)
    case "$*" in
      *dependabot*) echo '[[{"number":10,"security_vulnerability":{"severity":"high"},"security_advisory":{"summary":"s","cve_id":"CVE-1"},"dependency":{"manifest_path":"p"},"html_url":"u"}]]' ;;
      *security-advisories*) echo '[[]]' ;;
      *code-scanning*) echo '[[{"number":20,"rule":{"security_severity_level":"high","description":"d","id":"js/x"},"most_recent_instance":{"location":{"path":"f.ts","start_line":3}},"html_url":"u"}]]' ;;
      *) echo '[[]]' ;;
    esac ;;
esac
`;

/** Dependabot だけが 403 を返すスタブ（本番で観測した PAT 権限不足の再現）。 */
const DEPENDABOT_403_STUB = `
case "$1" in
  issue) echo '[{"number":1,"title":"t","labels":[],"url":"https://example.test/1"}]' ;;
  api)
    case "$*" in
      *dependabot*)
        # 実物の gh と同じく、本体を stdout・人向けメッセージを stderr へ出して非ゼロ終了する。
        echo '{"message":"Resource not accessible by personal access token","status":"403"}'
        echo 'gh: Resource not accessible by personal access token (HTTP 403)' >&2
        exit 1 ;;
      *) echo '[[]]' ;;
    esac ;;
esac
`;

test('全エンドポイントが正常なら、統合済みの JSON 配列を返す', () => {
  const res = runWithStub(HEALTHY_STUB);
  assert.equal(res.status, 0, `exit ${res.status}\nstderr: ${res.stderr}`);
  const parsed = JSON.parse(res.stdout);
  assert.ok(Array.isArray(parsed));
  const sources = parsed.map((i) => i.source).sort();
  assert.deepEqual(sources, ['code-scanning', 'dependabot', 'github-issue']);
});

test('1 エンドポイントが 403 でも落ちず、他ソースの結果を返す', () => {
  const res = runWithStub(DEPENDABOT_403_STUB);
  assert.equal(res.status, 0, `403 でスクリプトごと落ちてはならない\nexit ${res.status}\nstderr: ${res.stderr}`);
  const parsed = JSON.parse(res.stdout);
  assert.ok(Array.isArray(parsed), 'stdout は JSON 配列でなければならない');
  // 落ちた dependabot は 0 件になるが、他ソースは残る。
  assert.ok(parsed.some((i) => i.source === 'github-issue'), 'issues が欠落している');
  assert.equal(parsed.filter((i) => i.source === 'dependabot').length, 0);
});

test('403 の取得失敗は stderr に理由を残す（0 件と区別できること）', () => {
  const res = runWithStub(DEPENDABOT_403_STUB);
  assert.match(res.stderr, /dependabot/i, '失敗したソース名が stderr に出ていない');
  assert.match(res.stderr, /403|失敗/, '失敗理由が stderr に出ていない');
});

test('エラー応答の本体が成果物へ混入しない', () => {
  const res = runWithStub(DEPENDABOT_403_STUB);
  assert.doesNotMatch(
    res.stdout,
    /Resource not accessible/,
    'gh がエラー時に stdout へ書いた本体が出力へ紛れ込んでいる',
  );
});

test('code-scanning は --paginate で全ページを取りに行く', () => {
  // 呼び出し行を記録するスタブ。--paginate が無いと 100 件で打ち切られる（実測 337 件中 100 件）。
  const dir = mkdtempSync(path.join(tmpdir(), 'fetch-gh-args-'));
  try {
    const log = path.join(dir, 'calls.txt');
    const gh = path.join(dir, 'gh');
    writeFileSync(
      gh,
      `#!/bin/bash\necho "$*" >> ${log}\ncase "$1" in\n  issue) echo '[]' ;;\n  api) echo '[[]]' ;;\nesac\n`,
    );
    chmodSync(gh, 0o755);
    const res = spawnSync('bash', [SCRIPT, 'owner/repo'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    });
    assert.equal(res.status, 0, `exit ${res.status}\nstderr: ${res.stderr}`);
    const calls = execFileSync('cat', [log], { encoding: 'utf8' })
      .split('\n')
      .filter((l) => l.includes('code-scanning'));
    assert.equal(calls.length, 1, 'code-scanning の呼び出しが 1 回でない');
    assert.match(calls[0], /--paginate/, 'code-scanning に --paginate が付いていない');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
