import { canonicalize } from '../../src/canonical/canonicalize';

describe('canonicalize', () => {
  it('trims leading and trailing whitespace', () => {
    expect(canonicalize('  hello  ')).toBe('hello');
  });

  it('converts to lowercase', () => {
    expect(canonicalize('React.JS')).toBe('react.js');
  });

  it('trims and lowercases together', () => {
    expect(canonicalize(' React.JS ')).toBe('react.js');
  });

  it('normalizes fullwidth characters via NFKC', () => {
    expect(canonicalize('Ｒｅａｃｔ')).toBe('react');
  });

  it('collapses multiple internal spaces to a single space', () => {
    expect(canonicalize('  foo  bar  ')).toBe('foo bar');
  });

  it('collapses tabs and newlines as whitespace', () => {
    expect(canonicalize('foo\t\tbar')).toBe('foo bar');
  });

  it('returns empty string for empty input', () => {
    expect(canonicalize('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(canonicalize('   ')).toBe('');
  });

  it('handles already-canonical input unchanged', () => {
    expect(canonicalize('react')).toBe('react');
  });
});
