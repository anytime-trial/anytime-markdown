/**
 * Computes the cosine similarity between two Float32Array vectors.
 *
 * @throws 'embedding_dim_mismatch' if the vectors have different lengths.
 * @returns A number in [-1, 1], or 0 if either vector has zero norm (NaN prevention).
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('embedding_dim_mismatch');
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (normA * normB);
}
