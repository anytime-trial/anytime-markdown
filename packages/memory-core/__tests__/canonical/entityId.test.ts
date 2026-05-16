import { entityId } from '../../src/canonical/entityId';

describe('entityId', () => {
  it('returns a 16-character lowercase hex string', () => {
    const id = entityId('technology', 'react');
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic: same input always returns same output', () => {
    const id1 = entityId('technology', 'react');
    const id2 = entityId('technology', 'react');
    expect(id1).toBe(id2);
  });

  it('returns different IDs for different canonical names', () => {
    const id1 = entityId('technology', 'react');
    const id2 = entityId('technology', 'vue');
    expect(id1).not.toBe(id2);
  });

  it('returns different IDs for different types (same name)', () => {
    const id1 = entityId('technology', 'react');
    const id2 = entityId('concept', 'react');
    expect(id1).not.toBe(id2);
  });

  it('returns exactly 16 characters', () => {
    expect(entityId('person', 'alice').length).toBe(16);
  });
});
