/**
 * embedding ベクトル（Float32）と SQLite BLOB の相互変換。
 * better-sqlite3 は BLOB を `Buffer`（Uint8Array サブクラス）で返す。アラインメントずれを避けるため
 * 復元時はバイトを新しい ArrayBuffer へコピーしてから Float32Array view を作る。
 */

/** number[] を Float32 little-endian の Buffer へ。 */
export function float32ToBlob(values: readonly number[]): Buffer {
  const f32 = Float32Array.from(values);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

/** BLOB（Uint8Array/Buffer）を Float32Array へ復元する。 */
export function blobToFloat32(blob: Uint8Array): Float32Array {
  const u8 = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  if (u8.byteLength % 4 !== 0) {
    throw new Error(`blobToFloat32: byteLength ${u8.byteLength} is not a multiple of 4`);
  }
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return new Float32Array(copy.buffer);
}
