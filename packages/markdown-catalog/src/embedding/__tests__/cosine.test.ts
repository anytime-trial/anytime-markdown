import { cosineSim } from '../cosine';
import { float32ToBlob, blobToFloat32 } from '../blob';

describe('cosineSim', () => {
  it('is 1 for identical direction, 0 for orthogonal, -1 for opposite', () => {
    expect(cosineSim([1, 0], [2, 0])).toBeCloseTo(1, 6);
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 6);
    expect(cosineSim([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  it('returns 0 for a zero vector', () => {
    expect(cosineSim([0, 0], [1, 1])).toBe(0);
  });
});

describe('float32 blob round-trip', () => {
  it('preserves values through BLOB encode/decode', () => {
    const v = [0.5, -0.25, 1.5, 0, 3.0];
    const restored = Array.from(blobToFloat32(float32ToBlob(v)));
    expect(restored).toHaveLength(5);
    restored.forEach((x, i) => expect(x).toBeCloseTo(v[i], 6));
  });

  it('rejects a misaligned blob length', () => {
    expect(() => blobToFloat32(new Uint8Array([1, 2, 3]))).toThrow();
  });
});
