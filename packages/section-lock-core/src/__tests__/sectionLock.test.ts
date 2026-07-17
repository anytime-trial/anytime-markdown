import {
  computeSectionHash,
  evaluateLockChange,
  hasLockedSections,
  listSections,
  parseLockedSections,
  removeLockedSection,
  upsertLockedSection,
  type LockedSectionEntry,
} from '../index';

const DOC = [
  '# タイトル',
  '',
  '## 設計',
  '',
  '設計本文。',
  '',
  '### データモデル',
  '',
  'モデル本文。',
  '',
  '## 運用',
  '',
  '運用本文。',
  '',
  '```markdown',
  '# コードブロック内の見出しではない',
  '```',
  '',
  '## 運用',
  '',
  '2 つ目の運用セクション。',
  '',
].join('\n');

function makeEntry(doc: string, path: string, occurrence = 1): LockedSectionEntry {
  const section = listSections(doc).find(
    (s) => s.path === path && s.occurrence === occurrence,
  );
  if (!section) throw new Error(`section not found: ${path}#${occurrence}`);
  return {
    path,
    occurrence,
    hash: computeSectionHash(doc, section),
    lockedAt: '2026-07-17T04:00:00.000Z',
    lockedBy: 'tester',
    reason: '確定済み',
  };
}

describe('listSections', () => {
  it('見出し階層をパスとして返し、コードブロック内の # を無視する', () => {
    const sections = listSections(DOC);
    const paths = sections.map((s) => `${s.path}#${s.occurrence}`);
    expect(paths).toEqual([
      'タイトル#1',
      'タイトル > 設計#1',
      'タイトル > 設計 > データモデル#1',
      'タイトル > 運用#1',
      'タイトル > 運用#2',
    ]);
  });

  it('セクション範囲は次の同レベル以上の見出し直前まで（下位見出しを含む）', () => {
    const design = listSections(DOC).find((s) => s.path === 'タイトル > 設計');
    expect(design).toBeDefined();
    const lines = DOC.split('\n');
    expect(lines[design!.startLine]).toBe('## 設計');
    expect(lines[design!.endLine + 1]).toBe('## 運用');
  });
});

describe('computeSectionHash', () => {
  it('CRLF・行末空白・末尾空行の差では変化しない', () => {
    const section = listSections(DOC).find((s) => s.path === 'タイトル > 運用' && s.occurrence === 1)!;
    const noisy = DOC.replaceAll('\n', '\r\n').replaceAll('運用本文。', '運用本文。  ');
    const noisySection = listSections(noisy).find(
      (s) => s.path === 'タイトル > 運用' && s.occurrence === 1,
    )!;
    expect(computeSectionHash(noisy, noisySection)).toBe(computeSectionHash(DOC, section));
  });

  it('本文が変わればハッシュが変わる', () => {
    const changed = DOC.replace('運用本文。', '書き換えた。');
    const a = listSections(DOC).find((s) => s.path === 'タイトル > 運用' && s.occurrence === 1)!;
    const b = listSections(changed).find((s) => s.path === 'タイトル > 運用' && s.occurrence === 1)!;
    expect(computeSectionHash(changed, b)).not.toBe(computeSectionHash(DOC, a));
    expect(computeSectionHash(DOC, a)).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });
});

describe('upsertLockedSection / parseLockedSections / removeLockedSection', () => {
  it('frontmatter が無い文書に挿入し、往復できる', () => {
    const entry = makeEntry(DOC, 'タイトル > 設計');
    const locked = upsertLockedSection(DOC, entry);
    expect(locked.startsWith('---\n')).toBe(true);
    expect(parseLockedSections(locked)).toEqual([entry]);
    expect(hasLockedSections(locked)).toBe(true);
    expect(hasLockedSections(DOC)).toBe(false);
  });

  it('既存 frontmatter の他キーを保持したまま追加・更新・削除できる', () => {
    const doc = `---\ntitle: "既存"\ntags:\n    - a\n---\n\n${DOC}`;
    const e1 = makeEntry(doc, 'タイトル > 設計');
    const e2 = makeEntry(doc, 'タイトル > 運用', 2);
    let text = upsertLockedSection(doc, e1);
    text = upsertLockedSection(text, e2);
    expect(text).toContain('title: "既存"');
    expect(text).toContain('tags:');
    expect(parseLockedSections(text)).toEqual([e1, e2]);

    const updated: LockedSectionEntry = { ...e1, reason: '更新後' };
    text = upsertLockedSection(text, updated);
    expect(parseLockedSections(text)).toEqual([updated, e2]);

    text = removeLockedSection(text, e1.path, e1.occurrence);
    expect(parseLockedSections(text)).toEqual([e2]);
    text = removeLockedSection(text, e2.path, e2.occurrence);
    expect(parseLockedSections(text)).toEqual([]);
    expect(hasLockedSections(text)).toBe(false);
    expect(text).toContain('title: "既存"');
  });

  it('js-yaml が再直列化した形式（2 スペースインデント・単引用符）も同一エントリとして読める', () => {
    // gray-matter（update_frontmatter 等）が frontmatter 全体を再直列化すると
    // 引用符・インデントが変わる。値が同じならエントリは同一とみなせること。
    const entry = makeEntry(DOC, 'タイトル > 設計');
    const reserialized = [
      '---',
      'lockedSections:',
      `  - path: ${entry.path}`,
      `    occurrence: ${entry.occurrence}`,
      `    hash: ${entry.hash}`,
      `    lockedAt: '${entry.lockedAt}'`,
      `    lockedBy: ${entry.lockedBy}`,
      `    reason: ${entry.reason}`,
      '---',
      '',
      DOC,
    ].join('\n');
    expect(parseLockedSections(reserialized)).toEqual([entry]);
  });

  it('lockedSections だけの frontmatter は全削除で frontmatter ごと消える', () => {
    const entry = makeEntry(DOC, 'タイトル > 設計');
    const locked = upsertLockedSection(DOC, entry);
    const removed = removeLockedSection(locked, entry.path, entry.occurrence);
    expect(removed).toBe(DOC);
  });
});

