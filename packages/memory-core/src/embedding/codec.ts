/**
 * Encodes a Float32Array into a Uint8Array (safe copy of the underlying bytes).
 * The resulting bytes can be stored directly as a SQLite BLOB.
 */
export function encodeEmbedding(arr: Float32Array): Uint8Array {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength).slice();
}

/**
 * Decodes a Uint8Array (SQLite BLOB) back into a Float32Array.
 *
 * @throws 'embedding_blob_corrupted' if buf.byteLength is not a multiple of 4.
 */
export function decodeEmbedding(buf: Uint8Array): Float32Array {
  if (buf.byteLength % 4 !== 0) {
    throw new Error('embedding_blob_corrupted');
  }
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
