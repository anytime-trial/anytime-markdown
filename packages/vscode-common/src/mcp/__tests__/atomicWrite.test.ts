import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { writeFileAtomic } from '../atomicWrite';

// node:fs の renameSync は non-configurable で jest.spyOn できないため、
// モジュールモックで rename 失敗を注入する（他の関数は実体へパススルー）。
let mockRenameThrow = false;
jest.mock('node:fs', () => {
  const actual: typeof import('node:fs') = jest.requireActual('node:fs');
  return {
    ...actual,
    renameSync: (oldPath: fs.PathLike, newPath: fs.PathLike): void => {
      if (mockRenameThrow) {
        throw new Error('EXDEV: cross-device link');
      }
      actual.renameSync(oldPath, newPath);
    },
  };
});

describe('writeFileAtomic', () => {
  let dir: string;

  beforeEach(() => {
    mockRenameThrow = false;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('成功時: 対象ファイルへ書き込み true を返す（tmp は残らない）', () => {
    const target = path.join(dir, 'a.json');
    const ok = writeFileAtomic(target, '{"x":1}\n', () => {});
    expect(ok).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('{"x":1}\n');
    expect(fs.readdirSync(dir)).toEqual(['a.json']);
  });

  test('rename 失敗時: false を返し tmp ファイルを残さない（残骸のリグレッション）', () => {
    const target = path.join(dir, 'a.json');
    const warns: string[] = [];
    mockRenameThrow = true;
    const ok = writeFileAtomic(target, '{"x":1}\n', (m) => warns.push(m));
    expect(ok).toBe(false);
    // 対象は生成されず、tmp 残骸も掃除されている
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(warns.some((m) => m.includes('atomic write failed'))).toBe(true);
  });

  test('write 失敗時: false を返しエラー内容を warn へ渡す', () => {
    const target = path.join(dir, 'nodir', 'a.json'); // 親ディレクトリ不在で write が失敗
    const warns: string[] = [];
    const ok = writeFileAtomic(target, 'x', (m) => warns.push(m));
    expect(ok).toBe(false);
    expect(warns.length).toBeGreaterThan(0);
  });
});
