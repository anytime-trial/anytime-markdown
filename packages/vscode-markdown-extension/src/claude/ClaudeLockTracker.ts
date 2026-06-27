/**
 * Claude Code 編集ロックのファイル別状態を管理する純粋ロジック（vscode 非依存）。
 *
 * - `editing=true`: 即座にロックし、対象ファイルへ `onLockChange(filePath, true)` を通知する。
 * - `editing=false`: 連続するツール実行の谷間でバナーがちらつかないよう `unlockDelayMs` 後に解除し、
 *   `onLockChange(filePath, false)` を通知する。遅延中に `editing=true` が来れば解除をキャンセルする。
 *
 * ロックは「アクティブなパネル」ではなくファイル単位で保持するため、ロック対象が前面でない
 * タイミングで解除イベントが来ても取りこぼさない（呼び出し側がファイルのパネルへ直接配信する）。
 */
export type TimerHandle = unknown;

export interface ClaudeLockTrackerOptions {
  /** editing=false 観測後、ロック解除を確定するまでの遅延 (ms)。 */
  readonly unlockDelayMs: number;
  /** タイマー登録（テスト注入用に抽象化）。 */
  readonly setTimer: (fn: () => void, ms: number) => TimerHandle;
  /** タイマー解除（テスト注入用に抽象化）。 */
  readonly clearTimer: (handle: TimerHandle) => void;
  /** ロック状態が変化した（または再同期すべき）ファイルを通知する。 */
  readonly onLockChange: (filePath: string, locked: boolean) => void;
}

export class ClaudeLockTracker {
  private readonly locked = new Set<string>();
  private readonly timers = new Map<string, TimerHandle>();

  constructor(private readonly opts: ClaudeLockTrackerOptions) {}

  /** 指定ファイルが現在ロック中か。 */
  isLocked(filePath: string): boolean {
    return this.locked.has(filePath);
  }

  /** Claude の編集状態通知を反映する。 */
  setStatus(editing: boolean, filePath: string): void {
    if (editing) {
      this.cancelTimer(filePath);
      this.locked.add(filePath);
      // 既にロック済みでも、対象パネルが後から開かれた場合に同期できるよう毎回通知する。
      this.opts.onLockChange(filePath, true);
      return;
    }
    // editing=false は直後に true へ戻り得るため、遅延後に解除を確定する。
    this.cancelTimer(filePath);
    const handle = this.opts.setTimer(() => {
      this.timers.delete(filePath);
      if (this.locked.delete(filePath)) {
        this.opts.onLockChange(filePath, false);
      }
    }, this.opts.unlockDelayMs);
    this.timers.set(filePath, handle);
  }

  /** 保留中の解除タイマーをすべて破棄する。 */
  dispose(): void {
    for (const handle of this.timers.values()) this.opts.clearTimer(handle);
    this.timers.clear();
  }

  private cancelTimer(filePath: string): void {
    const handle = this.timers.get(filePath);
    if (handle !== undefined) {
      this.opts.clearTimer(handle);
      this.timers.delete(filePath);
    }
  }
}
