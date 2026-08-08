import type { SqlValue } from './types';

/**
 * better-sqlite3 は BLOB を `Buffer` で返し、sql.js は `Uint8Array` で返す。
 * 呼出側の用途 (`Float32Array` / `Uint8Array`) と両 driver の差異を吸収するため
 * `Uint8Array` に正規化する。
 *
 * Buffer は Uint8Array のサブクラスだが、Float32Array コンストラクタに
 * `new Float32Array(buffer.buffer)` のように渡すとアラインメントずれで
 * RangeError が出ることがあるため、`buffer.buffer / byteOffset / byteLength`
 * を明示的に切り出した Uint8Array に変換する。
 */
export function toUint8Array(value: SqlValue | undefined): Uint8Array {
  if (value === null || value === undefined) {
    throw new Error('toUint8Array: BLOB value is null/undefined');
  }
  if (value instanceof Uint8Array) {
    // Buffer は Uint8Array のサブクラスなので instanceof で吸収される。
    // Float32Array で安全に view を作れるよう、buffer をクローンせず byteOffset を考慮した
    // 新しい Uint8Array を返す (Buffer のときに重要)。
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new Error(`toUint8Array: expected BLOB but got ${typeof value}`);
}

/** null 許容版 */
export function toUint8ArrayOrNull(value: SqlValue | undefined): Uint8Array | null {
  if (value === null || value === undefined) return null;
  return toUint8Array(value);
}
