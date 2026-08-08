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

  it('accepts a server-supplied layout without checking the algorithm version', () => {
    // サーバ供給の座標はアルゴリズム版数を照合しない。照合すると、ビューア側の
    // アルゴリズムを変えるたびに全体グラフの座標を捨ててクライアントで計算し直すことになる
    const file = baseFile();
    file.layout = {
      positions: [[0, 0], [1, 1]],
      specHash: computeSpecHash(file.spec),
      algorithmVersion: 'server-forceatlas2-v1',
      source: 'server',
    };
    expect(evaluateLayoutCache(file).decision).toBe('hit');
  });

  it('still requires a matching spec hash for a server-supplied layout', () => {
    const file = baseFile();
    file.layout = {
      positions: [[0, 0], [1, 1]],
      specHash: 'stale',
      algorithmVersion: 'server-forceatlas2-v1',
      source: 'server',
    };
    expect(evaluateLayoutCache(file).decision).toBe('miss-spec');
  });

  it('keeps checking the algorithm version for client-computed layouts', () => {
    const file = baseFile();
    file.layout = {
      positions: [[0, 0], [1, 1]],
      specHash: computeSpecHash(file.spec),
      algorithmVersion: 'old-algorithm',
      source: 'client',
    };
    expect(evaluateLayoutCache(file).decision).toBe('miss-algorithm');
  });
});
