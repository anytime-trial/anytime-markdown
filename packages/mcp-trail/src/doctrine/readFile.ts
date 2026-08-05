import * as fs from 'node:fs';

import type { FileRead } from './oddRoots';

/**
 * ODD レジストリ用の読取。**不在と読取失敗を区別する。**
 * 両者をまとめると、権限エラーで読めなかったレジストリが「未導入」として
 * 既定へ縮退し、保護を消す方向へ倒れる。
 */
export function readFileTyped(target: string): FileRead {
  try {
    return { kind: 'ok', content: fs.readFileSync(target, 'utf8') };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return { kind: 'missing' };
    }
    return { kind: 'error', reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 引用解決用の読取。こちらは不在も読取失敗も「解決できなかった」で等価なので
 * `null` にまとめてよい（呼び出し側が file_not_found として記録する）。
 */
export function readTextFileOrNull(target: string): string | null {
  try {
    return fs.readFileSync(target, 'utf8');
  } catch {
    return null;
  }
}
