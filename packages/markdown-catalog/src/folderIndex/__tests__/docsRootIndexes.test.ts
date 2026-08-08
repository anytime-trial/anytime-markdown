/**
 * docsRoot 一括再生成と ingest→索引オーケストレーションのテスト（要件書 FR-3・AC-6）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateDocsRootIndexes, ingestThenIndex } from '../docsRootIndexes';

function makeDoc(dir: string, name: string, title: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), `---\ntitle: "${title}"\n---\n\n# ${title}\n`, 'utf8');
}

describe('generateDocsRootIndexes', () => {
  let docsRoot: string;

  beforeEach(() => {
    docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-root-'));
    makeDoc(path.join(docsRoot, 'spec'), 'a.ja.md', '設計 A');
    makeDoc(path.join(docsRoot, 'tech'), 'b.ja.md', '技術 B');
    // proposal / review / report は無い状態にする（存在フォルダだけ対象になること）
  });

  afterEach(() => {
    fs.rmSync(docsRoot, { recursive: true, force: true });
  });

  it('存在する type フォルダだけ索引を生成する', () => {
    const result = generateDocsRootIndexes({ docsRoot });

    expect(result.written).toBe(2);
    expect(fs.existsSync(path.join(docsRoot, 'spec', 'index.ja.md'))).toBe(true);
    expect(fs.existsSync(path.join(docsRoot, 'tech', 'index.ja.md'))).toBe(true);
    // docsRoot 直下には索引を作らない（対象は type フォルダ配下のみ）
    expect(fs.existsSync(path.join(docsRoot, 'index.ja.md'))).toBe(false);
  });

  it('スコープごとのタイトル表示名を使う', () => {
    generateDocsRootIndexes({ docsRoot });

    const spec = fs.readFileSync(path.join(docsRoot, 'spec', 'index.ja.md'), 'utf8');
    const tech = fs.readFileSync(path.join(docsRoot, 'tech', 'index.ja.md'), 'utf8');
    expect(spec).toContain('# 設計書 索引（自動生成）');
    expect(tech).toContain('# 技術ドキュメント 索引（自動生成）');
  });

  it('docsRoot が存在しなければ例外を投げる', () => {
    expect(() => generateDocsRootIndexes({ docsRoot: path.join(docsRoot, 'missing') })).toThrow(
      /docsRoot not found/,
    );
  });
});

describe('ingestThenIndex', () => {
  let docsRoot: string;

  beforeEach(() => {
    docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-then-'));
    makeDoc(path.join(docsRoot, 'spec'), 'a.ja.md', '設計 A');
  });

  afterEach(() => {
    fs.rmSync(docsRoot, { recursive: true, force: true });
  });

  // AC-6: 走査失敗時に索引再生成が行われない
  it('ingest が失敗したら索引を生成しない', async () => {
    await expect(
      ingestThenIndex({
        runIngest: () => Promise.reject(new Error('scan failed')),
        docsRoot,
      }),
    ).rejects.toThrow('scan failed');

    expect(fs.existsSync(path.join(docsRoot, 'spec', 'index.ja.md'))).toBe(false);
  });

  it('ingest 成功後に索引を生成し結果を併記する', async () => {
    const result = await ingestThenIndex({
      runIngest: () => Promise.resolve({ docs: 1 }),
      docsRoot,
    });

    expect(result.ingest).toEqual({ docs: 1 });
    expect(result.docIndexes?.written).toBe(1);
    expect(result.docIndexesError).toBeUndefined();
    expect(fs.existsSync(path.join(docsRoot, 'spec', 'index.ja.md'))).toBe(true);
  });

  // FR-3: 索引再生成の失敗は ingest の成功を取り消さない
  it('索引再生成が失敗しても ingest の結果は返す', async () => {
    const missingRoot = path.join(docsRoot, 'missing');
    const result = await ingestThenIndex({
      runIngest: () => Promise.resolve({ docs: 2 }),
      docsRoot: missingRoot,
    });

    expect(result.ingest).toEqual({ docs: 2 });
    expect(result.docIndexes).toBeUndefined();
    expect(result.docIndexesError).toMatch(/docsRoot not found/);
  });
});
