/**
 * GraphDetector の追加テスト — 未カバー分岐を補完する。
 *
 * 既存テスト (GraphDetector.test.ts) でカバーされていない分岐:
 * - detectFilesByName() (line 49)
 * - Ignore インスタンスを直接渡すコンストラクタパス (line 36)
 * - readdirSync エラー時の空配列フォールバック (line 58)
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import ignore from 'ignore';
import { GraphDetector } from '../GraphDetector';

describe('GraphDetector — 追加テスト', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-detector-add-'));
    // 基本ファイル構造を作る
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), '');
    fs.writeFileSync(path.join(tmpDir, 'src', 'App.tsx'), '');
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
  });

  afterEach(() => fs.rmSync(tmpDir, { recursive: true }));

  // -----------------------------------------------------------------------
  // detectFilesByName()
  // -----------------------------------------------------------------------

  it('detectFilesByName() は指定したファイル名のみ返す', () => {
    const detector = new GraphDetector(tmpDir);
    const files = detector.detectFilesByName('tsconfig.json');
    expect(files.map((f) => path.basename(f))).toContain('tsconfig.json');
    // package.json は含まれない
    expect(files.every((f) => path.basename(f) === 'tsconfig.json')).toBe(true);
  });

  it('detectFilesByName() で存在しないファイル名を指定すると空配列', () => {
    const detector = new GraphDetector(tmpDir);
    const files = detector.detectFilesByName('nonexistent.xyz');
    expect(files).toHaveLength(0);
  });

  it('detectFilesByName() はネストしたディレクトリも検索する', () => {
    fs.mkdirSync(path.join(tmpDir, 'nested', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'nested', 'deep', 'tsconfig.json'), '{}');
    const detector = new GraphDetector(tmpDir);
    const files = detector.detectFilesByName('tsconfig.json');
    // root + nested/deep の 2 つが見つかる
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  // -----------------------------------------------------------------------
  // Ignore インスタンスを直接渡すコンストラクタパス
  // -----------------------------------------------------------------------

  it('extraExcludePatterns に Ignore インスタンスを渡すと機能する', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.claude', 'settings.md'), '');

    const ig = ignore();
    ig.add('.claude/');

    const detector = new GraphDetector(tmpDir, ig);
    const docFiles = detector.detectDocFiles();
    // .claude 内のファイルが除外される
    expect(docFiles.every((f) => !f.includes('.claude'))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // readdirSync エラー時の空配列フォールバック
  // -----------------------------------------------------------------------

  it('存在しないディレクトリを指定しても空配列を返す', () => {
    const detector = new GraphDetector('/path/that/does/not/exist/at/all');
    const files = detector.detectCodeFiles();
    expect(files).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // 空文字パターンのフィルタ（GraphDetector コンストラクタ内 filter(p => p !== '')）
  // -----------------------------------------------------------------------

  it('空文字を含むパターン配列でも正常に動作する', () => {
    const detector = new GraphDetector(tmpDir, ['', '  ', '.claude']);
    // 空配列 / 空白のみのパターンが混入してもクラッシュしない
    const files = detector.detectCodeFiles();
    expect(Array.isArray(files)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // DEFAULT_EXCLUDE_DIRS の動作確認（追加で__tests__ などが除外されることを確認）
  // -----------------------------------------------------------------------

  it('__tests__ ディレクトリは除外される', () => {
    fs.mkdirSync(path.join(tmpDir, '__tests__'));
    fs.writeFileSync(path.join(tmpDir, '__tests__', 'foo.test.ts'), '');
    const detector = new GraphDetector(tmpDir);
    const files = detector.detectCodeFiles();
    expect(files.every((f) => !f.includes('__tests__'))).toBe(true);
  });

  it('.worktrees ディレクトリは除外される', () => {
    fs.mkdirSync(path.join(tmpDir, '.worktrees', 'branch-a', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.worktrees', 'branch-a', 'src', 'foo.ts'), '');
    const detector = new GraphDetector(tmpDir);
    const files = detector.detectCodeFiles();
    expect(files.every((f) => !f.includes('.worktrees'))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // ファイルレベルの userIgnore.ignores(relPath) が true になるケース (line 69)
  // -----------------------------------------------------------------------

  it('ファイルパスが userIgnore にマッチするとき個別ファイルが除外される', () => {
    // src/secret.ts だけを除外するパターン
    const detector = new GraphDetector(tmpDir, ['src/secret.ts']);
    fs.writeFileSync(path.join(tmpDir, 'src', 'secret.ts'), '');

    const files = detector.detectCodeFiles();
    // secret.ts は除外される
    expect(files.every((f) => !f.endsWith('secret.ts'))).toBe(true);
    // index.ts / App.tsx は残る
    expect(files.some((f) => f.endsWith('index.ts'))).toBe(true);
  });

  it('Ignore インスタンスでファイルを除外する場合も機能する', () => {
    const ig = ignore();
    ig.add('src/App.tsx');
    const detector = new GraphDetector(tmpDir, ig);
    const files = detector.detectCodeFiles();
    expect(files.every((f) => !f.endsWith('App.tsx'))).toBe(true);
    // index.ts は残る
    expect(files.some((f) => f.endsWith('index.ts'))).toBe(true);
  });
});
