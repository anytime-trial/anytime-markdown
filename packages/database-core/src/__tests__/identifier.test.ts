import { isSafeIdentifier, assertSafeIdentifier } from '../identifier';

describe('isSafeIdentifier', () => {
  it.each(['users', 'TableA', '_private', 'tbl_1', 'a1b2c3'])(
    'returns true for valid: %s',
    (s) => expect(isSafeIdentifier(s)).toBe(true),
  );

  it.each(['', '1users', 'tbl-name', 'tbl name', 'tbl"name', 'sqlite_master', null, undefined])(
    'returns false for invalid: %s',
    (s) => expect(isSafeIdentifier(s as string)).toBe(false),
  );
});

describe('assertSafeIdentifier', () => {
  it('returns the identifier when valid', () => {
    expect(assertSafeIdentifier('users')).toBe('users');
  });

  it('throws for invalid identifier', () => {
    expect(() => assertSafeIdentifier('1bad')).toThrow(/unsafe identifier/i);
  });

  it('rejects sqlite_ prefix', () => {
    expect(() => assertSafeIdentifier('sqlite_master')).toThrow();
  });
});
