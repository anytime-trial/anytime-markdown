import { BARNES_HUT_LAYOUT_ALGORITHM_VERSION, computeSpecHash, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import { evaluateLayoutCache } from '../layout/cache';

function baseFile(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'A', frequency: 10 },
        { label: 'B', frequency: 5 },
      ],
      links: [[0, 1, 3]],
    },
  };
}

describe('evaluateLayoutCache', () => {
  it('returns miss-absent when layout is missing', () => {
    expect(evaluateLayoutCache(baseFile()).decision).toBe('miss-absent');
  });

  it('returns hit when spec hash and algorithm version match', () => {
    const file = baseFile();
    file.layout = {
      positions: [[0, 0], [1, 1]],
      specHash: computeSpecHash(file.spec),
      algorithmVersion: BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
    };
    expect(evaluateLayoutCache(file).decision).toBe('hit');
  });

  it('returns miss-spec when spec hash differs', () => {
    const file = baseFile();
    file.layout = {
      positions: [[0, 0], [1, 1]],
      specHash: 'old-spec',
      algorithmVersion: BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
    };
    expect(evaluateLayoutCache(file).decision).toBe('miss-spec');
  });

  it('returns miss-algorithm when algorithm version differs', () => {
    const file = baseFile();
    file.layout = {
      positions: [[0, 0], [1, 1]],
      specHash: computeSpecHash(file.spec),
      algorithmVersion: 'old-algorithm',
    };
    expect(evaluateLayoutCache(file).decision).toBe('miss-algorithm');
  });
});
