import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { createLocalGitIo } from '../localGitIo';

/**
 * `LocalGitIo` は実際の fs と git 副作用を持つ唯一の層で、疑似 IO によるプロバイダの
 * テストでは一切通らない。ここだけは一時ディレクトリ上の実ファイル・実 git で検証する。
 *
 * 書き込み先は `os.tmpdir()` 配下に限る（ユーザー永続データ領域には触れない）。
 */
describe('createLocalGitIo', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'localgitio-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('listFiles', () => {
    it('ディレクトリが無ければ空配列（アーカイブ未作成でも一覧が落ちない）', async () => {
      const io = createLocalGitIo(root);
      await expect(io.listFiles(path.join(root, '.tickets', 'archive'))).resolves.toEqual([]);
    });

    it('ファイルのみを返し、サブディレクトリは含めない', async () => {
      const dir = path.join(root, '.tickets');
      await mkdir(path.join(dir, 'archive'), { recursive: true });
      await writeFile(path.join(dir, 'T-1-a.md'), 'x');

      await expect(createLocalGitIo(root).listFiles(dir)).resolves.toEqual(['T-1-a.md']);
    });

    it('ENOENT 以外の失敗は握り潰さず投げる（silent catch 禁止の担保）', async () => {
      // ディレクトリではなくファイルを指すと ENOTDIR になる。空配列へ倒すと
      // 「チケットが 0 件」と区別できなくなるため、必ず例外にする。
      const file = path.join(root, 'notadir');
      await writeFile(file, 'x');

      await expect(createLocalGitIo(root).listFiles(file)).rejects.toThrow();
    });
  });

  describe('exists', () => {
    it('存在すれば true / しなければ false', async () => {
      const io = createLocalGitIo(root);
      const file = path.join(root, 'a.md');
      await expect(io.exists(file)).resolves.toBe(false);
      await writeFile(file, 'x');
      await expect(io.exists(file)).resolves.toBe(true);
    });
  });

  describe('writeFile / rename', () => {
    it('親ディレクトリが無ければ作る（初回の .tickets 作成で落ちない）', async () => {
      const io = createLocalGitIo(root);
      const file = path.join(root, '.tickets', 'T-1-a.md');

      await io.writeFile(file, 'body');

      await expect(readFile(file, 'utf8')).resolves.toBe('body');
    });

    it('rename も移動先の親を作る（archive が未作成でもアーカイブできる）', async () => {
      const io = createLocalGitIo(root);
      const from = path.join(root, '.tickets', 'T-1-a.md');
      const to = path.join(root, '.tickets', 'archive', 'T-1-a.md');
      await io.writeFile(from, 'body');

      await io.rename(from, to);

      await expect(readFile(to, 'utf8')).resolves.toBe('body');
      await expect(io.exists(from)).resolves.toBe(false);
    });
  });

  describe('hash', () => {
    it('内容が変われば変わり、同じ内容なら一致する（楽観ロックの版数）', () => {
      const io = createLocalGitIo(root);
      expect(io.hash('a')).toBe(io.hash('a'));
      expect(io.hash('a')).not.toBe(io.hash('b'));
    });
  });

  describe('git', () => {
    it('repoRoot を cwd として実行する', async () => {
      execFileSync('git', ['init', '-q', '.'], { cwd: root });

      const out = await createLocalGitIo(root).git(['rev-parse', '--show-toplevel']);

      // macOS の /var → /private/var のような symlink 差を避けるため basename で比較する。
      expect(path.basename(out.trim())).toBe(path.basename(root));
    });

    it('失敗時は stderr を含めて投げる（呼び出し側が失敗の種類を判別できる）', async () => {
      execFileSync('git', ['init', '-q', '.'], { cwd: root });

      // push 先が無いことを示す文言が、そのまま呼び出し側の分類に使われる。
      await expect(createLocalGitIo(root).git(['push'])).rejects.toThrow(/push destination|upstream/i);
    });
  });
});
