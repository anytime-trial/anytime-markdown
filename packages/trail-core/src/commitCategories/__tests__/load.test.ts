import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCommitCategories } from '../load';
import { DEFAULT_COMMIT_CATEGORIES } from '../defaults';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'trail-test-'));
}

function writeJson(dir: string, obj: unknown): void {
  fs.mkdirSync(path.join(dir, '.trail'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.trail', 'commit-categories.json'),
    JSON.stringify(obj),
    'utf-8',
  );
}

describe('loadCommitCategories', () => {
  it('ファイル不在時はデフォルトを返す', () => {
    const dir = makeTempDir();
    const result = loadCommitCategories(dir);
    expect(result).toBe(DEFAULT_COMMIT_CATEGORIES);
  });

  it('entries からカテゴリ番号を読み込む', () => {
    const dir = makeTempDir();
    writeJson(dir, {
      categories: { '0': '計画的開発', '1': '事後対応', '2': 'その他' },
      entries: {
        feat:  { category: 0, description: '新機能' },
        fix:   { category: 1, description: 'バグ修正' },
        plan:  { category: 2, description: '計画' },
      },
    });
    const result = loadCommitCategories(dir);
    expect(result.get('feat')).toBe(0);
    expect(result.get('fix')).toBe(1);
    expect(result.get('plan')).toBe(2);
  });

  it('category が 0/1/2 以外のエントリを無視する', () => {
    const dir = makeTempDir();
    writeJson(dir, {
      categories: {},
      entries: {
        feat: { category: 0, description: '' },
        bad:  { category: 9, description: '' },
      },
    });
    const result = loadCommitCategories(dir);
    expect(result.get('bad')).toBeUndefined();
    expect(result.size).toBe(1);
  });

  it('entries が存在しない場合はデフォルトを返す', () => {
    const dir = makeTempDir();
    writeJson(dir, { categories: {} });
    const result = loadCommitCategories(dir);
    expect(result).toBe(DEFAULT_COMMIT_CATEGORIES);
  });

  it('不正な JSON の場合はデフォルトを返す', () => {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, '.trail'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.trail', 'commit-categories.json'), 'INVALID{', 'utf-8');
    const result = loadCommitCategories(dir);
    expect(result).toBe(DEFAULT_COMMIT_CATEGORIES);
  });
});
