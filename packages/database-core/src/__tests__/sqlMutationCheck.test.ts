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
});
