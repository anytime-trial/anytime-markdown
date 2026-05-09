import type { MemoryTabValue } from '../../memoryTabs';

function parseHashSubTab(hash: string): MemoryTabValue | null {
  const match = /^#memory\/(drift|bug|review|runs)/.exec(hash);
  if (!match) return null;
  return match[1] as MemoryTabValue;
}

describe('parseHashSubTab', () => {
  it('returns drift for #memory/drift', () => {
    expect(parseHashSubTab('#memory/drift')).toBe('drift');
  });

  it('returns bug for #memory/bug', () => {
    expect(parseHashSubTab('#memory/bug')).toBe('bug');
  });

  it('returns review for #memory/review', () => {
    expect(parseHashSubTab('#memory/review')).toBe('review');
  });

  it('returns runs for #memory/runs', () => {
    expect(parseHashSubTab('#memory/runs')).toBe('runs');
  });

  it('returns null for empty hash', () => {
    expect(parseHashSubTab('')).toBeNull();
  });

  it('returns null for unrelated hash', () => {
    expect(parseHashSubTab('#analytics')).toBeNull();
  });

  it('returns null for partial match', () => {
    expect(parseHashSubTab('#memory/')).toBeNull();
  });

  it('ignores query params after tab name', () => {
    expect(parseHashSubTab('#memory/drift?foo=bar')).toBe('drift');
  });
});
