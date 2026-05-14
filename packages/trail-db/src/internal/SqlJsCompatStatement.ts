import type { Statement } from 'better-sqlite3';

/**
 * sql.js `Statement` の API サブセットを better-sqlite3 上で再現する shim。
 *
 * sql.js は `bind → step → get/getAsObject` という cursor 駆動の API を提供する。
 * better-sqlite3 は `prepare().all() / get() / iterate()` というイミディエイト
 * モデルなので、その上で cursor を仮想化する。
 */
export class SqlJsCompatStatement {
  private boundParams: unknown[] = [];
  private iterator: ClosableIterator | null = null;
  private currentRow: Record<string, unknown> | null = null;

  constructor(
    private readonly inner: Statement,
    private readonly onChanges: (n: number) => void,
  ) {}

  /**
   * パラメータをバインドする。次回 step() 呼び出し時に新しい iterator が
   * 作成され、これらのパラメータが使われる。
   */
  bind(params: unknown[] = []): boolean {
    this.releaseIterator();
    this.boundParams = normalizeParams(params);
    this.currentRow = null;
    return true;
  }

  /**
   * 次の行へ進む。最初の呼び出し時に lazy に iterator を作成する。
   * @returns 行が取得できた場合 true、終端なら false
   */
  step(): boolean {
    if (!this.iterator) {
      this.iterator = this.inner.iterate(...this.boundParams) as ClosableIterator;
    }
    const next = this.iterator.next();
    if (next.done) {
      this.currentRow = null;
      this.iterator = null;
      return false;
    }
    this.currentRow = next.value as Record<string, unknown>;
    return true;
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
   * cursor 状態をリセットする。次回 step() で iterator が再作成される。
   * 既存のバインド済みパラメータは保持しない (sql.js 仕様に合わせる)。
   */
  reset(): void {
    this.releaseIterator();
    this.boundParams = [];
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

  /**
   * 進行中の iterator を closing する。better-sqlite3 の Statement は
   * iterator が exhausted されるか `.return()` が呼ばれるまで "busy" 扱いで、
   * その間は同じ statement に対する別の `.iterate()` や DB.close() がエラーになる。
   */
  private releaseIterator(): void {
    if (this.iterator && typeof this.iterator.return === 'function') {
      this.iterator.return();
    }
    this.iterator = null;
  }
}

type ClosableIterator = Iterator<unknown> & { return?: () => IteratorResult<unknown> };

function normalizeParams(params: unknown[]): unknown[] {
  return params.map((p) => (p === undefined ? null : p));
}
