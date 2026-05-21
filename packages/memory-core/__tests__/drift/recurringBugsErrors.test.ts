/**
 * recurringBugs の SQL エラーパス (各関数の catch ブロック) をカバーするテスト。
 * src/drift/recurringBugs.ts L32-35, L96-99, L145-148
 */
import {
  detectRegressionClusters,
  detectSpecViolationClusters,
  detectRecurringRootCauses,
} from '../../src/drift/recurringBugs';
import type { MemoryLogger } from '../../src/logger';
import type { MemoryDbConnection } from '../../src/db/connection/types';

function makeBrokenDb(): MemoryDbConnection {
  return {
    exec: () => { throw new Error('DB read failed'); },
    run: () => { throw new Error('DB write failed'); },
    execMany: () => { throw new Error('DB execMany failed'); },
    prepare: () => { throw new Error('DB prepare failed'); },
    getRowsModified: () => 0,
    pragma: () => null,
    attach: () => {},
    detach: () => {},
    close: () => {},
    serialize: () => Buffer.alloc(0),
  };
}

describe('detectRegressionClusters - SQL エラーパス', () => {
  it('exec で例外が発生したとき空配列を返す', () => {
    const errors: string[] = [];
    const logger: MemoryLogger = {
      info: () => {},
      error: (msg: string) => { errors.push(msg); },
    };

    const result = detectRegressionClusters({
      db: makeBrokenDb(),
      logger,
    });

    expect(result).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('[detectRegressionClusters]');
  });
});

describe('detectSpecViolationClusters - SQL エラーパス', () => {
  it('exec で例外が発生したとき空配列を返す', () => {
    const errors: string[] = [];
    const logger: MemoryLogger = {
      info: () => {},
      error: (msg: string) => { errors.push(msg); },
    };

    const result = detectSpecViolationClusters({
      db: makeBrokenDb(),
      logger,
    });

    expect(result).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('[detectSpecViolationClusters]');
  });
});

describe('detectRecurringRootCauses - SQL エラーパス', () => {
  it('exec で例外が発生したとき空配列を返す', () => {
    const errors: string[] = [];
    const logger: MemoryLogger = {
      info: () => {},
      error: (msg: string) => { errors.push(msg); },
    };

    const result = detectRecurringRootCauses({
      db: makeBrokenDb(),
      logger,
    });

    expect(result).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('[detectRecurringRootCauses]');
  });
});
