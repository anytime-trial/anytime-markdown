// Phase 6 S5-D: Newly Active Code Detection（FR-33 / FR-34）。
import { computeNewlyActive } from '../computeNewlyActive';

describe('computeNewlyActive', () => {
  test('直近 churn が閾値以上かつ期間前 churn が 0 なら真', () => {
    const [entry] = computeNewlyActive([{ filePath: 'a.ts', recentChurn: 3, priorChurn: 0 }]);
    expect(entry.newlyActive).toBe(true);
  });

  test('以前から変更され続けているファイルは偽（継続更新は新規活性ではない）', () => {
    const [entry] = computeNewlyActive([{ filePath: 'a.ts', recentChurn: 5, priorChurn: 12 }]);
    expect(entry.newlyActive).toBe(false);
  });

  test('直近 churn が閾値未満なら偽（1 コミットだけの追加を拾わない）', () => {
    const [entry] = computeNewlyActive([{ filePath: 'a.ts', recentChurn: 1, priorChurn: 0 }]);
    expect(entry.newlyActive).toBe(false);
  });

  test('直近 churn が 0 のファイルは偽（dead code 側の領域）', () => {
    const [entry] = computeNewlyActive([{ filePath: 'a.ts', recentChurn: 0, priorChurn: 0 }]);
    expect(entry.newlyActive).toBe(false);
  });

  test('閾値は上書きできる', () => {
    const [strict] = computeNewlyActive([{ filePath: 'a.ts', recentChurn: 3, priorChurn: 0 }], {
      minRecentChurn: 5,
    });
    expect(strict.newlyActive).toBe(false);

    const [lenient] = computeNewlyActive([{ filePath: 'a.ts', recentChurn: 3, priorChurn: 2 }], {
      maxPriorChurn: 2,
    });
    expect(lenient.newlyActive).toBe(true);
  });

  test('取込履歴が窓長以下なら判定しない（誤検知ガード・FR-34）', () => {
    const inputs = [{ filePath: 'a.ts', recentChurn: 10, priorChurn: 0 }];
    const guarded = computeNewlyActive(inputs, { historyDays: 20, windowDays: 30 });
    expect(guarded[0].newlyActive).toBe(false);

    const ok = computeNewlyActive(inputs, { historyDays: 200, windowDays: 30 });
    expect(ok[0].newlyActive).toBe(true);
  });

  test('取込履歴が窓長ちょうどでも判定しない（境界）', () => {
    const [entry] = computeNewlyActive([{ filePath: 'a.ts', recentChurn: 10, priorChurn: 0 }], {
      historyDays: 30,
      windowDays: 30,
    });
    expect(entry.newlyActive).toBe(false);
  });

  test('historyDays 未指定ならガードを掛けない', () => {
    const [entry] = computeNewlyActive([{ filePath: 'a.ts', recentChurn: 2, priorChurn: 0 }]);
    expect(entry.newlyActive).toBe(true);
  });

  test('入力の churn 値をそのまま保持して返す', () => {
    const [entry] = computeNewlyActive([{ filePath: 'a.ts', recentChurn: 4, priorChurn: 1 }]);
    expect(entry).toEqual({ filePath: 'a.ts', recentChurn: 4, priorChurn: 1, newlyActive: false });
  });

  test('空入力は空配列', () => {
    expect(computeNewlyActive([])).toEqual([]);
  });
});
