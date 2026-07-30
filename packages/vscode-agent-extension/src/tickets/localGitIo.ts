import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import type { LocalGitIo } from '@anytime-markdown/tickets-core';

const run = promisify(execFile);

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `LocalGitIo` の Node 実装。
 *
 * tickets-core 側が `node:fs` / `node:child_process` を直接 import しないのは、
 * 同パッケージが web-app（ブラウザ）からも読み込まれるためである。Node 専用の
 * 実体はこの拡張ホスト側だけに置く。
 */
export function createLocalGitIo(repoRoot: string): LocalGitIo {
  const git = async (args: string[]): Promise<string> => {
    try {
      // execFile は引数を配列で渡すためシェルを経由しない（パスに空白等があっても安全）。
      const { stdout } = await run('git', args, { cwd: repoRoot });
      return stdout;
    } catch (error) {
      // 呼び出し側は失敗の種類（非 fast-forward か push 先が無いか等）を stderr の文言で
      // 判別する。promisify(execFile) の例外はプラットフォームによって message へ
      // stderr を含めないことがあるため、明示的に連結して情報を落とさない。
      const stderr = (error as { stderr?: string }).stderr ?? '';
      throw new Error(`git ${args.join(' ')} が失敗しました: ${describe(error)} ${stderr}`.trim());
    }
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

    async exists(path) {
      try {
        await access(path);
        return true;
      } catch (error) {
        // 存在しない場合のみ false。権限不足等は呼び出し側が読み取り時に検出できるよう
        // 「存在する」に倒す（存在しない扱いにすると、実体があるのに削除されたと誤判定する）。
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return false;
        }
        return true;
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
