import { encodeEmbedding, decodeEmbedding } from '../../src/embedding/codec';

describe('encodeEmbedding / decodeEmbedding', () => {
  it('round-trip: 1024-element Float32Array survives encode→decode byte-equal', () => {
    // Build a deterministic 1024-element array with varied values
    const original = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      original[i] = Math.sin(i) * 3.14;
    }

    const encoded = encodeEmbedding(original);
    const decoded = decodeEmbedding(encoded);

    expect(decoded.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(decoded[i]).toBe(original[i]);
    }
  });

  it('encodeEmbedding returns a safe Uint8Array copy (not a view sharing original buffer)', () => {
    const arr = new Float32Array([1.0, 2.0, 3.0]);
    const encoded = encodeEmbedding(arr);

    // Mutate the original after encoding
    arr[0] = 99.0;

    const decoded = decodeEmbedding(encoded);
    expect(decoded[0]).toBe(1.0); // encoded copy must not reflect the mutation
  });

  it('decodeEmbedding throws "embedding_blob_corrupted" when byteLength % 4 !== 0', () => {
    const corrupted = new Uint8Array([0x00, 0x01, 0x02]); // 3 bytes — not divisible by 4
    expect(() => decodeEmbedding(corrupted)).toThrow('embedding_blob_corrupted');
  });

  it('decodeEmbedding throws "embedding_blob_corrupted" for 1-byte input', () => {
    expect(() => decodeEmbedding(new Uint8Array([0xff]))).toThrow('embedding_blob_corrupted');
  });

  it('decodeEmbedding accepts empty Uint8Array (zero-length embedding)', () => {
    const result = decodeEmbedding(new Uint8Array(0));
    expect(result.length).toBe(0);
  });

  it('encodeEmbedding preserves special float values (Infinity, -Infinity, NaN)', () => {
    const special = new Float32Array([Infinity, -Infinity, NaN, 0.0]);
    const decoded = decodeEmbedding(encodeEmbedding(special));

    expect(decoded[0]).toBe(Infinity);
    expect(decoded[1]).toBe(-Infinity);
    expect(Number.isNaN(decoded[2])).toBe(true);
    expect(decoded[3]).toBe(0.0);
  });
});
