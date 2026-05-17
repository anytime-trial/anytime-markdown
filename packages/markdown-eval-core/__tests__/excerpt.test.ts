import { truncate } from '../src/excerpt';

describe('truncate', () => {
  it('returns content unchanged when shorter than maxChars', () => {
    const r = truncate('short content', 1000);
    expect(r.content).toBe('short content');
    expect(r.truncated).toBe(false);
  });

  it('returns content unchanged when exactly maxChars', () => {
    const content = 'x'.repeat(100);
    const r = truncate(content, 100);
    expect(r.content).toBe(content);
    expect(r.truncated).toBe(false);
  });

  it('truncates and appends marker when longer than maxChars', () => {
    const content = 'x'.repeat(200);
    const r = truncate(content, 100);
    expect(r.truncated).toBe(true);
    expect(r.content.startsWith('xxxx')).toBe(true);
    expect(r.content.length).toBeLessThan(200);
    expect(r.content).toContain('[truncated]');
  });

  it('handles empty content', () => {
    const r = truncate('', 100);
    expect(r.content).toBe('');
    expect(r.truncated).toBe(false);
  });

  it('handles maxChars 0 as truncate everything', () => {
    const r = truncate('abc', 0);
    expect(r.truncated).toBe(true);
    expect(r.content).toContain('[truncated]');
  });
});
