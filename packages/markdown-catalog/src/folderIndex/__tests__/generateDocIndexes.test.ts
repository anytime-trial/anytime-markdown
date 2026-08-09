/**
 * 索引生成の冪等性テスト（要件書 AC-1〜AC-3）。
 *
 * 冪等化は 2 方向に壊れる。書き込みすぎ（毎回全索引が差分になる）と、
 * 書き込まなすぎ（内容が変わったのに索引が古いまま固まる）である。
 * 後者は「差分が出ない」ため成功に見えてしまうので、両方向を検査する。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateDocIndexes, isSameIgnoringDate } from '../generateDocIndexes';

function makeDoc(dir: string, name: string, frontmatter: Record<string, string>): void {
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: "${v}"`)
    .join('\n');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), `---\n${fm}\n---\n\n# ${frontmatter.title}\n`, 'utf8');
}

describe('generateDocIndexes', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-index-'));
    makeDoc(root, 'alpha.ja.md', { title: 'アルファ', category: 'spec', excerpt: '説明 A' });
    makeDoc(path.join(root, 'sub'), 'beta.ja.md', { title: 'ベータ', excerpt: '説明 B' });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('初回は全フォルダへ書き込む', () => {
    const result = generateDocIndexes({ docDir: root, date: '2026-07-20' });

    expect(result.written).toBe(2); // root と sub
    expect(result.unchanged).toBe(0);
    expect(fs.existsSync(path.join(root, 'index.ja.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'sub', 'index.ja.md'))).toBe(true);
  });

  // AC-1: 内容不変の状態で 2 回連続実行しても、2 回目で 1 件も書き込まれない
  it('内容が変わらなければ 2 回目は 1 件も書き込まない', () => {
    generateDocIndexes({ docDir: root, date: '2026-07-20' });
    const second = generateDocIndexes({ docDir: root, date: '2026-07-20' });

    expect(second.written).toBe(0);
    expect(second.unchanged).toBe(2);
  });

  // AC-2: 日付をまたいでも、内容不変なら date が書き換わらない
  it('日付が変わっても内容不変なら date を書き換えない', () => {
    generateDocIndexes({ docDir: root, date: '2026-07-19' });
    const before = fs.readFileSync(path.join(root, 'index.ja.md'), 'utf8');

    const second = generateDocIndexes({ docDir: root, date: '2026-07-20' });
    const after = fs.readFileSync(path.join(root, 'index.ja.md'), 'utf8');

    expect(second.written).toBe(0);
    expect(after).toBe(before);
    expect(after).toContain('date: "2026-07-19"');
  });

  // AC-3（書き込まなすぎ方向の検査）: 変更があれば必ず書き換わる
  it('文書を追加したら該当フォルダの索引だけを書き換える', () => {
    generateDocIndexes({ docDir: root, date: '2026-07-19' });
    const subBefore = fs.readFileSync(path.join(root, 'sub', 'index.ja.md'), 'utf8');

    makeDoc(root, 'gamma.ja.md', { title: 'ガンマ', excerpt: '説明 C' });
    const result = generateDocIndexes({ docDir: root, date: '2026-07-20' });

    const rootAfter = fs.readFileSync(path.join(root, 'index.ja.md'), 'utf8');
    const subAfter = fs.readFileSync(path.join(root, 'sub', 'index.ja.md'), 'utf8');

    // root は件数とエントリが変わるので書き換わり、date も当日へ進む
    expect(rootAfter).toContain('ガンマ');
    expect(rootAfter).toContain('date: "2026-07-20"');
    // sub は無関係なので据え置き
    expect(subAfter).toBe(subBefore);
    expect(result.written).toBe(1);
    expect(result.unchanged).toBe(1);
  });

  it('title / excerpt の変更を検出して書き換える', () => {
    generateDocIndexes({ docDir: root, date: '2026-07-19' });

    makeDoc(root, 'alpha.ja.md', { title: 'アルファ改', category: 'spec', excerpt: '説明 A' });
    const result = generateDocIndexes({ docDir: root, date: '2026-07-20' });

    expect(result.written).toBe(1);
    expect(fs.readFileSync(path.join(root, 'index.ja.md'), 'utf8')).toContain('アルファ改');
  });

  it('docDir が存在しなければ例外を投げる', () => {
    expect(() => generateDocIndexes({ docDir: path.join(root, 'missing') })).toThrow(
      /dir not found/,
    );
  });
});

describe('isSameIgnoringDate', () => {
  const base = '---\ntitle: "T"\ndate: "2026-07-19"\n---\n\n本文\n';

  it('date 行だけが違うなら同一とみなす', () => {
    expect(isSameIgnoringDate(base, base.replace('2026-07-19', '2026-07-20'))).toBe(true);
  });

  it('date 以外が違えば別物とみなす', () => {
    expect(isSameIgnoringDate(base, base.replace('本文', '別の本文'))).toBe(false);
    expect(isSameIgnoringDate(base, base.replace('title: "T"', 'title: "U"'))).toBe(false);
  });

  it('本文中の date らしき行を伏せない', () => {
    const withBodyDate = base + 'date: "1999-01-01"\n';
    const other = withBodyDate.replace('1999-01-01', '2000-01-01');
    expect(isSameIgnoringDate(withBodyDate, other)).toBe(false);
  });
});
