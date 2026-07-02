import matter from 'gray-matter';
import { extractNoteDoc, addRelatedEntry } from '../frontmatter';
import type { RelatedRef } from '../relations';

const FM = (body: string): string => `---\n${body}\n---\n\n# Heading\n\ncontent\n`;

/** 書込後の related を gray-matter で読み戻すヘルパー（正規化前の生値）。 */
function rawRelated(content: string): unknown {
  return matter(content).data.related;
}

/** テスト用の warn シンク（未知の関係種別を検出した際の警告受け皿）。 */
const noopWarn = (): void => undefined;

describe('extractNoteDoc', () => {
  it('maps frontmatter to a NoteDocInput with references-typed related', () => {
    const doc = extractNoteDoc('spec/a/a.ja.md', FM('title: Doc A\ntype: spec\nrelated:\n  - "spec/b/b.ja.md"'), noopWarn);
    expect(doc).not.toBeNull();
    expect(doc?.path).toBe('spec/a/a.ja.md');
    expect(doc?.title).toBe('Doc A');
    expect(doc?.type).toBe('spec');
    // 素の文字列 = references（後方互換）
    expect(doc?.related).toEqual([{ to: 'spec/b/b.ja.md', type: 'references' }]);
  });

  it('parses typed object related entries', () => {
    const doc = extractNoteDoc(
      'spec/a.md',
      FM('title: A\nrelated:\n  - to: "spec/b.md"\n    type: depends-on\n  - to: "spec/c.md"\n    type: implements'),
      noopWarn,
    );
    expect(doc?.related).toEqual<RelatedRef[]>([
      { to: 'spec/b.md', type: 'depends-on' },
      { to: 'spec/c.md', type: 'implements' },
    ]);
  });

  it('supports a mix of bare strings and typed objects', () => {
    const doc = extractNoteDoc(
      'spec/a.md',
      FM('title: A\nrelated:\n  - "spec/b.md"\n  - to: "spec/c.md"\n    type: supersedes'),
      noopWarn,
    );
    expect(doc?.related).toEqual<RelatedRef[]>([
      { to: 'spec/b.md', type: 'references' },
      { to: 'spec/c.md', type: 'supersedes' },
    ]);
  });

  it('falls back to references for an unknown type (no silent ignore)', () => {
    const warn = jest.fn();
    const doc = extractNoteDoc('spec/a.md', FM('title: A\nrelated:\n  - to: "spec/b.md"\n    type: mentions'), warn);
    expect(doc?.related).toEqual([{ to: 'spec/b.md', type: 'references' }]);
    expect(warn).toHaveBeenCalled();
  });

  it('returns null without a title', () => {
    expect(extractNoteDoc('x.md', FM('type: spec'), noopWarn)).toBeNull();
  });

  it('returns null when frontmatter is absent', () => {
    expect(extractNoteDoc('x.md', '# just markdown', noopWarn)).toBeNull();
  });

  it('excludes documents with graph: false / no / off', () => {
    expect(extractNoteDoc('x.md', FM('title: X\ngraph: false'), noopWarn)).toBeNull();
    expect(extractNoteDoc('x.md', FM('title: X\ngraph: no'), noopWarn)).toBeNull();
    expect(extractNoteDoc('x.md', FM('title: X\ngraph: off'), noopWarn)).toBeNull();
  });

  it('drops unsafe related references (traversal / absolute paths) on the to field', () => {
    const doc = extractNoteDoc(
      'spec/a.md',
      FM('title: A\nrelated:\n  - "../../etc/passwd"\n  - "/abs/x.md"\n  - to: "../evil.md"\n    type: depends-on\n  - "spec/b.md"'),
      noopWarn,
    );
    expect(doc?.related).toEqual([{ to: 'spec/b.md', type: 'references' }]);
  });

  it('sets related to undefined when all references are unsafe', () => {
    const doc = extractNoteDoc('spec/a.md', FM('title: A\nrelated:\n  - "../x.md"'), noopWarn);
    expect(doc?.related).toBeUndefined();
  });

  it('parses CRLF frontmatter', () => {
    const doc = extractNoteDoc(
      'spec/a.md',
      '---\r\ntitle: A\r\nrelated:\r\n  - "spec/b.md"\r\n---\r\n\r\n# Body\r\n',
      noopWarn,
    );
    expect(doc?.title).toBe('A');
    expect(doc?.related).toEqual([{ to: 'spec/b.md', type: 'references' }]);
  });
});

