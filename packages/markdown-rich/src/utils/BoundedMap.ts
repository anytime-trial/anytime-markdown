/**
 * サイズ上限付き Map。上限到達時は最も古いエントリを削除する（FIFO）。
 * モジュールレベルキャッシュのメモリ無制限成長を防止するために使用。
 */
export class BoundedMap<K, V> extends Map<K, V> {
  private readonly maxSize: number;

  constructor(maxSize: number) {
    super();
    this.maxSize = maxSize;
  }

  override set(key: K, value: V): this {
    // 既存キーの更新はサイズ変化なし
    if (this.has(key)) {
      super.delete(key);
    } else if (this.size >= this.maxSize) {
      // 最も古いエントリ（先頭）を削除
      const oldest = this.keys().next().value;
      if (oldest !== undefined) {
        super.delete(oldest);
      }
    }
    super.set(key, value);
    return this;
  }
}
