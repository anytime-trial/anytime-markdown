import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeSectionHash,
  listSections,
  upsertLockedSection,
  type LockedSectionEntry,
} from '@anytime-markdown/section-lock-core';
import { evaluateSectionLockGate } from '../sectionLockGate';

const DOC = [
  '# タイトル',
  '',
  '## 設計',
  '',
  '設計本文。',
  '',
  '## 運用',
  '',
  '運用本文。',
  '',
].join('\n');

function lockEntry(doc: string, path: string): LockedSectionEntry {
  const section = listSections(doc).find((s) => s.path === path && s.occurrence === 1);
  if (!section) throw new Error(`section not found: ${path}`);
  return {
    path,
    occurrence: 1,
    hash: computeSectionHash(doc, section),
    lockedAt: '2026-07-17T04:00:00.000Z',
    lockedBy: 'tester',
  };
}

describe('evaluateSectionLockGate', () => {
  let dir: string;
  let mdPath: string;
  let lockedDoc: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'section-lock-gate-'));
    mdPath = join(dir, 'doc.md');
    lockedDoc = upsertLockedSection(DOC, lockEntry(DOC, 'タイトル > 設計'));
    writeFileSync(mdPath, lockedDoc, 'utf8');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('Edit がロック節を変更しようとすると deny + spool イベント', () => {
    const verdict = evaluateSectionLockGate(
      'Edit',
      { file_path: mdPath, old_string: '設計本文。', new_string: '改変。' },
      dir,
    );
    expect(verdict.kind).toBe('deny');
    expect(verdict.reason).toContain('タイトル > 設計');
    expect(verdict.spoolEvents.map((e) => e.event)).toEqual(['section_lock_denied']);
  });

  it('Edit が非ロック節を変更するのは pass', () => {
    const verdict = evaluateSectionLockGate(
      'Edit',
      { file_path: mdPath, old_string: '運用本文。', new_string: '自由に編集。' },
      dir,
    );
    expect(verdict.kind).toBe('pass');
    expect(verdict.spoolEvents).toEqual([]);
  });

  it('Write でロック節を保持した全文置換は pass', () => {
    const verdict = evaluateSectionLockGate(
      'Write',
      { file_path: mdPath, content: lockedDoc.replace('運用本文。', '書き直し。') },
      dir,
    );
    expect(verdict.kind).toBe('pass');
  });

  it('Write で lockedSections エントリを消すのは deny（自己保護）', () => {
    const verdict = evaluateSectionLockGate('Write', { file_path: mdPath, content: DOC }, dir);
    expect(verdict.kind).toBe('deny');
  });

  it('update_frontmatter が lockedSections に触れると deny', () => {
    for (const toolInput of [
      { path: 'doc.md', removeKeys: ['lockedSections'] },
      { path: 'doc.md', set: { lockedSections: [] } },
    ]) {
      const verdict = evaluateSectionLockGate(
        'mcp__mcp-markdown__update_frontmatter',
        toolInput,
        dir,
      );
      expect(verdict.kind).toBe('deny');
    }
  });

  it('update_section がロック見出しを対象にすると deny', () => {
    const verdict = evaluateSectionLockGate(
      'mcp__mcp-markdown__update_section',
      { path: 'doc.md', heading: '## 設計', content: '## 設計\n\n改変。' },
      dir,
    );
    expect(verdict.kind).toBe('deny');
  });

  it('update_section が非ロック見出しを対象にするのは pass', () => {
    const verdict = evaluateSectionLockGate(
      'mcp__mcp-markdown__update_section',
      { path: 'doc.md', heading: '## 運用', content: '## 運用\n\n書き直し。' },
      dir,
    );
    expect(verdict.kind).toBe('pass');
  });

  it('Serena の変更系がロック保有 md を対象にすると保守的 deny', () => {
    const verdict = evaluateSectionLockGate(
      'mcp__serena__replace_content',
      { relative_path: 'doc.md', pattern: '設計本文。', replacement: 'x' },
      dir,
    );
    expect(verdict.kind).toBe('deny');
  });

  it('ロック外経路で改変済み（hash 不一致）の場合は warn + tamper spool（deny しない）', () => {
    writeFileSync(mdPath, lockedDoc.replace('設計本文。', 'ロック外経路の改変。'), 'utf8');
    const verdict = evaluateSectionLockGate(
      'Edit',
      { file_path: mdPath, old_string: '運用本文。', new_string: '編集。' },
      dir,
    );
    expect(verdict.kind).toBe('warn');
    expect(verdict.spoolEvents.map((e) => e.event)).toEqual(['section_lock_tamper']);
  });

  it('.md 以外・ロック無し・読取不能は pass（fail-open）', () => {
    const tsPath = join(dir, 'code.ts');
    writeFileSync(tsPath, 'export const x = 1;', 'utf8');
    expect(
      evaluateSectionLockGate('Edit', { file_path: tsPath, old_string: 'x', new_string: 'y' }, dir)
        .kind,
    ).toBe('pass');

    const plainPath = join(dir, 'plain.md');
    writeFileSync(plainPath, DOC, 'utf8');
    expect(
      evaluateSectionLockGate(
        'Edit',
        { file_path: plainPath, old_string: '設計本文。', new_string: 'x' },
        dir,
      ).kind,
    ).toBe('pass');

    expect(
      evaluateSectionLockGate(
        'Edit',
        { file_path: join(dir, 'missing.md'), old_string: 'a', new_string: 'b' },
        dir,
      ).kind,
    ).toBe('pass');
  });

  it('読み取り専用ツールや不正な tool_input は pass', () => {
    expect(evaluateSectionLockGate('Read', { file_path: mdPath }, dir).kind).toBe('pass');
    expect(evaluateSectionLockGate('Bash', { command: 'ls' }, dir).kind).toBe('pass');
    expect(evaluateSectionLockGate('Edit', null, dir).kind).toBe('pass');
  });
});