describe('evaluateLockChange', () => {
  const entry = makeEntry(DOC, 'タイトル > 設計');
  const lockedDoc = upsertLockedSection(DOC, entry);

  it('ロック無し・変更無しは空結果', () => {
    expect(evaluateLockChange(DOC, DOC.replace('運用本文。', 'x'))).toEqual({
      violations: [],
      tampers: [],
    });
    expect(evaluateLockChange(lockedDoc, lockedDoc)).toEqual({ violations: [], tampers: [] });
  });

  it('非ロック節の編集は許可される', () => {
    const after = lockedDoc.replace('運用本文。', '自由に編集。');
    expect(evaluateLockChange(lockedDoc, after)).toEqual({ violations: [], tampers: [] });
  });

  it('ロック節本文の変更は section_modified', () => {
    const after = lockedDoc.replace('設計本文。', '改変。');
    const result = evaluateLockChange(lockedDoc, after);
    expect(result.violations).toEqual([{ kind: 'section_modified', entry }]);
  });

  it('配下の下位見出しの変更もロック節の変更として検知する', () => {
    const after = lockedDoc.replace('モデル本文。', '改変。');
    expect(evaluateLockChange(lockedDoc, after).violations).toEqual([
      { kind: 'section_modified', entry },
    ]);
  });

  it('ロック節の見出しリネームは section_removed', () => {
    const after = lockedDoc.replace('## 設計', '## 別名');
    const result = evaluateLockChange(lockedDoc, after);
    expect(result.violations).toEqual([{ kind: 'section_removed', entry }]);
  });

  it('ロックエントリの削除は lock_entry_removed（自己保護）', () => {
    const after = removeLockedSection(lockedDoc, entry.path, entry.occurrence);
    const result = evaluateLockChange(lockedDoc, after);
    expect(result.violations).toEqual([{ kind: 'lock_entry_removed', entry }]);
  });

  it('ロックエントリの改変は lock_entry_altered（自己保護）', () => {
    const after = lockedDoc.replace(entry.hash, 'fnv1a64:0000000000000000');
    const result = evaluateLockChange(lockedDoc, after);
    expect(result.violations).toEqual([{ kind: 'lock_entry_altered', entry }]);
  });

  it('before 時点で hash 不一致なら tamper（deny 対象にしない）', () => {
    const tampered = lockedDoc.replace('設計本文。', 'ロック外経路の改変。');
    const after = tampered.replace('ロック外経路の改変。', 'さらに編集。');
    const result = evaluateLockChange(tampered, after);
    expect(result.violations).toEqual([]);
    expect(result.tampers).toEqual([entry]);
  });

  it('tamper 状態でもロックエントリの削除・改変は violation（自己保護は無条件）', () => {
    // cross-review 合意 #3: 逸脱済み文書でロック情報を消せる抜け道を塞ぐ
    const tampered = lockedDoc.replace('設計本文。', 'ロック外経路の改変。');
    const removed = removeLockedSection(tampered, entry.path, entry.occurrence);
    expect(evaluateLockChange(tampered, removed).violations).toEqual([
      { kind: 'lock_entry_removed', entry },
    ]);
    const altered = tampered.replace(entry.hash, 'fnv1a64:0000000000000000');
    expect(evaluateLockChange(tampered, altered).violations).toEqual([
      { kind: 'lock_entry_altered', entry },
    ]);
  });
});

describe('空見出しの列挙（cross-review 合意 #6）', () => {
  it('"##" のみの空見出しも listSections に含まれ、後続のインデックスがずれない', () => {
    const doc = '# T\n\n##\n\n## 設計\n\n本文。\n';
    const sections = listSections(doc);
    expect(sections.map((s) => `${s.path}#${s.occurrence}`)).toEqual([
      'T#1',
      'T > #1',
      'T > 設計#1',
    ]);
    expect(sections[2]?.headingLine).toBe(4);
  });
});
