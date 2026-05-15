import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_IGNORE_FILE_CONTENT } from './defaultIgnoreContent';

export function seedDeadCodeIgnore(workspaceRoot: string): boolean {
  const dir = path.join(workspaceRoot, '.trail');
  const file = path.join(dir, 'dead-code-ignore');
  fs.mkdirSync(dir, { recursive: true });
  try {
    // wx フラグで排他作成（既存ファイルがあれば EEXIST で失敗）。
    // TOCTOU 競合を避けるため existsSync チェックの代わりに使用。
    fs.writeFileSync(file, DEFAULT_IGNORE_FILE_CONTENT, { encoding: 'utf-8', flag: 'wx' });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  }
}
