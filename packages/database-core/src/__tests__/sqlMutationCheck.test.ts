import { isMutationSql } from '../sqlMutationCheck';

describe('isMutationSql', () => {
  it.each([
    'INSERT INTO t VALUES (1)',
    'UPDATE t SET a=1',
    'DELETE FROM t',
    'DROP TABLE t',
    'CREATE TABLE t(a)',
    'ALTER TABLE t ADD COLUMN x INTEGER',
    'TRUNCATE TABLE t',
    'REPLACE INTO t VALUES (1)',
    '  insert into t values (1)',
  ])('detects mutation: %s', (sql) => expect(isMutationSql(sql)).toBe(true));

  it.each([
    'SELECT * FROM t',
    'EXPLAIN SELECT * FROM t',
    'PRAGMA table_info(t)',
    'WITH x AS (SELECT 1) SELECT * FROM x',
    '',
  ])('returns false: %s', (sql) => expect(isMutationSql(sql)).toBe(false));

  it('returns false for whitespace-only input (post-strip empty path)', () => {
    expect(isMutationSql('   ')).toBe(false);
  });

  it('returns false for only-comments input (strip path leaves empty)', () => {
    expect(isMutationSql('-- only a comment\n/* another */')).toBe(false);
  });

  // WITH inner mutation detection (`WITH cte AS (...) INSERT ...`) is not currently
  // supported by stripCommentsAndLeadingWith — it returns as soon as it sees any
  // SELECT/INSERT keyword at depth 0, which catches the space + (SELECT pattern.
  // The 2 uncovered branches at lines 23-24 are the `(` / `)` depth tracking that
  // is exercised by the case below.
  it('handles WITH with nested parentheses without crashing (paren depth branch)', () => {
    expect(
      isMutationSql('WITH cte AS (SELECT (1 + (2 * 3))) SELECT * FROM cte'),
    ).toBe(false);
  });
});
