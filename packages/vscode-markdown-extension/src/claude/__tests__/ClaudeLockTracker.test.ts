import { ClaudeLockTracker } from '../ClaudeLockTracker';

function makeHarness(unlockDelayMs = 3000) {
  const changes: Array<[string, boolean]> = [];
  let nextId = 1;
  const pending = new Map<number, () => void>();
  const tracker = new ClaudeLockTracker({
    unlockDelayMs,
    setTimer: (fn) => {
      const id = nextId++;
      pending.set(id, fn);
      return id;
    },
    clearTimer: (handle) => {
      pending.delete(handle as number);
    },
    onLockChange: (filePath, locked) => changes.push([filePath, locked]),
  });
  /** 現在保留中の全タイマーを発火する。 */
  const fireTimers = () => {
    const fns = [...pending.values()];
    pending.clear();
    fns.forEach((fn) => fn());
  };
  return { tracker, changes, fireTimers, pending };
}

describe('ClaudeLockTracker', () => {
  it('editing=true で即ロックし true を通知する', () => {
    const { tracker, changes } = makeHarness();
    tracker.setStatus(true, '/ws/a.md');
    expect(tracker.isLocked('/ws/a.md')).toBe(true);
    expect(changes).toEqual([['/ws/a.md', true]]);
  });

  it('editing=false は遅延後に解除し false を通知する', () => {
    const { tracker, changes, fireTimers } = makeHarness();
    tracker.setStatus(true, '/ws/a.md');
    changes.length = 0;
    tracker.setStatus(false, '/ws/a.md');
    // 遅延中はまだ解除しない。
    expect(tracker.isLocked('/ws/a.md')).toBe(true);
    expect(changes).toEqual([]);
    fireTimers();
    expect(tracker.isLocked('/ws/a.md')).toBe(false);
    expect(changes).toEqual([['/ws/a.md', false]]);
  });

  it('解除遅延中に editing=true が来ればロックを維持する (RC2 デバウンス)', () => {
    const { tracker, changes, fireTimers } = makeHarness();
    tracker.setStatus(true, '/ws/a.md');
    tracker.setStatus(false, '/ws/a.md');
    tracker.setStatus(true, '/ws/a.md'); // 解除タイマーをキャンセル
    changes.length = 0;
    fireTimers(); // 取り消し済みなので何も起きない
    expect(tracker.isLocked('/ws/a.md')).toBe(true);
    expect(changes).toEqual([]);
  });

  it('ファイルごとに独立してロック/解除する', () => {
    const { tracker, changes, fireTimers } = makeHarness();
    tracker.setStatus(true, '/ws/a.md');
    tracker.setStatus(true, '/ws/b.md');
    changes.length = 0;
    tracker.setStatus(false, '/ws/a.md');
    fireTimers();
    expect(tracker.isLocked('/ws/a.md')).toBe(false);
    expect(tracker.isLocked('/ws/b.md')).toBe(true);
    expect(changes).toEqual([['/ws/a.md', false]]);
  });

  it('dispose で保留タイマーを破棄し解除を発火しない', () => {
    const { tracker, changes, fireTimers } = makeHarness();
    tracker.setStatus(true, '/ws/a.md');
    tracker.setStatus(false, '/ws/a.md');
    changes.length = 0;
    tracker.dispose();
    fireTimers();
    expect(changes).toEqual([]);
  });
});
