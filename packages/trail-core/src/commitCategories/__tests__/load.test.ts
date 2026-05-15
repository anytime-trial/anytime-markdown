import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCommitCategories, loadCommitCategoryLabels } from '../load';
import { DEFAULT_COMMIT_CATEGORIES, DEFAULT_COMMIT_CATEGORY_LABELS } from '../defaults';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'trail-test-'));
}

function writeJson(dir: string, obj: unknown): void {
  fs.mkdirSync(path.join(dir, '.anytime'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.anytime', 'commit-categories.json'),
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

  it('category が負数・非整数・非数値のエントリを無視する', () => {
    const dir = makeTempDir();
    writeJson(dir, {
      categories: {},
      entries: {
        feat:    { category: 0, description: '' },
        bad_neg: { category: -1, description: '' },
        bad_flt: { category: 1.5, description: '' },
        bad_str: { category: 'x' as unknown as number, description: '' },
      },
    });
    const result = loadCommitCategories(dir);
    expect(result.get('feat')).toBe(0);
    expect(result.get('bad_neg')).toBeUndefined();
    expect(result.get('bad_flt')).toBeUndefined();
    expect(result.get('bad_str')).toBeUndefined();
    expect(result.size).toBe(1);
  });

  it('未知の大きな category 番号も保持する（カテゴリ数の動的拡張対応）', () => {
    const dir = makeTempDir();
    writeJson(dir, {
      categories: { '0': 'A', '9': 'Future' },
      entries: {
        feat:   { category: 0, description: '' },
        future: { category: 9, description: '' },
      },
    });
    const result = loadCommitCategories(dir);
    expect(result.get('feat')).toBe(0);
    expect(result.get('future')).toBe(9);
  });

  it('entries が存在しない場合はデフォルトを返す', () => {
    const dir = makeTempDir();
    writeJson(dir, { categories: {} });
    const result = loadCommitCategories(dir);
    expect(result).toBe(DEFAULT_COMMIT_CATEGORIES);
  });

  it('不正な JSON の場合はデフォルトを返す', () => {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, '.anytime'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.anytime', 'commit-categories.json'), 'INVALID{', 'utf-8');
    const result = loadCommitCategories(dir);
    expect(result).toBe(DEFAULT_COMMIT_CATEGORIES);
  });

  it('ENOENT 以外の I/O エラーは throw する', () => {
    // 存在するが読めないディレクトリ（パーミッション 000）の代用として、
    // workspace 自体ではなく workspace/.anytime/commit-categories.json をディレクトリにして
    // EISDIR を発生させる。
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, '.anytime', 'commit-categories.json'), { recursive: true });
    expect(() => loadCommitCategories(dir)).toThrow();
  });
});

describe('loadCommitCategoryLabels', () => {
  it('categories からラベルマップを読み込む', () => {
    const dir = makeTempDir();
    writeJson(dir, {
      categories: { '0': 'A', '1': 'B' },
      entries: {},
    });
    const result = loadCommitCategoryLabels(dir);
    expect(result.get(0)).toBe('A');
    expect(result.get(1)).toBe('B');
  });

  it('ファイル不在時はデフォルトラベルを返す', () => {
    const dir = makeTempDir();
    expect(loadCommitCategoryLabels(dir)).toBe(DEFAULT_COMMIT_CATEGORY_LABELS);
  });

  it('不正な JSON 時はデフォルトを返す', () => {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, '.anytime'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.anytime', 'commit-categories.json'), 'INVALID', 'utf-8');
    expect(loadCommitCategoryLabels(dir)).toBe(DEFAULT_COMMIT_CATEGORY_LABELS);
  });

  it('categories が空または非オブジェクトの場合はデフォルトを返す', () => {
    const dir = makeTempDir();
    writeJson(dir, { categories: null as unknown as Record<string, string>, entries: {} });
    expect(loadCommitCategoryLabels(dir)).toBe(DEFAULT_COMMIT_CATEGORY_LABELS);
  });

  it('数値以外のキーや空文字列の値を無視する', () => {
    const dir = makeTempDir();
    writeJson(dir, {
      categories: { '0': 'A', 'NaN': 'bad', '1': '' },
      entries: {},
    });
    const result = loadCommitCategoryLabels(dir);
    expect(result.get(0)).toBe('A');
    expect(result.get(1)).toBeUndefined(); // 空文字は除外
    expect(result.has(NaN as unknown as number)).toBe(false);
  });

  it('全て無効な場合はデフォルトを返す', () => {
    const dir = makeTempDir();
    writeJson(dir, {
      categories: { 'NaN': '' },
      entries: {},
    });
    expect(loadCommitCategoryLabels(dir)).toBe(DEFAULT_COMMIT_CATEGORY_LABELS);
  });
});
