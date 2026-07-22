import { filterCooccurrenceFile, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import { createFilterOptions, parseMinFrequency, parseMinStrength, parseTopLinkCount } from '../ui/filterModel';

function file(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'Alpha', frequency: 3 },
        { label: 'Beta', frequency: 2 },
      ],
      links: [[0, 1, 4]],
      clusters: [
        { label: 'A', members: [0] },
        { label: 'B', members: [1] },
      ],
    },
  };
}

describe('filterModel', () => {
  it('parses empty and non-numeric strings as undefined', () => {
    expect(parseMinFrequency('')).toBeUndefined();
    expect(parseMinStrength('not a number')).toBeUndefined();
    expect(parseTopLinkCount('')).toBeUndefined();
  });

  it('clamps lower bounds', () => {
    expect(parseMinFrequency('-2')).toBe(1);
    expect(parseMinStrength('-2')).toBe(0);
    expect(parseTopLinkCount('0')).toBeUndefined();
  });

  it('keeps an empty cluster selection as an empty filter that hides all words', () => {
    const options = createFilterOptions({
      minFrequencyText: '',
      minStrengthText: '',
      topLinkCountText: '',
      selectedClusterIndexes: new Set(),
    });
    const result = filterCooccurrenceFile(file(), options);
    expect(options.selectedClusterIndexes).toEqual([]);
    expect(result.counts.visibleNodeCount).toBe(0);
    expect(result.counts.visibleLinkCount).toBe(0);
  });
});
