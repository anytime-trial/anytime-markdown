import { parseFixCommit } from '../../../src/ingest/bug-history/parseFixCommit';

describe('parseFixCommit', () => {
  test('U7: fix(web-app/regression): 同一バグ再発', () => {
    const result = parseFixCommit({ subject: 'fix(web-app/regression): 同一バグ再発' });
    expect(result).toEqual({
      package: 'web-app',
      category: 'regression',
      subject_summary: '同一バグ再発',
    });
  });

  test('U8: fix: typo in README → package=unknown, category=unknown', () => {
    const result = parseFixCommit({ subject: 'fix: typo in README' });
    expect(result).toEqual({
      package: 'unknown',
      category: 'unknown',
      subject_summary: 'typo in README',
    });
  });

  test('fix(web-app): xxx → category=unknown when no category', () => {
    const result = parseFixCommit({ subject: 'fix(web-app): xxx' });
    expect(result).toEqual({
      package: 'web-app',
      category: 'unknown',
      subject_summary: 'xxx',
    });
  });

  test('fix(web-app/unknownCat): xxx → category=unknown (outside enum)', () => {
    const result = parseFixCommit({ subject: 'fix(web-app/unknownCat): xxx' });
    expect(result).toEqual({
      package: 'web-app',
      category: 'unknown',
      subject_summary: 'xxx',
    });
  });

  test('feat: xxx → null (not a fix commit)', () => {
    expect(parseFixCommit({ subject: 'feat: xxx' })).toBeNull();
  });

  test("'fixed bug' → null (fix without colon)", () => {
    expect(parseFixCommit({ subject: 'fixed bug' })).toBeNull();
  });

  test('trailing newline / extra spaces → trimmed', () => {
    const result = parseFixCommit({ subject: '  fix(trail-viewer/logic): trim me  \n' });
    expect(result).toEqual({
      package: 'trail-viewer',
      category: 'logic',
      subject_summary: 'trim me',
    });
  });

  test('all valid categories', () => {
    const cats = ['spec', 'logic', 'regression', 'typo', 'deps'] as const;
    for (const cat of cats) {
      const result = parseFixCommit({ subject: `fix(pkg/${cat}): summary` });
      expect(result?.category).toBe(cat);
    }
  });

  test('Fix (uppercase) → null (only lowercase fix is valid)', () => {
    expect(parseFixCommit({ subject: 'Fix(web-app): something' })).toBeNull();
  });
});
