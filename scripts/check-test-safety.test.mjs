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

test('test-safety-allow マーカーのある行は違反としない', () => {
  const root = createRepo({
    'src/__tests__/guard.test.ts':
      `const p = ${HOMEDIR_CALL}; // test-safety-allow: ガード自体の検証に保護パスが要る\n`,
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