describe('addRelatedEntry', () => {
  it('appends a references entry as a bare string (backward compatible)', () => {
    const before = FM('title: A\nrelated:\n  - "spec/b.md"');
    const after = addRelatedEntry(before, 'spec/c.md', noopWarn);
    expect(rawRelated(after)).toEqual(['spec/b.md', 'spec/c.md']);
    expect(after).toContain('# Heading');
  });

  it('appends a typed entry as an object form', () => {
    const before = FM('title: A\nrelated:\n  - "spec/b.md"');
    const after = addRelatedEntry(before, 'spec/c.md', noopWarn, 'depends-on');
    expect(rawRelated(after)).toEqual(['spec/b.md', { to: 'spec/c.md', type: 'depends-on' }]);
  });

  it('adds a related key when missing (typed)', () => {
    const before = FM('title: A\ntype: spec');
    const after = addRelatedEntry(before, 'spec/c.md', noopWarn, 'implements');
    expect(rawRelated(after)).toEqual([{ to: 'spec/c.md', type: 'implements' }]);
    expect(matter(after).data.title).toBe('A');
  });

  it('is idempotent for an already-present (to, type) pair', () => {
    const before = FM('title: A\nrelated:\n  - to: "spec/b.md"\n    type: depends-on');
    expect(addRelatedEntry(before, 'spec/b.md', noopWarn, 'depends-on')).toBe(before);
  });

  it('is idempotent for a bare string treated as references', () => {
    const before = FM('title: A\nrelated:\n  - "spec/b.md"');
    expect(addRelatedEntry(before, 'spec/b.md', noopWarn)).toBe(before);
    expect(addRelatedEntry(before, 'spec/b.md', noopWarn, 'references')).toBe(before);
  });

  it('adds a new edge when the same target has a different type', () => {
    const before = FM('title: A\nrelated:\n  - "spec/b.md"');
    const after = addRelatedEntry(before, 'spec/b.md', noopWarn, 'depends-on');
    expect(rawRelated(after)).toEqual(['spec/b.md', { to: 'spec/b.md', type: 'depends-on' }]);
  });

  it('converts an inline related array to a list when appending typed', () => {
    const before = FM('title: A\nrelated: ["spec/b.md"]');
    const after = addRelatedEntry(before, 'spec/c.md', noopWarn, 'part-of');
    expect(rawRelated(after)).toEqual(['spec/b.md', { to: 'spec/c.md', type: 'part-of' }]);
  });

  it('creates frontmatter when none exists', () => {
    const after = addRelatedEntry('# just markdown\n', 'spec/c.md', noopWarn, 'refines');
    expect(rawRelated(after)).toEqual([{ to: 'spec/c.md', type: 'refines' }]);
    expect(after).toContain('# just markdown');
  });

  it('preserves CRLF line endings when appending', () => {
    const before = '---\r\ntitle: A\r\ntype: spec\r\n---\r\n\r\n# Body\r\n';
    const after = addRelatedEntry(before, 'spec/c.md', noopWarn, 'depends-on');
    expect(/[^\r]\n/.test(after)).toBe(false);
    expect(rawRelated(after)).toEqual([{ to: 'spec/c.md', type: 'depends-on' }]);
  });

  it('does not corrupt body when a target contains a dollar sign', () => {
    const before = FM('title: A');
    const after = addRelatedEntry(before, 'spec/$weird.md', noopWarn);
    expect(rawRelated(after)).toEqual(['spec/$weird.md']);
    expect(after).toContain('# Heading');
  });

  it('rejects an unsafe target (no write)', () => {
    const before = FM('title: A');
    expect(addRelatedEntry(before, '../evil.md', noopWarn, 'depends-on')).toBe(before);
  });

  it('escapes YAML special characters in the target so the result re-parses', () => {
    const before = FM('title: A');
    const after = addRelatedEntry(before, 'spec/a"b.md', noopWarn, 'depends-on');
    // 不正 YAML を生成せず、エスケープして round-trip できること
    expect(() => matter(after)).not.toThrow();
    expect(rawRelated(after)).toEqual([{ to: 'spec/a"b.md', type: 'depends-on' }]);
  });

  it('converts a scalar related value to a list without duplicating the key', () => {
    const before = '---\ntitle: A\nrelated: spec/b.md\n---\n\n# Body\n';
    const after = addRelatedEntry(before, 'spec/c.md', noopWarn, 'depends-on');
    // 二重 related: キー（duplicated mapping key）で parse 不能にならないこと
    expect(() => matter(after)).not.toThrow();
    expect(rawRelated(after)).toEqual(['spec/b.md', { to: 'spec/c.md', type: 'depends-on' }]);
  });

  it('reads a scalar related value as a single reference', () => {
    const doc = extractNoteDoc('spec/a.md', '---\ntitle: A\nrelated: spec/b.md\n---\n\n# Body\n', noopWarn);
    expect(doc?.related).toEqual([{ to: 'spec/b.md', type: 'references' }]);
  });
});
