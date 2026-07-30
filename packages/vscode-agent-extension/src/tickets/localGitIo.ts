import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import type { LocalGitIo } from '@anytime-markdown/tickets-core';

const run = promisify(execFile);

/**
 * `LocalGitIo` の Node 実装。
 *
 * tickets-core 側が `node:fs` / `node:child_process` を直接 import しないのは、
 * 同パッケージが web-app（ブラウザ）からも読み込まれるためである。Node 専用の
 * 実体はこの拡張ホスト側だけに置く。
 */
export function createLocalGitIo(repoRoot: string): LocalGitIo {
  const git = async (args: string[]): Promise<string> => {
    // execFile は引数を配列で渡すためシェルを経由しない（パスに空白等があっても安全）。
    const { stdout } = await run('git', args, { cwd: repoRoot });
    return stdout;
  };

  return {
    async listFiles(dir: string): Promise<string[]> {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        return entries.filter((e) => e.isFile()).map((e) => e.name);
      } catch (error) {
        // ディレクトリ未作成（アーカイブがまだ無い等）は「0 件」として扱う。
        // それ以外の失敗は握り潰さず投げる。
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    },

    readFile: (path) => readFile(path, 'utf8'),

    async writeFile(path, text) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text, 'utf8');
    },

    deleteFile: (path) => rm(path, { force: true }),

    async rename(from, to) {
      await mkdir(dirname(to), { recursive: true });
      await rename(from, to);
    },

    /**
     * 内容から不透明な版数トークンを作る。
     *
     * Why not: mtime やファイルサイズを使わない。同一内容の再保存や、同じ長さの
     * 別内容を取り違える。楽観ロックの目的は「読んだ後に中身が変わっていないか」の
     * 判定なので、内容そのもののハッシュが素直。
     */
    hash: (text) => createHash('sha256').update(text, 'utf8').digest('hex'),

    git,
  };
}
