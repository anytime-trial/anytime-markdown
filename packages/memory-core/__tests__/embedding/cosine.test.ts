import { cosineSimilarity } from '../../src/embedding/cosine';

describe('cosineSimilarity', () => {
  it('same direction: returns ≈ 1.0', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([2, 4, 6]); // scalar multiple of a
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 6);
  });

  it('identical vectors: returns exactly 1.0 (within tolerance)', () => {
    const a = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0, 6);
  });

  it('orthogonal vectors: returns ≈ 0.0', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 6);
  });

  it('opposite direction: returns ≈ -1.0', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([-1, -2, -3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 6);
  });

  it('throws "embedding_dim_mismatch" when lengths differ', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2]);
    expect(() => cosineSimilarity(a, b)).toThrow('embedding_dim_mismatch');
  });

  it('returns 0 when vector a has zero norm', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 when vector b has zero norm', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([0, 0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 when both vectors have zero norm', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([0, 0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('works on 1024-dimensional vectors (typical embedding size)', () => {
    const a = new Float32Array(1024).fill(1);
    const b = new Float32Array(1024).fill(1);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it('throws "embedding_dim_mismatch" for empty vs non-empty', () => {
    const a = new Float32Array(0);
    const b = new Float32Array([1]);
    expect(() => cosineSimilarity(a, b)).toThrow('embedding_dim_mismatch');
  });
});
