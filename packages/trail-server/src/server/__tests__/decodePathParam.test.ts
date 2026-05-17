import { decodePathParam } from '../TrailDataServer';

describe('decodePathParam', () => {
  it('returns substring after prefix when no special chars', () => {
    expect(decodePathParam('/api/memory/drift/events/abc123', '/api/memory/drift/events/')).toBe('abc123');
  });

  it('decodes percent-encoded colon (:) which encodeURIComponent always escapes', () => {
    // memory_drift_events.id is e.g. "drift:entity:pkg:foo:spec_vs_code" — must round-trip through URL encoding
    const id = 'drift:entity:pkg:foo:spec_vs_code';
    const encoded = encodeURIComponent(id);
    expect(decodePathParam(`/api/memory/drift/events/${encoded}`, '/api/memory/drift/events/')).toBe(id);
  });

  it('decodes percent-encoded slash (/) used in subject entity paths', () => {
    const id = 'drift:entity:pkg:trail-viewer/src/foo.ts:depends_on:spec_vs_code';
    const encoded = encodeURIComponent(id);
    expect(decodePathParam(`/api/memory/drift/events/${encoded}`, '/api/memory/drift/events/')).toBe(id);
  });

  it('strips suffix before decoding so /resolve is removed from the POST path', () => {
    const id = 'drift:entity:pkg:foo:spec_vs_code';
    const encoded = encodeURIComponent(id);
    expect(
      decodePathParam(`/api/memory/drift/events/${encoded}/resolve`, '/api/memory/drift/events/', '/resolve'),
    ).toBe(id);
  });

  it('returns empty string when path equals prefix exactly', () => {
    expect(decodePathParam('/api/memory/drift/events/', '/api/memory/drift/events/')).toBe('');
  });
});
