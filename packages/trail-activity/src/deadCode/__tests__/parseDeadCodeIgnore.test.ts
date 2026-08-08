import { parseDeadCodeIgnore, matchIgnore } from '../parseDeadCodeIgnore';

describe('parseDeadCodeIgnore', () => {
  it('空行・コメントを除外', () => {
    const r = parseDeadCodeIgnore(`
# comment
**/*.ts

!**/foo.ts
`);
    expect(r.patterns).toEqual(['**/*.ts']);
    expect(r.negations).toEqual(['**/foo.ts']);
  });

  it('複数パターンを正しく分類', () => {
    const r = parseDeadCodeIgnore(`**/*.config.ts\n**/index.ts\n!**/special.ts`);
    expect(r.patterns).toEqual(['**/*.config.ts', '**/index.ts']);
    expect(r.negations).toEqual(['**/special.ts']);
  });
});

describe('matchIgnore', () => {
  it('パターンマッチで true', () => {
    const rules = parseDeadCodeIgnore('**/*.config.ts');
    const m = matchIgnore('packages/foo/jest.config.ts', rules);
    expect(m.matched).toBe(true);
    expect(m.pattern).toBe('**/*.config.ts');
  });

  it('否定パターンで除外を打ち消す', () => {
    const rules = parseDeadCodeIgnore(`**/*.config.ts\n!**/important.config.ts`);
    expect(matchIgnore('packages/foo/important.config.ts', rules).matched).toBe(false);
    expect(matchIgnore('packages/foo/other.config.ts', rules).matched).toBe(true);
  });
});
