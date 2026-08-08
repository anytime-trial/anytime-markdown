import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSkillCategoriesFromFile } from '../load';
import { DEFAULT_SKILL_CATEGORIES } from '../defaults';

function writeTmp(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-cat-'));
  const file = path.join(dir, 'skill-categories.json');
  fs.writeFileSync(file, content, 'utf-8');
  return file;
}

describe('loadSkillCategoriesFromFile', () => {
  it('正常な entries をパースする', () => {
    const file = writeTmp(
      JSON.stringify({ categories: {}, entries: { foo: { category: 2, description: 'x' } } }),
    );
    const map = loadSkillCategoriesFromFile(file);
    expect(map.get('foo')).toBe(2);
  });

  it('entry が null でも TypeError にならずスキップする (conf05 回帰)', () => {
    const file = writeTmp(
      JSON.stringify({ categories: {}, entries: { good: { category: 1, description: 'x' }, bad: null } }),
    );
    expect(() => loadSkillCategoriesFromFile(file)).not.toThrow();
    const map = loadSkillCategoriesFromFile(file);
    expect(map.get('good')).toBe(1);
    expect(map.has('bad')).toBe(false);
  });

  it('ファイル不在 (ENOENT) はデフォルトを返す', () => {
    const map = loadSkillCategoriesFromFile(path.join(os.tmpdir(), 'no-such-skill-categories.json'));
    expect(map).toBe(DEFAULT_SKILL_CATEGORIES);
  });

  it('不正 JSON はデフォルトを返す', () => {
    const file = writeTmp('{ not json');
    expect(loadSkillCategoriesFromFile(file)).toBe(DEFAULT_SKILL_CATEGORIES);
  });

  it('ENOENT 以外の FS エラー (ディレクトリを渡す) は throw する (conf06 回帰)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-cat-dir-'));
    // ディレクトリを readFileSync すると EISDIR。握りつぶさず throw されること。
    expect(() => loadSkillCategoriesFromFile(dir)).toThrow();
  });
});
