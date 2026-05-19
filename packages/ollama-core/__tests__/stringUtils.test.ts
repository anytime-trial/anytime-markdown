import { stripTrailingSlashes } from '../src/stringUtils';

describe('stripTrailingSlashes', () => {
  it('returns input unchanged when there are no trailing slashes', () => {
    expect(stripTrailingSlashes('http://localhost:11434')).toBe('http://localhost:11434');
  });

  it('removes a single trailing slash', () => {
    expect(stripTrailingSlashes('http://localhost:11434/')).toBe('http://localhost:11434');
  });

  it('removes consecutive trailing slashes', () => {
    expect(stripTrailingSlashes('http://localhost:11434////')).toBe('http://localhost:11434');
  });

  it('returns empty string when input is all slashes', () => {
    expect(stripTrailingSlashes('////')).toBe('');
  });

  it('preserves leading and embedded slashes', () => {
    expect(stripTrailingSlashes('/path/to/resource/')).toBe('/path/to/resource');
  });

  it('handles empty input', () => {
    expect(stripTrailingSlashes('')).toBe('');
  });
});
