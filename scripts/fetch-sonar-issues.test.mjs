import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO_ROOT, '.claude/skills/resolve-issues/scripts/fetch-sonar-issues.sh');

/**
 * `curl` を差し替えたスタブを PATH の先頭に置いてスクリプトを実行する。
 *
 * スタブは `-w '\n%{http_code}'` を再現する必要がある（本文の後ろに改行 + ステータス）。
 * 通信断は本文を出さずに非ゼロ終了する点まで模す。ここを省くと、無言死の回帰が再現しない。
 */
function runWithCurl(stubBody, { args = [], env = {} } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'fetch-sonar-'));
  try {
    const curl = path.join(dir, 'curl');
    writeFileSync(curl, `#!/bin/bash\n${stubBody}\n`);
    chmodSync(curl, 0o755);
    return spawnSync('bash', [SCRIPT, ...args], {
      encoding: 'utf8',
      cwd: dir,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, ...env },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const issue = (key) =>
  `{"key":"${key}","severity":"MAJOR","message":"m","component":"K:src/a.ts","line":3,"rule":"typescript:S1"}`;
const hotspot = (key) =>
  `{"key":"${key}","vulnerabilityProbability":"HIGH","securityCategory":"dos","message":"m","component":"K:src/b.ts","line":5,"ruleKey":"typescript:S2"}`;

/** Issues 2 件・Hotspots 1 件を返す正常スタブ。 */
const HEALTHY = `
if [[ "$*" == *"hotspots/search"* ]]; then
  printf '{"paging":{"total":1},"hotspots":[${hotspot('h1')}]}\\n200'
else
  printf '{"paging":{"total":2},"issues":[${issue('i1')},${issue('i2')}]}\\n200'
fi
`;

test('正常時は Issues と Hotspots を 1 本の配列へ統合する', () => {
  const res = runWithCurl(HEALTHY, { args: ['K'] });
  assert.equal(res.status, 0, `exit ${res.status}\nstderr: ${res.stderr}`);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.length, 3);
  assert.deepEqual(
    parsed.map((i) => i.source).sort(),
    ['sonarcloud', 'sonarcloud', 'sonarcloud-hotspot'],
  );
  // 件数はソースごとに stderr へ出る（0 件と取得失敗を読み手が区別できるように）。
  assert.match(res.stderr, /SonarCloud Issues: 2 件/);
  assert.match(res.stderr, /Security Hotspots: 1 件/);
});

test('通信断は無言で死なず、curl の終了コードと理由を stderr に残す', () => {
  // 実物の curl は `-s` 単体だとエラーメッセージまで抑止し、`-S`(--show-error) を
  // 併せて初めて出す。スタブが無条件に stderr へ書くと、`-s` のままでも
  // 「理由が出ている」ように見えてしまい、無言死の回帰を検知できない（fail-open）。
  const res = runWithCurl(
    `
case "$*" in
  *-sS*|*--show-error*) echo 'curl: (6) Could not resolve host: sonarcloud.io' >&2 ;;
esac
exit 6
`,
    { args: ['K'] },
  );
  // 「通信に失敗」「curl exit 6」はスクリプト自身が -S の有無に関係なく出す文字列なので、
  // それを選択肢に含めると -S を外す変異でも通ってしまう。スタブが -sS のときだけ出す
  // 文字列を単独で必須にする。
  assert.match(res.stderr, /Could not resolve host/, 'curl のエラー理由が捕捉されていない（-S 欠落）');
  assert.match(res.stderr, /curl exit 6/);
});

test('API のエラー本文を捨てず、HTTP ステータスと msg を出す', () => {
  const res = runWithCurl(
    `printf '{"errors":[{"msg":"Insufficient privileges"}]}\\n403'`,
    { args: ['K'] },
  );
  assert.match(res.stderr, /403/);
  assert.match(res.stderr, /Insufficient privileges/, 'API のエラー本文が捨てられている');
  // 生ボディへのフォールバックでも上の 2 つは通る（本文に同じ文字列が含まれるため）。
  // 構造化抽出そのものを固定するには、JSON 断片が出ていないことまで見る必要がある。
  assert.doesNotMatch(res.stderr, /\{"errors"/, 'errors[].msg を抽出せず生ボディを出している');
});

test('paging.total が整数でないとき、無限ループせず縮退する', () => {
  // total を算術評価へ素通しすると `(( ... ))` が構文エラーになり、|| で繋いだ
  // 停止条件が両方失われて外部 API を叩き続ける（実測 12 秒で 298 回）。
  const dir = mkdtempSync(path.join(tmpdir(), 'fetch-sonar-total-'));
  try {
    const log = path.join(dir, 'calls.txt');
    const curl = path.join(dir, 'curl');
    writeFileSync(
      curl,
      `#!/bin/bash\necho x >> ${log}\nprintf '{"paging":{"total":{"x":1}},"issues":[]}\\n200'\n`,
    );
    chmodSync(curl, 0o755);
    const res = spawnSync('bash', [SCRIPT, 'K'], {
      encoding: 'utf8',
      cwd: dir,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
      timeout: 20000,
    });
    assert.notEqual(res.signal, 'SIGTERM', 'タイムアウトした（無限ループの疑い）');
    const calls = spawnSync('cat', [log], { encoding: 'utf8' }).stdout.trim().split('\n').length;
    assert.ok(calls <= 4, `curl の呼び出しが ${calls} 回。ページを回し続けている`);
    assert.match(res.stderr, /paging.total が整数ではありません/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('本文が空の 200 は「0 件」で済ませず警告する', () => {
  // プロキシや LB が本文なしの 200 を返す状況。jq は何も出さず exit 0 で返るため、
  // null 判定だけだと素通りし、課題ゼロの健全なプロジェクトと区別がつかない。
  const res = runWithCurl(`printf '\\n200'`, { args: ['K'] });
  assert.match(res.stderr, /paging.total が整数ではありません/);
  assert.match(res.stderr, /取得できなかったソース/);
});

test('ページ途中の失敗でも、取得済みのページは捨てない', () => {
  const res = runWithCurl(
    `
if [[ "$*" == *"hotspots/search"* ]]; then
  printf '{"paging":{"total":0},"hotspots":[]}\\n200'
elif [[ "$*" == *"p=2"* ]]; then
  printf '{"errors":[{"msg":"boom"}]}\\n500'
else
  printf '{"paging":{"total":250},"issues":[${issue('i1')}]}\\n200'
fi
`,
    { args: ['K'] },
  );
  assert.equal(res.status, 0, `exit ${res.status}\nstderr: ${res.stderr}`);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.length, 1, '1 ページ目の成功分が捨てられている');
  // 部分取得は「取得不可」ではなく「一部しか取得できなかった」側に出る。
  assert.match(res.stderr, /一部しか取得できなかったソース: .*SonarCloud Issues/);
  // 「一部しか取得できなかったソース:」を部分一致で拾わないよう行頭で固定する。
  assert.doesNotMatch(res.stderr, /(^|\n)WARN: 取得できなかったソース:/);
});

test('Hotspots だけ失敗しても、収集済みの Issues は残る', () => {
  const res = runWithCurl(
    `
if [[ "$*" == *"hotspots/search"* ]]; then
  printf '{"errors":[{"msg":"boom"}]}\\n500'
else
  printf '{"paging":{"total":1},"issues":[${issue('i1')}]}\\n200'
fi
`,
    { args: ['K'] },
  );
  assert.equal(res.status, 0, `片方の失敗で全体を捨ててはならない\nstderr: ${res.stderr}`);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.filter((i) => i.source === 'sonarcloud').length, 1);
  assert.equal(parsed.filter((i) => i.source === 'sonarcloud-hotspot').length, 0);
  assert.match(res.stderr, /取得できなかったソース: .*Hotspots/);
});

test('全ソースが失敗したときは exit 1（成果ゼロを成功として返さない）', () => {
  const res = runWithCurl(`printf '{"errors":[{"msg":"boom"}]}\\n500'`, { args: ['K'] });
  assert.equal(res.status, 1, '1 件も集まっていないのに成功で返してはならない');
});

test('10,000 件の API 上限は専用メッセージで知らせる', () => {
  // total だけ巨大で、上限超えのページは API がエラーを返す状況。
  const res = runWithCurl(
    `
if [[ "$*" == *"hotspots/search"* ]]; then
  printf '{"paging":{"total":0},"hotspots":[]}\\n200'
else
  printf '{"paging":{"total":20000},"issues":[${issue('i1')}]}\\n200'
fi
`,
    { args: ['K'] },
  );
  assert.match(res.stderr, /10,?000/, '上限に触れたことが分かるメッセージが出ていない');
  // 上限に達しても取得自体は成功している。「取得不可」として報告すると、
  // レポートに「取れなかった」と誤記される。
  assert.match(res.stderr, /一部しか取得できなかったソース/);
  // 「一部しか取得できなかったソース:」を部分一致で拾わないよう行頭で固定する。
  assert.doesNotMatch(res.stderr, /(^|\n)WARN: 取得できなかったソース:/);
});

test('projectKey が見つからないときは理由を出して終わる（無言死しない）', () => {
  // properties はあるが projectKey 行が無い。grep が失敗しても、
  // pipefail + set -e で「project key not found」に到達する前に落ちてはならない。
  const dir = mkdtempSync(path.join(tmpdir(), 'fetch-sonar-nokey-'));
  try {
    writeFileSync(path.join(dir, 'sonar-project.properties'), 'sonar.organization=x\n');
    const curl = path.join(dir, 'curl');
    writeFileSync(curl, `#!/bin/bash\nprintf '{}\\n200'\n`);
    chmodSync(curl, 0o755);
    const res = spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      cwd: dir,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    });
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /project key/i, '用意されたエラーメッセージに到達していない');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SONAR_TOKEN は argv でなく --config（stdin）経由で渡す', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fetch-sonar-auth-'));
  try {
    const argvLog = path.join(dir, 'argv.txt');
    const stdinLog = path.join(dir, 'stdin.txt');
    const curl = path.join(dir, 'curl');
    writeFileSync(
      curl,
      `#!/bin/bash
echo "$*" >> ${argvLog}
case "$*" in *--config*) cat >> ${stdinLog} ;; esac
printf '{"paging":{"total":0},"issues":[],"hotspots":[]}\\n200'
`,
    );
    chmodSync(curl, 0o755);
    spawnSync('bash', [SCRIPT, 'K'], {
      encoding: 'utf8',
      cwd: dir,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, SONAR_TOKEN: 'tok123' },
    });
    const argv = spawnSync('cat', [argvLog], { encoding: 'utf8' }).stdout;
    const stdin = spawnSync('cat', [stdinLog], { encoding: 'utf8' }).stdout;
    assert.match(stdin, /user = "tok123:"/, 'SONAR_TOKEN が curl に渡っていない');
    // argv に載せると `ps` / /proc/<pid>/cmdline から平文で読める。
    assert.doesNotMatch(argv, /tok123/, 'トークンがコマンドライン引数に露出している');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
