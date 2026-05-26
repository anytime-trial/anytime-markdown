/** vscode.Disposable と同一形状の最小インタフェース。 */
export interface Disposable {
  dispose(): void;
}

/** 複数 Disposable をまとめて解放するヘルパー。逆順で dispose する。 */
export class DisposableStore implements Disposable {
  private readonly items: Disposable[] = [];

  add(d: Disposable): void {
    this.items.push(d);
  }

  dispose(): void {
    while (this.items.length > 0) {
      const item = this.items.pop();
      try {
        item?.dispose();
      } catch (err) {
        console.error('[DisposableStore] dispose failed', err);
      }
    }
  }
}
