import { classifyDbOpenError, describeDbOpenFailure } from '../../sqlite/dbOpenError';

describe('classifyDbOpenError', () => {
  it.each([
    ["Cannot read properties of undefined (reading 'indexOf')"],
    ['Could not locate the bindings file. Tried:\n → /dist/build/better_sqlite3.node'],
    ['/dist/node_modules/better-sqlite3/build/Release/better_sqlite3.node: invalid ELF header'],
  ])('classifies %p as native-binding', (message) => {
    expect(classifyDbOpenError(new Error(message))).toBe('native-binding');
  });

  it.each([
    ['activity.db not found: /ws/.anytime/trail/db/activity.db'],
    ['SQLITE_CORRUPT: database disk image is malformed'],
  ])('classifies %p as other', (message) => {
    expect(classifyDbOpenError(new Error(message))).toBe('other');
  });

  it('accepts non-Error values', () => {
    expect(classifyDbOpenError('caravan-book.db not found')).toBe('other');
  });
});

describe('describeDbOpenFailure', () => {
  it('leaves an unrelated failure as-is', () => {
    const message = 'activity.db not found: /ws/.anytime/trail/db/activity.db';
    expect(describeDbOpenFailure(new Error(message))).toBe(message);
  });

  it('names the shared cause for a native binding failure', () => {
    const described = describeDbOpenFailure(
      new Error("Cannot read properties of undefined (reading 'indexOf')"),
    );
    expect(described).toContain("Cannot read properties of undefined (reading 'indexOf')");
    // フォールバック先も同じ経路を通るので無意味である、という診断が本体。
    expect(described).toContain('native binary');
    expect(described).toContain('フォールバック');
  });
});
