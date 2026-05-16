import type { Statement } from 'better-sqlite3';

/**
 * sql.js `Statement` の API サブセットを better-sqlite3 上で再現する shim。
 *
 * sql.js は `bind → step → get/getAsObject` という cursor 駆動の API を提供する。
 * better-sqlite3 は `prepare().all() / get() / iterate()` というイミディエイト
 * モデルなので、その上で cursor を仮想化する。
 *
 * 実装方針: `bind()` 時に全行を eager fetch する。better-sqlite3 の
 * `iterate()` は statement / DB を "busy" 状態にロックし、検索結果を 1 行
 * 読みながら別の write を実行するパターン (trail-db migration で頻出) で
 * 「database is busy executing a query」エラーになる。eager fetch なら
 * DB は常に idle なので衝突しない。trail-db / mcp-trail の use case は
 * いずれも結果行数が境界付きでメモリ負荷の問題は出ない。
 */
export class SqlJsCompatStatement {
  private rows: Record<string, unknown>[] = [];
  private rowIndex = 0;
  private currentRow: Record<string, unknown> | null = null;

  constructor(
    private readonly inner: Statement,
    private readonly onChanges: (n: number) => void,
  ) {
    // sql.js は prepare 直後 (bind なし) に step() を呼ぶと no-param クエリの
    // 結果が返る挙動。better-sqlite3 では bind 相当が all() なので、SELECT
    // のときは即座にパラメータなしで eager fetch しておく。bind(params) が
    // 後から呼ばれた場合はその時点で上書き fetch される。
    if (this.inner.reader) {
      try {
        this.rows = this.inner.all() as Record<string, unknown>[];
      } catch {
        // パラメータ必須のクエリは bind() で再 fetch されるためここでは空に。
        this.rows = [];
      }
    }
  }

  /**
   * パラメータをバインドして即座にクエリを実行し、全行をメモリ上にロードする。
   */
  bind(params: unknown[] = []): boolean {
    const normalized = normalizeParams(params);
    if (this.inner.reader) {
      this.rows = this.inner.all(...normalized) as Record<string, unknown>[];
    } else {
      // SELECT 以外を bind するケース (例: bind してから run を呼ぶ流れ) は、
      // step が 0 回呼ばれるだけなので空配列で OK。
      this.rows = [];
    }
    this.rowIndex = 0;
    this.currentRow = null;
    return true;
  }

  /**
   * 次の行へ進む。bind() で pre-fetch 済みの行を返す。
   * @returns 行が取得できた場合 true、終端なら false
   */
  step(): boolean {
    if (this.rowIndex < this.rows.length) {
      this.currentRow = this.rows[this.rowIndex];
      this.rowIndex += 1;
      return true;
    }
    this.currentRow = null;
    return false;
  }

  /**
   * 直近の step() で取得した行を positional value 配列で返す。
   * sql.js の `get()` 相当。
   */
  get(): unknown[] {
    if (!this.currentRow) return [];
    return Object.values(this.currentRow);
  }

  /**
   * 直近の step() で取得した行を `{ column: value }` の object で返す。
   */
  getAsObject(): Record<string, unknown> {
    return this.currentRow ? { ...this.currentRow } : {};
  }

  /**
   * cursor 状態をリセットする。pre-fetch 済みの行も破棄する。
   */
  reset(): void {
    this.rows = [];
    this.rowIndex = 0;
    this.currentRow = null;
  }

  /**
   * 解放。better-sqlite3 の Statement は GC 任せで明示的な finalize は不要なので
   * cursor 状態のクリアのみ行う。
   */
  free(): void {
    this.reset();
  }

  /**
   * INSERT/UPDATE/DELETE を一発実行する (sql.js `Statement.run` 相当)。
   * パラメータは positional のみサポート。
   */
  run(params: unknown[] = []): void {
    const info = this.inner.run(...normalizeParams(params));
    this.onChanges(info.changes);
  }
}

function normalizeParams(params: unknown[]): unknown[] {
  return params.map((p) => (p === undefined ? null : p));
}
