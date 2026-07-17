import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  computeSectionHash,
  listSections,
  upsertLockedSection,
} from '@anytime-markdown/section-lock-core';
import { assertNoLockViolation } from '../../utils/sectionLockGuard';
import { updateSection } from '../../tools/updateSection';
import { updateFrontmatter } from '../../tools/frontmatter';
import { writeMarkdown } from '../../tools/writeMarkdown';
import { formatMarkdownTool } from '../../tools/formatMarkdown';

const DOC = '# T\n\n## 設計\n\n本文。\n\n## 運用\n\n自由。\n';

function lockDoc(doc: string, sectionPath: string): string {
  const section = listSections(doc).find((s) => s.path === sectionPath && s.occurrence === 1);
  if (!section) throw new Error(`section not found: ${sectionPath}`);
  return upsertLockedSection(doc, {
    path: sectionPath,
    occurrence: 1,
    hash: computeSectionHash(doc, section),
    lockedAt: '2026-07-17T04:00:00.000Z',
    lockedBy: 'tester',
  });
}

describe('assertNoLockViolation', () => {
  const locked = lockDoc(DOC, 'T > 設計');

  it('ロック無し・非ロック節の変更は素通り', () => {
    expect(() => assertNoLockViolation(DOC, DOC.replace('本文。', 'x'), 'doc.md')).not.toThrow();
    expect(() =>
      assertNoLockViolation(locked, locked.replace('自由。', '編集。'), 'doc.md'),
    ).not.toThrow();
  });

  it('ロック節の変更・エントリ削除は throw', () => {
    expect(() =>
      assertNoLockViolation(locked, locked.replace('本文。', '改変。'), 'doc.md'),
    ).toThrow(/[Ss]ection lock/);
    expect(() => assertNoLockViolation(locked, DOC, 'doc.md')).toThrow(/[Ss]ection lock/);
  });

  it('tamper（before 時点の hash 不一致）は throw しない', () => {
    const tampered = locked.replace('本文。', 'ロック外の改変。');
    expect(() =>
      assertNoLockViolation(tampered, tampered.replace('自由。', '編集。'), 'doc.md'),
    ).not.toThrow();
  });
});

describe('変更系ツールのロック検査（第 2 層統合）', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-md-lock-'));
    await fs.writeFile(path.join(rootDir, 'doc.md'), lockDoc(DOC, 'T > 設計'), 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('update_section はロック節を拒否し、非ロック節は許可する', async () => {
    await expect(
      updateSection({ path: 'doc.md', heading: '## 設計', content: '## 設計\n\n改変。\n' }, rootDir),
    ).rejects.toThrow(/[Ss]ection lock/);
    await expect(
      updateSection({ path: 'doc.md', heading: '## 運用', content: '## 運用\n\n書換。\n' }, rootDir),
    ).resolves.toBeDefined();
  });

  it('update_frontmatter は lockedSections の削除を拒否し、他キーは許可する', async () => {
    await expect(
      updateFrontmatter({ path: 'doc.md', removeKeys: ['lockedSections'] }, rootDir),
    ).rejects.toThrow(/[Ss]ection lock/);
    await expect(
      updateFrontmatter({ path: 'doc.md', set: { title: 'ok' } }, rootDir),
    ).resolves.toBeDefined();
  });

  it('update_frontmatter はロックの無いファイルへの lockedSections 偽造追加も拒否する', async () => {
    await fs.writeFile(path.join(rootDir, 'plain.md'), DOC, 'utf-8');
    await expect(
      updateFrontmatter({ path: 'plain.md', set: { lockedSections: [{ path: '偽造' }] } }, rootDir),
    ).rejects.toThrow(/[Ss]ection lock/);
  });

  it('write_markdown はロック節を壊す全文置換を拒否し、保持する置換と新規作成は許可する', async () => {
    await expect(writeMarkdown({ path: 'doc.md', content: DOC }, rootDir)).rejects.toThrow(
      /[Ss]ection lock/,
    );
    const current = await fs.readFile(path.join(rootDir, 'doc.md'), 'utf-8');
    await expect(
      writeMarkdown({ path: 'doc.md', content: current.replace('自由。', '書換。') }, rootDir),
    ).resolves.toBeUndefined();
    await expect(writeMarkdown({ path: 'new.md', content: DOC }, rootDir)).resolves.toBeUndefined();
  });

  it('format_markdown はロック節の整形を伴う fix を拒否する（check は許可）', async () => {
    // 行末空白はハッシュ正規化で吸収される（違反にならない）ため、正規化で吸収されない
    // 整形（見出し直後の空行挿入）をロック節に仕込み、fix がロック節を変更する状況を作る
    const noisy = lockDoc(DOC.replace('## 設計\n\n本文。', '## 設計\n本文。'), 'T > 設計');
    await fs.writeFile(path.join(rootDir, 'noisy.md'), noisy, 'utf-8');
    await expect(
      formatMarkdownTool({ path: 'noisy.md', mode: 'check' }, rootDir),
    ).resolves.toBeDefined();
    await expect(formatMarkdownTool({ path: 'noisy.md', mode: 'fix' }, rootDir)).rejects.toThrow(
      /[Ss]ection lock/,
    );
  });
});
