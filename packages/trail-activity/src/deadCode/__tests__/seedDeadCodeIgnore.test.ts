import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { seedDeadCodeIgnore } from '../seedDeadCodeIgnore';
import { DEFAULT_IGNORE_FILE_CONTENT } from '../defaultIgnoreContent';

describe('seedDeadCodeIgnore', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('ファイル不在ならデフォルト内容を書き出し true を返す', () => {
    const created = seedDeadCodeIgnore(tmpDir);
    expect(created).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.anytime/dead-code-ignore'), 'utf-8');
    expect(content).toBe(DEFAULT_IGNORE_FILE_CONTENT);
  });

  it('ファイル存在時は何もせず false を返す', () => {
    fs.mkdirSync(path.join(tmpDir, '.anytime'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.anytime/dead-code-ignore'), 'custom');
    const created = seedDeadCodeIgnore(tmpDir);
    expect(created).toBe(false);
    const content = fs.readFileSync(path.join(tmpDir, '.anytime/dead-code-ignore'), 'utf-8');
    expect(content).toBe('custom');
  });
});
