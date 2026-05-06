import { hasTopLevelLimit } from '../limitDetection';

describe('hasTopLevelLimit', () => {
  it.each([
    'SELECT * FROM t LIMIT 10',
    'SELECT * FROM t LIMIT 10 OFFSET 20',
    'select * from t limit 5;',
    'SELECT a FROM t  LIMIT  100  ',
  ])('returns true: %s', (sql) => {
    expect(hasTopLevelLimit(sql)).toBe(true);
  });

  it.each([
    'SELECT * FROM t',
    'SELECT * FROM (SELECT * FROM t LIMIT 5) sub',
    'SELECT a FROM t WHERE id IN (SELECT id FROM s LIMIT 3)',
    'SELECT 1',
    '',
  ])('returns false: %s', (sql) => {
    expect(hasTopLevelLimit(sql)).toBe(false);
  });
});
