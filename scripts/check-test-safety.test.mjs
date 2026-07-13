import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-test-safety.sh');

// 保護領域リテラルは分割構築する。このテスト自身が検査対象パターンを含むと、
// リポジトリを --all で走査したときに自己検出されるため。
const HOMEDIR_CALL = 'os.' + 'homedir()';
const NEW_TRAIL_DB = 'new ' + 'TrailDatabase';
const TMPDIR_CALL = 'os.' + 'tmpdir()';
const MKDTEMP_CALL = 'fs.' + 'mkdtempSync()';

// マーカー例外が許されるファイル（スクリプト側 MARKER_ALLOWED_FILES と同じパス）。
const ALLOWED_FILE = 'packages/trail-db/src/__tests__/TrailDatabase.guard.test.ts';

/** 一時 git リポジトリを作り、fixture を index に登録して返す。 */
function createRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-test-safety-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  execFileSync('git', ['add', '.'], { cwd: root });
  return root;
}

function run(root, args) {
  const r = spawnSync('bash', [SCRIPT, ...args], { cwd: root, encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}

test('--all は staged が空でも追跡下の全テストファイルを検査して違反を検出する', () => {
  const root = createRepo({
    'src/__tests__/danger.test.ts': `const db = ${NEW_TRAIL_DB}('/tmp/x');\n`,
  });
  // index に入れた直後に commit することで staged を空にする(--no-verify で
  // pre-commit を迂回したコミットが既にツリーへ入っている状況の再現)。
  execFileSync('git', ['-c', 'user.email=t@e', '-c', 'user.name=t', 'commit', '-qm', 'x'], {
    cwd: root,
  });

  assert.equal(run(root, ['--staged']).status, 0, 'staged が空なら --staged は素通りする');

  const all = run(root, ['--all']);
  assert.equal(all.status, 1);
  assert.match(all.out, /danger\.test\.ts/);
  rmSync(root, { recursive: true, force: true });
});

test('コメント行での言及は違反としない', () => {
  const root = createRepo({
    'src/__tests__/comment.test.ts': `// ${HOMEDIR_CALL} が返す値をテストごとに差し替える。\nconst x = 1;\n`,
  });
  assert.equal(run(root, ['--all']).status, 0);
  rmSync(root, { recursive: true, force: true });
});

test('マーカーのない保護領域リテラルは違反として検出する', () => {
  const root = createRepo({
    'src/__tests__/leak.test.ts': `const p = ${HOMEDIR_CALL};\n`,
  });
  const r = run(root, ['--all']);
  assert.equal(r.status, 1);
  assert.match(r.out, /leak\.test\.ts/);
  rmSync(root, { recursive: true, force: true });
});

test('引数なしは --staged 互換で、ステージ済みの違反を検出する', () => {
  const root = createRepo({
    'src/__tests__/staged.test.ts': `const db = ${NEW_TRAIL_DB}('/tmp/x');\n`,
  });
  const r = run(root, []);
  assert.equal(r.status, 1);
  assert.match(r.out, /staged\.test\.ts/);
  rmSync(root, { recursive: true, force: true });
});

test('未知の引数は usage エラーで終了する', () => {
  const root = createRepo({ 'src/__tests__/ok.test.ts': 'const x = 1;\n' });
  const r = run(root, ['--everything']);
  assert.equal(r.status, 64);
  assert.match(r.out, /usage/);
  rmSync(root, { recursive: true, force: true });
});

// --- 例外機構が「穴」になっていないこと（マージ前レビュー指摘の回帰テスト） ---

test('理由のない裸の test-safety-allow は例外として認めない', () => {
  const root = createRepo({
    [ALLOWED_FILE]: `const p = ${HOMEDIR_CALL}; // test-safety-allow\n`,
  });
  const r = run(root, ['--all']);
  assert.equal(r.status, 1);
  rmSync(root, { recursive: true, force: true });
});

test('allowlist 外のファイルではマーカーが効かない', () => {
  const root = createRepo({
    'src/__tests__/sneaky.test.ts':
      `const p = ${HOMEDIR_CALL}; // test-safety-allow: 通したいだけ\n`,
  });
  const r = run(root, ['--all']);
  assert.equal(r.status, 1);
  assert.match(r.out, /sneaky\.test\.ts/);
  rmSync(root, { recursive: true, force: true });
});

test('allowlist のファイルでは理由つきマーカーが効く', () => {
  const root = createRepo({
    [ALLOWED_FILE]: `const p = ${HOMEDIR_CALL}; // test-safety-allow: ガードの検証に要る\n`,
  });
  assert.equal(run(root, ['--all']).status, 0);
  rmSync(root, { recursive: true, force: true });
});

// --- コメント除外が実コードを取りこぼさないこと ---

test('* で始まる継続行の実コードも検査する', () => {
  const root = createRepo({
    'src/__tests__/star.test.ts': `const n = base\n  * (${HOMEDIR_CALL} ? 1 : 0);\n`,
  });
  const r = run(root, ['--all']);
  assert.equal(r.status, 1);
  assert.match(r.out, /star\.test\.ts/);
  rmSync(root, { recursive: true, force: true });
});

test('ブロックコメントで始まる行の、コメント後ろの実コードも検査する', () => {
  const root = createRepo({
    'src/__tests__/inline.test.ts': `/* eslint-disable */ const p = ${HOMEDIR_CALL};\n`,
  });
  const r = run(root, ['--all']);
  assert.equal(r.status, 1);
  assert.match(r.out, /inline\.test\.ts/);
  rmSync(root, { recursive: true, force: true });
});

test('複数行ブロックコメントの中身は検査しない', () => {
  const root = createRepo({
    'src/__tests__/block.test.ts': `/*\n  const p = ${HOMEDIR_CALL};\n*/\nconst x = 1;\n`,
  });
  assert.equal(run(root, ['--all']).status, 0);
  rmSync(root, { recursive: true, force: true });
});

test('文字列中の // はコメント開始として扱わない', () => {
  const root = createRepo({
    'src/__tests__/url.test.ts': `const u = 'http://x'; const p = ${HOMEDIR_CALL};\n`,
  });
  const r = run(root, ['--all']);
  assert.equal(r.status, 1);
  rmSync(root, { recursive: true, force: true });
});

test('正規表現リテラル中のエスケープされたスラッシュで行が切れない', () => {
  const root = createRepo({
    'src/__tests__/regex.test.ts': `const r = s.replace(/\\//g, '_'); const p = ${HOMEDIR_CALL};\n`,
  });
  const r = run(root, ['--all']);
  assert.equal(r.status, 1);
  assert.match(r.out, /regex\.test\.ts/);
  rmSync(root, { recursive: true, force: true });
});

test('リポジトリルート以外から実行しても allowlist が効く', () => {
  const root = createRepo({
    [ALLOWED_FILE]: `const p = ${HOMEDIR_CALL}; // test-safety-allow: ガードの検証に要る\n`,
  });
  const r = spawnSync('bash', [SCRIPT, '--all'], {
    cwd: join(root, 'packages/trail-db'),
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  rmSync(root, { recursive: true, force: true });
});

// --- writeFileSync の許可条件（tmpdir 利用）はコメントでは満たせないこと ---

test('コメントで os.tmpdir / mkdtempSync に言及しただけでは writeFileSync を許可しない', () => {
  const root = createRepo({
    'src/__tests__/fake-tmp.test.ts': [
      `// 通常は ${TMPDIR_CALL} + ${MKDTEMP_CALL} を使うが、このテストは意図的に外す。`,
      "fs.writeFileSync(process.env.HOME + '/x', 'evil');",
      '',
    ].join('\n'),
  });
  const r = run(root, ['--all']);
  assert.equal(r.status, 1);
  assert.match(r.out, /fake-tmp\.test\.ts/);
  rmSync(root, { recursive: true, force: true });
});

test('実際に tmpdir + mkdtempSync を使う writeFileSync は許可する', () => {
  const root = createRepo({
    'src/__tests__/real-tmp.test.ts': [
      `const dir = fs.mkdtempSync(${TMPDIR_CALL});`,
      "fs.writeFileSync(dir + '/x', 'ok');",
      '',
    ].join('\n'),
  });
  assert.equal(run(root, ['--all']).status, 0);
  rmSync(root, { recursive: true, force: true });
});

test('空白を含むファイル名も検査対象になる', () => {
  const root = createRepo({
    'src/__tests__/with space.test.ts': `const p = ${HOMEDIR_CALL};\n`,
  });
  const r = run(root, ['--all']);
  assert.equal(r.status, 1);
  assert.match(r.out, /with space\.test\.ts/);
  rmSync(root, { recursive: true, force: true });
});
