/**
 * recurringBugs の SQL エラーパス (各関数の catch ブロック) をカバーするテスト。
 * src/drift/recurringBugs.ts の各 catch ブロック
 */
import {
  detectRegressionClusters,
  detectSpecViolationClusters,
} from '../../src/drift/recurringBugs';
import type { CaravanLogger } from '../../src/logger';
import type { CaravanDbConnection } from '../../src/db/connection/types';

function makeBrokenDb(): CaravanDbConnection {
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
    const logger: CaravanLogger = {
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
    const logger: CaravanLogger = {
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

